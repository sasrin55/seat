"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type AvailabilityResponse = {
  start: string;
  end: string;
  partySize: number;
  durationMinutes: number;
  available: { id: string; label: string; capacity: number }[];
  blocked: {
    table: { id: string; label: string; capacity: number };
    conflicts: { id: string; start_time: string; end_time: string; status: string; party_size: number }[];
  }[];
};

export default function AvailabilityClient() {
  const restaurantId = "4c08b577-cd30-40e8-9c5b-ca9755899d5e";

  const [partySize, setPartySize] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [start, setStart] = useState<string>(toLocalInputValue(new Date()));
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);

    try {
      const url = `/api/availability?restaurantId=${encodeURIComponent(restaurantId)}&start=${encodeURIComponent(
        new Date(start).toISOString()
      )}&partySize=${partySize}&durationMinutes=${durationMinutes}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "Failed to check availability");

      setData(json as AvailabilityResponse);
    } catch (e: any) {
      setErr(e?.message || "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14 }}>
      <section style={{ border: "1px solid #e8e8e8", borderRadius: 14, background: "white", padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Check a slot</div>

        <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Date & time</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e8e8e8", marginTop: 6 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Party size</label>
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e8e8e8", marginTop: 6 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Duration (min)</label>
            <input
              type="number"
              min={30}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e8e8e8", marginTop: 6 }}
            />
          </div>
        </div>

        <button
          onClick={run}
          disabled={loading}
          style={{
            marginTop: 14,
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Checking..." : "Check availability"}
        </button>

        {err ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{err}</div> : null}
      </section>

      <section style={{ border: "1px solid #e8e8e8", borderRadius: 14, background: "white", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 900 }}>Results</div>
          {data ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {data.available.length} available · {data.blocked.length} blocked
            </div>
          ) : null}
        </div>

        {!data ? (
          <div style={{ marginTop: 12, opacity: 0.7 }}>Run a check to see tables.</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Available</div>
              <div style={{ display: "grid", gap: 8 }}>
                {data.available.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>{t.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>cap {t.capacity}</div>
                  </div>
                ))}
                {data.available.length === 0 ? <div style={{ opacity: 0.7 }}>No tables available.</div> : null}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Blocked</div>
              <div style={{ display: "grid", gap: 8 }}>
                {data.blocked.map((x) => (
                  <div key={x.table.id} style={{ border: "1px solid #fee2e2", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>{x.table.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>cap {x.table.capacity}</div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>Conflicts: {x.conflicts.length}</div>
                  </div>
                ))}
                {data.blocked.length === 0 ? <div style={{ opacity: 0.7 }}>Nothing blocked.</div> : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
