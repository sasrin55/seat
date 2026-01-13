// app/host/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import FloorClient from "./FloorClient";

type TableRow = {
  id: string;
  label: string;
  capacity: number;
  pos_x: number | null;
  pos_y: number | null;
};

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  party_size: number;
  status: string;
  source: string;
  notes: string | null;
  meal: string | null;
  spend_pkr: number | null;
  customers: { id: string; name: string | null; phone: string }[] | null;
  tables: { id: string; label: string; capacity: number }[] | null;
};

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
function toISO(d: Date) {
  return d.toISOString();
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function bucket(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "no_show") return "no_show";
  if (s === "completed") return "completed";
  if (s === "seated") return "seated";
  return "confirmed";
}

export default async function HostConsolePage() {
  const supabase = supabaseServer();
  const now = new Date();

  const restaurantId = "4c08b577-cd30-40e8-9c5b-ca9755899d5e";
  const userId = "9fcd27ac-280d-4831-bc01-094ea96054bc";

  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const [{ data: tables }, { data: reservations }] = await Promise.all([
    supabase
      .from("tables")
      .select("id,label,capacity,pos_x,pos_y")
      .eq("restaurant_id", restaurantId)
      .order("label", { ascending: true }),

    supabase
      .from("reservations")
      .select(
        `
        id,
        start_time,
        end_time,
        party_size,
        status,
        source,
        notes,
        meal,
        spend_pkr,
        customers(id,name,phone),
        tables(id,label,capacity)
      `
      )
      .eq("restaurant_id", restaurantId)
      .gte("start_time", toISO(dayStart))
      .lte("start_time", toISO(dayEnd))
      .order("start_time", { ascending: true }),
  ]);

  const allTables = (tables ?? []) as unknown as TableRow[];
  const todays = (reservations ?? []) as unknown as ReservationRow[];

  const upcoming = todays.filter(
    (r) => bucket(r.status) === "confirmed" && new Date(r.start_time) > now
  );
  const seated = todays.filter((r) => bucket(r.status) === "seated");
  const completed = todays.filter((r) => bucket(r.status) === "completed");
  const noShows = todays.filter((r) => bucket(r.status) === "no_show");

  const floorHeight = 720;

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <TopBar now={now} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 14,
          marginTop: 14,
        }}
      >
        <aside
          style={{
            border: "1px solid #e8e8e8",
            borderRadius: 14,
            padding: 12,
            height: floorHeight,
            overflow: "auto",
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16 }}>Reservations</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{todays.length} today</div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill label={"Upcoming " + upcoming.length} />
            <Pill label={"Seated " + seated.length} />
            <Pill label={"Completed " + completed.length} />
            <Pill label={"No shows " + noShows.length} />
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <Link href="/reservations/new">New reservation</Link>
            <span style={{ opacity: 0.4 }}>|</span>
            <Link href="/tables">Tables</Link>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              Today's book
            </div>

            {todays.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No reservations today yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {todays.map((r) => {
                  const c = r.customers?.[0];
                  const t = r.tables?.[0];
                  const time = fmtTime(new Date(r.start_time));
                  return (
                    <div
                      key={r.id}
                      style={{
                        border: "1px solid #efefef",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>
                          {time} {" - "} {r.party_size}
                          {t?.label ? " - " + t.label : ""}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{bucket(r.status)}</div>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.9 }}>
                        {c?.name || "Guest"} {c?.phone ? "(" + c.phone + ")" : ""}
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <MiniTag label={r.meal || "meal"} />
                        <MiniTag label={r.source || "source"} />
                        <MiniTag label={r.spend_pkr ? "PKR " + r.spend_pkr : "Spend n/a"} />
                        {r.notes ? <MiniTag label={r.notes} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section
          style={{
            border: "1px solid #e8e8e8",
            borderRadius: 14,
            background: "#fbfbfb",
            height: floorHeight,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              zIndex: 2,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#22c55e",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12, opacity: 0.8 }}>Live</span>
          </div>

          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              gap: 8,
              fontSize: 12,
              zIndex: 2,
            }}
          >
            <LegendDot label="Available" color="#22c55e" />
            <LegendDot label="Reserved" color="#f59e0b" />
            <LegendDot label="Seated" color="#3b82f6" />
            <LegendDot label="Dirty" color="#a3a3a3" />
          </div>

          <FloorClient restaurantId={restaurantId} userId={userId} tables={allTables} todays={todays} />
        </section>
      </div>
    </main>
  );
}

function TopBar({ now }: { now: Date }) {
  return (
    <header
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 14,
        padding: "12px 14px",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Host Console</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          {now.toLocaleDateString()} {" - "} {fmtTime(now)}
        </div>
      </div>

      <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
        <Link href="/host">Floor</Link>
        <Link href="/today">Today list</Link>
        <Link href="/customers">Guests</Link>
        <Link href="/settings">Settings</Link>
      </nav>
    </header>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 999,
        padding: "6px 10px",
        background: "#fafafa",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function MiniTag({ label }: { label: string }) {
  return (
    <span
      style={{
        border: "1px solid #eee",
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      {label}
    </span>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.85 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}
