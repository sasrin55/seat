"use client";

import { useMemo, useState, useTransition } from "react";

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

type Props = {
  restaurantId: string;
  userId: string;
  tables: TableRow[];
  todays: ReservationRow[];
};

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

type TableState = "available" | "reserved" | "seated" | "dirty";

function computeTableState(now: Date, tableId: string, reservations: ReservationRow[]) {
  const overlaps = reservations
    .filter((r) => r.tables?.[0]?.id === tableId)
    .filter((r) => {
      const b = bucket(r.status);
      return b !== "cancelled" && b !== "no_show";
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const current = overlaps.find((r) => {
    const rs = new Date(r.start_time);
    const re = new Date(r.end_time);
    return rs <= now && re > now;
  });

  const next = overlaps.find((r) => new Date(r.start_time) > now && bucket(r.status) === "confirmed");

  if (current) {
    const b = bucket(current.status);
    if (b === "seated") return { state: "seated" as TableState, current, next };
    if (b === "completed") return { state: "dirty" as TableState, current, next };
    return { state: "reserved" as TableState, current, next };
  }

  if (next) return { state: "reserved" as TableState, current: null, next };
  return { state: "available" as TableState, current: null, next: null };
}

function toLocalDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FloorClient({ restaurantId, userId, tables, todays }: Props) {
  const now = new Date();

  const [selected, setSelected] = useState<TableRow | null>(null);
  const [partySize, setPartySize] = useState<number>(2);
  const [startTime, setStartTime] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(Math.max(12, d.getHours()));
    return toLocalDateTimeValue(d);
  });
  const [source, setSource] = useState<string>("phone");
  const [notes, setNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  const models = useMemo(() => {
    return tables.map((t) => ({ table: t, ...computeTableState(now, t.id, todays) }));
  }, [tables, todays]);

  async function createReservation() {
    if (!selected) return;
    setError("");

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      setError("Invalid time");
      return;
    }
    const end = new Date(start.getTime() + 120 * 60 * 1000);

    startTransition(async () => {
      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_id: selected.id,
          party_size: partySize,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          source,
          notes: notes || null,
          created_by: userId
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Failed to create reservation");
        return;
      }

      window.location.reload();
    });
  }

  const floorWidth = 1100;
  const floorHeight = 720;

  return (
    <div style={{ position: "relative", width: "100%", height: floorHeight }}>
      <div style={{ position: "relative", width: floorWidth, height: floorHeight }}>
        {models.map(({ table, state, current, next }) => {
          const x = table.pos_x ?? 60;
          const y = table.pos_y ?? 60;

          const color =
            state === "available"
              ? "#22c55e"
              : state === "reserved"
              ? "#f59e0b"
              : state === "seated"
              ? "#3b82f6"
              : "#a3a3a3";

          const spendLabel = current?.spend_pkr ?? next?.spend_pkr ?? null;
          const label = current?.customers?.[0]?.name || next?.customers?.[0]?.name || (next ? `Next ${fmtTime(new Date(next.start_time))}` : "Free");

          const isSelected = selected?.id === table.id;

          return (
            <button
              key={table.id}
              onClick={() => {
                setSelected(table);
                setPartySize(Math.min(2, table.capacity));
                setError("");
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                position: "absolute",
                transform: `translate(${x}px, ${y}px)`,
                width: 120,
                height: 88,
                borderRadius: 16,
                border: isSelected ? `2px solid ${color}` : "1px solid #e8e8e8",
                background: "white",
                boxShadow: isSelected ? "0 0 0 4px rgba(0,0,0,0.04)" : "0 1px 0 rgba(0,0,0,0.03)",
                padding: 10
              }}
              title="Click to make a reservation"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800 }}>{table.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>cap {table.capacity}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: `${color}1A`,
                    border: `1px solid ${color}55`,
                    color,
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  {state}
                </span>

                {spendLabel ? (
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#111827",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    PKR {spendLabel}
                  </span>
                ) : null}
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {label}
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            height: floorHeight,
            width: 340,
            borderLeft: "1px solid #e8e8e8",
            background: "white",
            padding: 14
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>New reservation</div>
            <button
              onClick={() => setSelected(null)}
              style={{ border: "1px solid #eee", borderRadius: 10, padding: "6px 10px", cursor: "pointer", background: "#fafafa" }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
            Table <b>{selected.label}</b> · Capacity <b>{selected.capacity}</b>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Party size
              <input
                type="number"
                min={1}
                max={selected.capacity}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, Math.min(selected.capacity, Number(e.target.value) || 1)))}
                style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: "8px 10px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Start time
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: "8px 10px" }}
              />
              <div style={{ fontSize: 12, opacity: 0.7 }}>Duration fixed at 2 hours</div>
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Source
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: "8px 10px" }}
              >
                <option value="phone">phone</option>
                <option value="walkin">walkin</option>
                <option value="whatsapp">whatsapp</option>
                <option value="app">app</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: "8px 10px", resize: "vertical" }}
              />
            </label>

            {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}

            <button
              onClick={createReservation}
              disabled={isPending}
              style={{
                border: "1px solid #111827",
                background: "#111827",
                color: "white",
                borderRadius: 12,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: "pointer",
                opacity: isPending ? 0.7 : 1
              }}
            >
              {isPending ? "Creating..." : "Create reservation"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
