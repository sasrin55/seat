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

      if (typeof r.spend_pkr === "number") {
        cur.spendSum += r.spend_pkr;
        cur.spendCount += 1;
      }

      if (!cur.lastVisit || new Date(r.start_time) > new Date(cur.lastVisit)) cur.lastVisit = r.start_time;

      agg.set(r.customer_id, cur);
    }

    for (const [cid, a] of agg.entries()) {
      historyMap.set(cid, {
        customer_id: cid,
        visits: a.visits,
        no_shows: a.no_shows,
        avg_spend: a.spendCount > 0 ? Math.round(a.spendSum / a.spendCount) : null,
        last_visit: a.lastVisit
      });
    }
  }

  function nextAvailableForParty(partySize: number) {
    const candidates = allTables.filter((t) => t.capacity >= partySize);
    if (candidates.length === 0) return null;

    const searchStart = new Date(now);
    searchStart.setSeconds(0, 0);

    const searchEnd = addMinutes(searchStart, 6 * 60);

    for (let t = new Date(searchStart); t <= searchEnd; t = addMinutes(t, 30)) {
      const slotStart = t;
      const slotEnd = addMinutes(t, TURN_MINUTES);

      const ok = candidates.some((table) => {
        const overlaps = activeRes.some((r) => {
          const rt = r.tables?.[0];
          if (!rt || rt.id !== table.id) return false;

          const s = statusBucket(r.status);
          if (s === "cancelled" || s === "no_show") return false;

          const rs = new Date(r.start_time);
          const re = new Date(r.end_time);

          return rs < slotEnd && re > slotStart;
        });

        return !overlaps;
      });

      if (ok) return slotStart;
    }

    return null;
  }

  const next2 = nextAvailableForParty(2);
  const next4 = nextAvailableForParty(4);
  const next6 = nextAvailableForParty(6);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Today</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            {now.toLocaleDateString()} · {fmtTime(now)}
          </div>
        </div>

        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/today">Today</Link>
          <Link href="/tables">Floor</Link>
          <Link href="/reservations/new">New Reservation</Link>
          <Link href="/customers">Guests</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>

      <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        <Kpi title="Covers" value={coversToday} />
        <Kpi title="Reservations" value={activeRes.length} />
        <Kpi title="Seated now" value={seatedNow.length} />
        <Kpi title="Upcoming" value={upcoming.length} />
        <Kpi title="Available tables" value={`${availableNow.length}/${allTables.length}`} />
        <Kpi
          title="Next free"
          value={nextTableFree ? `${nextTableFree.label} ${fmtTime(nextTableFree.time)}` : "Now"}
        />
      </section>

      <section style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Kpi title="Next for 2" value={next2 ? fmtTime(next2) : "None"} />
        <Kpi title="Next for 4" value={next4 ? fmtTime(next4) : "None"} />
        <Kpi title="Next for 6" value={next6 ? fmtTime(next6) : "None"} />
      </section>

      <section style={{ marginTop: 22, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div>
          <h2 style={{ margin: "0 0 10px 0" }}>Today’s book</h2>

          {activeRes.length === 0 ? (
            <p>No reservations today yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {activeRes.map((r) => {
                const c = r.customers?.[0];
                const t = r.tables?.[0];
                const hist = c?.id ? historyMap.get(c.id) : undefined;

                const time = fmtTime(new Date(r.start_time));
                const repeat = (hist?.visits ?? 0) >= 2;

                const likely = likelyToShowLabel(hist, r, now);
                const avgSpend = hist?.avg_spend ?? null;

                return (
                  <div key={r.id} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>
                        {time} · Party {r.party_size}
                        {t?.label ? ` · ${t.label}` : ""}
                      </strong>
                      <span style={{ opacity: 0.8 }}>{statusBucket(r.status)}</span>
                    </div>

                    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                      <div>
                        <strong>Guest</strong> {c?.name || "Guest"} {c?.phone ? `(${c.phone})` : ""}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9 }}>
                        <Tag label={repeat ? "Repeat" : "New"} />
                        <Tag label={`Likely ${likely}`} />
                        <Tag label={r.meal ? r.meal : "meal unknown"} />
                        <Tag label={avgSpend ? `Avg PKR ${avgSpend}` : "Avg spend n/a"} />
                        <Tag label={r.source ? r.source : "source n/a"} />
                        {r.notes ? <Tag label={r.notes} /> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ margin: "0 0 10px 0" }}>Live</h2>

          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div><strong>Available now</strong> {availableNow.length}</div>
              <div><strong>Busy now</strong> {busyNow.length}</div>
              <div><strong>Completed</strong> {completed.length}</div>
              <div><strong>No shows</strong> {noShows.length}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>Available tables</strong>
              {availableNow.length === 0 ? (
                <p style={{ marginTop: 6 }}>None right now</p>
              ) : (
                <ul style={{ marginTop: 6 }}>
                  {availableNow.slice(0, 10).map((t) => (
                    <li key={t.id}>
                      {t.label} (cap {t.capacity})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Kpi(props: { title: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}>
      <div style={{ opacity: 0.75, fontSize: 12 }}>{props.title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{props.value}</div>
    </div>
  );
}

function Tag(props: { label: string }) {
  return (
    <span
      style={{
        border: "1px solid #ddd",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 12
      }}
    >
      {props.label}
    </span>
  );
}

