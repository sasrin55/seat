import Link from "next/link";
import AvailabilityClient from "./AvailabilityClient";

export default function AvailabilityPage() {
  return (
    <main style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Availability</h1>
        <Link href="/host" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
          Back to Floor
        </Link>
      </header>

      <div style={{ marginTop: 14 }}>
        <AvailabilityClient />
      </div>
    </main>
  );
}
