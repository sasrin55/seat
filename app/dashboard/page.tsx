import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

type Res = {
  id: string;
  start_time: string;
  end_time: string;
  party_size: number;
  status: string;
  source: string;
  meal: string | null;
  spend_pkr: number | null;
  customers: { id: string; name: string | null; phone: string }[] | null;
  tables: { id: string; label: string; capacity: number }[] | null;
};

type CustomerAgg = {
  customer_id: string;
  total_visits: number;
  avg_spend_pkr: number | null;
};

export default async function DashboardPage() {
  const supabase = supabaseServer();

  const nowISO = new Date().toISOString();
  const todayStart = startOfTodayISO();
  const todayEnd = endOfTodayISO();

  const [{ data: todayRes }, { data: tables }] = await Promise.all([
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
        customers(id,name,phone),
        tables(id,label,capacity)
      `)
      .gte("start_time", todayStart)
      .lte("start_time", todayEnd)
      .order("start_time", { ascending: true }),

    supabase
      .from("tables")
      .select("id,label,capacity,is_active")
      .eq("is_active", true)
      .order("label", { ascending: true })
  ]);

  const reservations = ((todayRes ?? []) as unknown as Res[]).filter(
    (r) => r.status !== "cancelled"
  );

  const allTables =
    (tables ?? []) as { id: string; label: string; capacity: number; is_active: boolean }[];

  const busyTableIds = new Set<string>();
  const nextAvailableByTable = new Map<string, string>();

  for (const r of reservations) {
    const t = r.tables?.[0];
    if (!t) continue;
    const overlapsNow = new Date(r.start_time) <= new Date(nowISO) && new Date(r.end_time) > new Date(nowISO);
    if (overlapsNow) {
      busyTableIds.add(t.id);
      const prev = nextAvailableByTable.get(t.id);
      if (!prev || new Date(r.end_time) < new Date(prev)) {
        nextAvailableByTable.set(t.id, r.end_time);
      }
    }
  }

  const availableNow = allTables.filter((t) => !busyTableIds.has(t.id));
  const busyNow = allTables.filter((t) => busyTableIds.has(t.id));

  const nextTableAvailable = (() => {
    let best: { label: string; timeISO: string } | null = null;
    for (const t of busyNow) {
      const timeISO = nextAvailableByTable.get(t.id);
      if (!timeISO) continue;
      if (!best || new Date(timeISO) < new Date(best.timeISO)) {
        best = { label: t.label, timeISO };
      }
    }
    return best;
  })();

  return (
    <main>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Link href="/reservations/new">New Reservation</Link>
        <Link href="/tables">Tables</Link>
        <Link href="/customers">Customers</Link>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2>Today</h2>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div><strong>Reservations today</strong></div>
            <div>{reservations.length}</div>
          </div>
          <div>
            <div><strong>Tables available now</strong></div>
            <div>{availableNow.length} / {allTables.length}</div>
          </div>
          <div>
            <div><strong>Next table available</strong></div>
            <div>
              {nextTableAvailable
                ? `${nextTableAvailable.label} at ${new Date(nextTableAvailable.timeISO).toLocaleTimeString()}`
                : "All tables currently available"}
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Reservations today</h2>

        {reservations.length === 0 ? (
          <p>No reservations today yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {reservations.map((r) => {
              const c = r.customers?.[0];
              const t = r.tables?.[0];

              const time = new Date(r.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={r.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{time} · Party {r.party_size}</strong>
                    <span>{r.status}</span>
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <div><strong>Customer</strong> {c?.name || "Guest"} {c?.phone ? `(${c.phone})` : ""}</div>
                    <div><strong>Table</strong> {t?.label || "Unassigned"}</div>
                    <div><strong>Meal</strong> {r.meal || "Not set"}</div>
                    <div><strong>Avg spend</strong> {r.spend_pkr ? `PKR ${r.spend_pkr}` : "Not set"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Tables available now</h2>
        {availableNow.length === 0 ? (
          <p>No tables available right now.</p>
        ) : (
          <ul>
            {availableNow.map((t) => (
              <li key={t.id}>
                {t.label} (cap {t.capacity})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
