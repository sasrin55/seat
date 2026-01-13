"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type TableRow = {
  id: string;
  label: string;
  capacity: number;
  pos_x: number | null;
  pos_y: number | null;
};

export type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  party_size: number;
  status: string;
  source: string;
  notes: string | null;
  meal: string | null;
  spend_pkr: number | null;
  customers: { id: string; name: string | null; phone: string | null }[] | null;
  tables: { id: string; label: string; capacity: number }[] | null;
};

type Props = {
  restaurantId: string;
  userId: string;
  tables: TableRow[];
  todays: ReservationRow[];
};

type TableState = "available" | "reserved" | "seated" | "dirty";

const TURN_MINUTES = 120;

function bucket(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "no_show") return "no_show";
  if (s === "completed") return "completed";
  if (s === "seated") return "seated";
  return "confirmed";
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromISOorLocal(dt: string) {
  const d = new Date(dt);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}

function computeTableState(now: Date, t: TableRow, res: ReservationRow[]) {
  const overlaps = res
    .filter((r) => {
      const rt = r.tables?.[0];
      if (!rt || rt.id !== t.id) return false;

      const b = bucket(r.status);
      if (b === "cancelled" || b === "no_show") return false;

      const rs = new Date(r.start_time);
      const re = new Date(r.end_time);

      return rs <= addMinutes(now, 12 * 60) && re >= addMinutes(now, -12 * 60);
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const current = overlaps.find((r) => {
    const b = bucket(r.status);
    if (b !== "seated" && b !== "confirmed" && b !== "completed") return false;
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

export default function FloorClient({ restaurantId, userId, tables, todays }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const now = useMemo(() => new Date(), []);
  const tableModels = useMemo(() => {
    return tables.map((t) => {
      const m = computeTableState(now, t, todays);
      return { table: t, ...m };
    });
  }, [now, tables, todays]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("");

  const [partySize, setPartySize] = useState<number>(2);
  const [startLocal, setStartLocal] = useState<string>(toLocalInputValue(new Date()));
  const [source, setSource] = useState<string>("phone");
  const [notes, setNotes] = useState<string>("");

  const [guestName, setGuestName] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const newParam = searchParams.get("new");
    const dtParam = searchParams.get("dt");
    const sizeParam = searchParams.get("size");
    const tableParam = searchParams.get("tableId");

    const shouldOpen = newParam === "1" || !!dtParam || !!sizeParam || !!tableParam;
    if (!shouldOpen) return;

    setDrawerOpen(true);

    if (tableParam) setSelectedTableId(tableParam);

    if (sizeParam) {
      const n = parseInt(sizeParam, 10);
      if (!Number.isNaN(n) && n > 0) setPartySize(n);
    }

    if (dtParam) {
      const d = fromISOorLocal(dtParam);
      setStartLocal(toLocalInputValue(d));
    }
  }, [searchParams]);

  function closeDrawer() {
    setDrawerOpen(false);
    setError("");
    router.replace("/host");
  }

  function openDrawerWithTable(id: string) {
    setSelectedTableId(id);
    setDrawerOpen(true);
    setError("");
  }

  async function createReservation() {
    setError("");
    if (!selectedTableId) {
      setError("Pick a table first");
      return;
    }

    const t = tables.find((x) => x.id === selectedTableId);
    if (!t) {
      setError("Invalid table selected");
      return;
    }

    if (partySize < 1) {
      setError("Party size must be at least 1");
      return;
    }

    if (partySize > t.capacity) {
      setError("Party size exceeds table capacity");
      return;
    }

    const start = new Date(startLocal);
    if (Number.isNaN(start.getTime())) {
      setError("Invalid date/time");
      return;
    }

    const end = addMinutes(start, TURN_MINUTES);

    setSaving(true);
    try {
      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          userId,
          tableId: selectedTableId,
          partySize,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          source,
          notes,
          guestName,
          guestPhone
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to create reservation");
      }

      closeDrawer();
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create reservation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "relative", width: 1100, height: 720 }}>
        {tableModels.map(({ table, state, current, next }) => {
          const x = table.pos_x ?? 60;
          const y = table.pos_y ?? 60;

          const color =
            state === "available" ? "#22c55e" : state === "reserved" ? "#f59e0b" : state === "seated" ? "#3b82f6" : "#a3a3a3";

          const spendLabel = current?.spend_pkr ?? next?.spend_pkr ?? null;
          const guest = current?.customers?.[0]?.name || next?.customers?.[0]?.name || null;

          const isSelected = selectedTableId === table.id;

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => openDrawerWithTable(table.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                position: "absolute",
                transform: `translate(${x}px, ${y}px)`,
                width: 140,
                height: 96,
                borderRadius: 16,
                border: isSelected ? `2px solid ${color}` : "1px solid #e8e8e8",
                background: "white",
                boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                padding: 10
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 900 }}>{table.label}</div>
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
                    fontWeight: 800
                  }}
                >
                  {state}
                </span>

                {spendLabel ? (
                  <span style={{ padding: "4px 8px", borderRadius: 999, background: "#111827", color: "white", fontSize: 12, fontWeight: 900 }}>
                    PKR {Math.round(Number(spendLabel))}
                  </span>
                ) : null}
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {guest ? guest : next ? `Next ${fmtTime(new Date(next.start_time))}` : "Free"}
              </div>
            </button>
          );
        })}
      </div>

      {drawerOpen ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 420,
            height: "100%",
            background: "white",
            borderLeft: "1px solid #e8e8e8",
            padding: 14,
            overflow: "auto"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>New reservation</div>
            <button type="button" onClick={closeDrawer} style={{ border: "1px solid #e8e8e8", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}>
              Close
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            Table
          </div>

          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            style={{ width: "100%", border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px", marginTop: 6 }}
          >
            <option value="">Select a table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} (cap {t.capacity})
              </option>
            ))}
          </select>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Party size
              <input
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value || "1", 10)))}
                type="number"
                min={1}
                style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Date and time
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Source
              <select value={source} onChange={(e) => setSource(e.target.value)} style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }}>
                <option value="phone">phone</option>
                <option value="walkin">walkin</option>
                <option value="app">app</option>
                <option value="whatsapp">whatsapp</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Guest name (optional)
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }} />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Guest phone (optional)
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }} />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px", height: 90 }} />
            </label>

            {error ? <div style={{ color: "#dc2626", fontWeight: 800, fontSize: 13 }}>{error}</div> : null}

            <button
              type="button"
              onClick={createReservation}
              disabled={saving}
              style={{
                marginTop: 6,
                width: "100%",
                border: "0",
                borderRadius: 12,
                padding: "12px 14px",
                background: "#111827",
                color: "white",
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? "Saving..." : "Create reservation"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
