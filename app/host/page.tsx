import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import FloorClient from "./FloorClient";

// Types
export type TableRow = {
  id: string; label: string; capacity: number; pos_x: number | null; pos_y: number | null;
};

export type ReservationRow = {
  id: string; start_time: string; end_time: string; party_size: number;
  status: string; source: string; notes: string | null; meal: string | null;
  spend_pkr: number | null;
  customers: { id: string; name: string | null; phone: string }[] | null;
  tables: { id: string; label: string; capacity: number }[] | null;
};

// Helpers
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const bucket = (s: string) => {
  const status = (s || "").toLowerCase();
  if (["cancelled", "no_show", "completed", "seated"].includes(status)) return status;
  return "confirmed";
};

export default async function HostConsolePage({ searchParams }: { searchParams: { new?: string } }) {
  const supabase = supabaseServer();
  const now = new Date();
  const restaurantId = "4c08b577-cd30-40e8-9c5b-ca9755899d5e";
  const userId = "9fcd27ac-280d-4831-bc01-094ea96054bc";

  const [{ data: tables }, { data: reservations }] = await Promise.all([
    supabase.from("tables").select("id,label,capacity,pos_x,pos_y")
      .eq("restaurant_id", restaurantId).order("label", { ascending: true }),
    supabase.from("reservations").select(`id, start_time, end_time, party_size, status, source, notes, meal, spend_pkr, customers(id,name,phone), tables(id,label,capacity)`)
      .eq("restaurant_id", restaurantId)
      .gte("start_time", startOfDay(now).toISOString())
      .lte("start_time", endOfDay(now).toISOString())
      .order("start_time", { ascending: true }),
  ]);

  const allTables = (tables ?? []) as TableRow[];
  const todays = (reservations ?? []) as ReservationRow[];

  // Stats
  const stats = {
    upcoming: todays.filter(r => bucket(r.status) === "confirmed" && new Date(r.start_time) > now).length,
    seated: todays.filter(r => bucket(r.status) === "seated").length,
    completed: todays.filter(r => bucket(r.status) === "completed").length,
    noShows: todays.filter(r => bucket(r.status) === "no_show").length,
  };

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", backgroundColor: "#f9fafb", minHeight: "100vh" }}>
      <TopBar now={now} />

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14, marginTop: 14 }}>
        {/* Sidebar: Today's Book */}
        <aside style={{ border: "1px solid #e8e8e8", borderRadius: 14, padding: 16, height: 720, overflow: "auto", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Reservations</h2>
            <span style={{ opacity: 0.6, fontSize: 12 }}>{todays.length} today</span>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill label={`Upcoming ${stats.upcoming}`} />
            <Pill label={`Seated ${stats.seated}`} />
            <Pill label={`Completed ${stats.completed}`} />
            <Pill label={`No shows ${stats.noShows}`} />
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, fontSize: 14 }}>
            <Link href="/host?new=1" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>New reservation</Link>
            <span style={{ opacity: 0.3 }}>|</span>
            <Link href="/tables" style={{ color: "#666", textDecoration: "none" }}>Tables</Link>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Today's book</h3>
            {todays.length === 0 ? (
              <p style={{ opacity: 0.5, fontSize: 13 }}>No reservations yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {todays.map((r) => (
                  <ReservationCard key={r.id} res={r} />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Section: Floor Plan */}
        <section style={{ border: "1px solid #e8e8e8", borderRadius: 14, background: "#fbfbfb", height: 720, position: "relative", overflow: "hidden" }}>
          <FloorClient 
            restaurantId={restaurantId} 
            userId={userId} 
            tables={allTables} 
            todays={todays} 
            isNewFromUrl={!!searchParams.new} 
          />
        </section>
      </div>
    </main>
  );
}

// --- Internal UI Components ---

function ReservationCard({ res }: { res: ReservationRow }) {
  const customer = res.customers?.[0];
  const table = res.tables?.[0];
  return (
    <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 12, backgroundColor: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>{fmtTime(new Date(res.start_time))} - {res.party_size}p {table ? `(${table.label})` : ""}</div>
        <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 800, opacity: 0.5 }}>{bucket(res.status)}</div>
      </div>
      <div style={{ marginTop: 4, fontSize: 13 }}>{customer?.name || "Guest"}</div>
      <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {res.meal && <MiniTag label={res.meal} />}
        {res.spend_pkr && <MiniTag label={`PKR ${res.spend_pkr}`} />}
        {res.notes && <MiniTag label={res.notes} />}
      </div>
    </div>
  );
}

function TopBar({ now }: { now: Date }) {
  return (
    <header style={{ border: "1px solid #e8e8e8", borderRadius: 14, padding: "12px 20px", background: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontWeight: 900, fontSize: 20, margin: 0 }}>Host Console</h1>
        <div style={{ opacity: 0.5, fontSize: 12 }}>{now.toLocaleDateString()} — {fmtTime(now)}</div>
      </div>
      <nav style={{ display: "flex", gap: 20, fontSize: 14, fontWeight: 500 }}>
        <Link href="/host" style={{ textDecoration: "none", color: "#000" }}>Floor</Link>
        <Link href="/today" style={{ textDecoration: "none", color: "#666" }}>Today list</Link>
        <Link href="/customers" style={{ textDecoration: "none", color: "#666" }}>Guests</Link>
        <Link href="/settings" style={{ textDecoration: "none", color: "#666" }}>Settings</Link>
      </nav>
    </header>
  );
}

const Pill = ({ label }: { label: string }) => (
  <span style={{ border: "1px solid #e8e8e8", borderRadius: 999, padding: "4px 12px", background: "#fff", fontSize: 12, fontWeight: 600 }}>{label}</span>
);

const MiniTag = ({ label }: { label: string }) => (
  <span style={{ border: "1px solid #eee", borderRadius: 4, padding: "2px 6px", fontSize: 11, background: "#f9fafb", color: "#666" }}>{label}</span>
);
