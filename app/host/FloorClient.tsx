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
  expected_arrival_time?: string | null;
  actual_arrival_time?: string | null;
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

function computeTableState(now: Date, t: TableRow, res: ReservationRow[]) {
  const overlaps = res
    .filter((r) => {
      const rt = r.tables?.[0];
      if (!rt || rt.id !== t.id) return false;

      const b = bucket(r.status);
      if (b === "cancelled" || b === "no_show") return false;

      const rs = new Date(r.start_time);
      const re = new Date(r.end_time);

      return (
        rs <= new Date(now.getTime() + 1000 * 60 * 60 * 12) &&
        re >= new Date(now.getTime() - 1000 * 60 * 60 * 12)
      );
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

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [draftPartySize, setDraftPartySize] = useState<number>(2);
  const [draftStartISO, setDraftStartISO] = useState<string>("");

  const now = useMemo(() => new Date(), []);
  const tableModels = useMemo(() => {
    return tables.map((t) => {
      const m = computeTableState(now, t, todays);
      return { table: t, ...m };
    });
  }, [now, tables, todays]);

  const selected = useMemo(() => {
    if (!selectedTableId) return null;
    return tableModels.find((x) => x.table.id === selectedTableId) || null;
  }, [tableModels, selectedTableId]);

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
      if (!Number.isNaN(n) && n > 0) setDraftPartySize(n);
    }

    if (dtParam) {
      setDraftStartISO(dtParam);
    }
  }, [searchParams]);

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedTableId(null);
    router.replace("/host");
  }

  function openDrawerForTable(tableId: string) {
    setSelectedTableId(tableId);
    setDrawerOpen(true);
  }

  const showDrawer = drawerOpen && !!selected;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#22c55e", display: "inline-block" }} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>Live</span>
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 10, fontSize: 12, opacity: 0.85 }}>
        <LegendDot label="Available" color="#22c55e" />
        <LegendDot label="Reserved" color="#f59e0b" />
        <LegendDot label="Seated" color="#3b82f6" />
        <LegendDot label="Dirty" color="#a3a3a3" />
      </div>

      <div style={{ position: "relative", width: 1100, height: 720 }}>
        {tableModels.map(({ table, state, current, next }) => {
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
          const guestName = current?.customers?.[0]?.name || next?.customers?.[0]?.name || null;

          const isSelected = selectedTableId === table.id;

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => openDrawerForTable(table.id)}
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
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#111827",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 900
                    }}
                  >
                    PKR {Math.round(Number(spendLabel))}
                  </span>
                ) : null}
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {guestName ? guestName : next ? `Next ${fmtTime(new Date(next.start_time))}` : "Free"}
              </div>
            </button>
          );
        })}
      </div>

      {showDrawer ? (
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
            <button
              type="button"
              onClick={closeDrawer}
              style={{ border: "1px solid #e8e8e8", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            Table <b>{selected!.table.label}</b> · Capacity <b>{selected!.table.capacity}</b>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Party size
              <input
                value={draftPartySize}
                onChange={(e) => setDraftPartySize(Math.max(1, parseInt(e.target.value || "1", 10)))}
                type="number"
                min={1}
                style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Start time (ISO for now)
              <input
                value={draftStartISO}
                onChange={(e) => setDraftStartISO(e.target.value)}
                placeholder="2026-01-13T20:00:00.000Z"
                style={{ border: "1px solid #e8e8e8", borderRadius: 12, padding: "10px 12px" }}
              />
            </label>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              This drawer now opens when you
              <br />
              1) click a table, or
              <br />
              2) visit /host?new=1&amp;tableId=...&amp;dt=...&amp;size=...
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              restaurantId: {restaurantId}
              <br />
              userId: {userId}
            </div>

            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
              Next: we’ll wire “Create reservation” to an API route that creates or finds a customer, then inserts the reservation with a real customer_id.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}
