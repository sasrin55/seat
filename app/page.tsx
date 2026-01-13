import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Restaurant MVP</h1>
      <p>Host dashboard for bookings, tables, and customers.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/reservations/new">New Reservation</Link>
        <Link href="/tables">Tables</Link>
        <Link href="/customers">Customers</Link>
      </div>
    </main>
  );
}
