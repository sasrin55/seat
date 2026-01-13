import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

const TURN_MINUTES = 120;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function toISO(d: Date) {
  return d.toISOString();
}

type TableRow = {
  id: string;
  label: string;
  capacity: number;
  is_active: boolean;
};

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  party_size: number;
  status: string;
  source: string;
  meal: string | null;
  spend_pkr: number | null;
  notes: string | null;
  customers: { id: string; name: string | null; phone: string }[] | null;
  tables: { id: string; label: string; capacity: number }[] | null;
};

type CustomerHistory = {
  customer_id: string;
  visits: number;
  no_shows: number;
  avg_spend: number | null;
  last_visit: string | null;
};

function statusBucket(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "no_show") return "no_show";
  if (s === "completed") return "completed";
  if (s === "seated") return "seated";
  return "confirmed";
}

function likelyToShowLabel(history: CustomerHistory | undefined, r: ReservationRow, now: Date) {
  let p = 0.9;

  const start = new Date(r.start_time);
  const minutesToStart = (start.getTime() - now.getTime()) / 60000;

  const visits = history?.visits ?? 0;
  const noShows = history?.no_shows ?? 0;

  if (noShows >= 1) p -= 0.25;
  if (minutesToStart < 60) p -= 0.1;
  if (r.party_size >= 6) p -= 0.1;
  if (visits >= 2) p += 0.1;

  if (p >= 0.85) return "High";
  if (p >= 0.7) return "Medium";
  return "Low";
}

export default async function TodayPage() {
  const supabase = supabaseServer();

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const restaurantId = "4c08b577-cd30-40e8-9c5b-ca9755899d5e";

  const [{ data: resToday }, { data: tables }] = await Promise.all([
    supabase
      .from("reservations")
      .select(`
        id,
        start_time,
        end_time,
        party_size,
        status,
        source,
        meal,
        spend_pkr,
        notes,
        customers(id,name,phone),
        tables(id,label,capacity)
      `)
      .eq("restaurant_id", restaurantId)
      .gte("start_time", toISO(dayStart))
      .lte("start_time", toISO(dayEnd))
      .order("start_time", { ascending: true }),

    supabase
      .from("tables")
      .select("id,label,capacity,is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("label", { ascending: true })
  ]);

  const today = (resToday ?? []) as unknown as ReservationRow[];
  const allTables = (tables ?? []) as unknown as TableRow[];

  const activeRes = today.filter((r) => statusBucket(r.status) !== "cancelled");
  const coversToday = activeRes.reduce((sum, r) => sum + (r.party_size || 0), 0);

  const seatedNow = activeRes.filter((r) => {
    const s = statusBucket(r.status);
    if (s !== "seated") return false;
    const start = new Date(r.start_time);
    const end = new Date(r.end_time);
    return start <= now && end > now;
  });

  const upcoming = activeRes.filter((r) => {
    const s = statusBucket(r.status);
    return s === "confirmed" && new Date(r.start_time) > now;
  });

  const completed = activeRes.filter((r) => statusBucket(r.status) === "completed");
  const noShows = activeRes.filter((r) => statusBucket(r.status) === "no_show");

  const busyTableIds = new Set<string>();
  const nextFreeISOByTable = new Map<string, string>();

  for (const r of activeRes) {
    const t = r.tables?.[0];
    if (!t) continue;

    const s = statusBucket(r.status);
    if (s === "cancelled") continue;

    const start = new Date(r.start_time);
    const end = new Date(r.end_time);

    const overlapsNow = start <= now && end > now && (s === "confirmed" || s === "seated" || s === "completed");
    if (overlapsNow) {
      busyTableIds.add(t.id);
      const prev = nextFreeISOByTable.get(t.id);
      if (!prev || new Date(end) < new Date(prev)) nextFreeISOByTable.set(t.id, toISO(end));
    }
  }

  const availableNow = allTables.filter((t) => !busyTableIds.has(t.id));
  const busyNow = allTables.filter((t) => busyTableIds.has(t.id));

  const nextTableFree = (() => {
    let best: { label: string; time: Date } | null = null;
    for (const t of busyNow) {
      const iso = nextFreeISOByTable.get(t.id);
      if (!iso) continue;
      const time = new Date(iso);
      if (!best || time < best.time) best = { label: t.label, time };
    }
    return best;
  })();

  const customerIds = Array.from(
    new Set(
      activeRes
        .map((r) => r.customers?.[0]?.id)
        .filter((x): x is string => typeof x === "string")
    )
  );

  const historyMap = new Map<string, CustomerHistory>();

  if (customerIds.length > 0) {
    const { data: hist } = await supabase
      .from("reservations")
      .select("customer_id,status,spend_pkr,start_time")
      .eq("restaurant_id", restaurantId)
      .in("customer_id", customerIds);

    const rows = (hist ?? []) as unknown as { customer_id: string; status: string; spend_pkr: number | null; start_time: string }[];

    const agg = new Map<string, { visits: number; no_shows: number; spendSum: number; spendCount: number; lastVisit: string | null }>();

    for (const r of rows) {
      const s = statusBucket(r.status);
      const cur = agg.get(r.customer_id) ?? { visits: 0, no_shows: 0, spendSum: 0, spendCount: 0, lastVisit: null };

      if (s === "completed") cur.visits += 1;
      if (s === "no_show") cur.no_shows += 1;

      if (typeof r.spend_pkr =_
