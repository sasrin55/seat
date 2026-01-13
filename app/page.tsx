import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function DashboardPage() {
  const supabase = supabaseServer();

  const { data: upcoming } = await supabase
    .from("reservations")
    .select("id,start_time,end_time,party_size,status,source,notes,customers(name,phone),tables(label)")
    .order("start_time", { ascending: true })
    .limit(20);

  return (
    <main>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <Link href="/reservations/new">New Reservation</Link>
        <Link href="/tables">Tables</Link>
        <Link href="/customers">Customers</Link>
      </div>

      <h2 style={{ marginTop: 24 }}>Upcoming Reservations</h2>

      {!upcoming || upcoming.length === 0 ? (
        <p>No reservations yet.</p>
      ) : (
        <ul>
          {upcoming.map((r) => (
            <li key={r.id}>
              {new Date(r.start_time).toLocaleString()} —{" "}
              {r.customers?.name || "Guest"} ({r.party_size})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
