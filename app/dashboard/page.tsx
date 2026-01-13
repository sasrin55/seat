import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  party_size: number;
  status: string;
  source: string;
  notes: string | null;
  customers: { name: string | null; phone: string | null }[] | null;
  tables: { label: string | null }[] | null;
};

export default async function DashboardPage() {
  const supabase = supabaseServer();

  const { data } = await supabase
    .from("reservations")
    .select(`
      id,
      start_time,
      end_time,
      party_size,
      status,
      source,
      notes,
      customers(name, phone),
      tables(label)
    `)
    .order("start_time", { ascending: true })
    .limit(20);

  const upcoming = (data ?? []) as unknown as ReservationRow[];

  return (
    <main>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Link href="/reservations/new">New Reservation</Link>
        <Link href="/tables">Tables</Link>
        <Link href="/customers">Customers</Link>
      </div>

      <h2 style={{ marginTop: 24 }}>Upcoming Reservations</h2>

      {upcoming.length === 0 ? (
        <p>No reservations yet.</p>
      ) : (
        <ul>
          {upcoming.map((r) => {
            const c = r.customers?.[0];
            const t = r.tables?.[0];

            return (
              <li key={r.id}>
                {new Date(r.start_time).toLocaleString()} —{" "}
                {c?.name || "Guest"} ({r.party_size})
                {t?.label ? ` · Table ${t.label}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
