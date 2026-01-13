"use client";

import { useMemo, useState } from "react";

// --- Types & Constants ---
export type TableRow = {
  id: string; label: string; capacity: number; pos_x: number | null; pos_y: number | null;
};

export type ReservationRow = {
  id: string; start_time: string; end_time: string; party_size: number;
  status: string; source: string; notes: string | null; meal: string | null;
  spend_pkr: number | null; customers: { name: string | null }[] | null;
  tables: { id: string }[] | null;
};

const STATUS_COLORS = {
  available: "#22c55e",
  reserved: "#f59e0b",
  seated: "#3b82f6",
  dirty: "#a3a3a3",
};

// --- Helper Functions ---
const getBucket = (status: string) => (status || "").toLowerCase();

const formatTime = (dateStr: string) => 
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Logic to determine table status based on current time and reservation window
 */
function computeTableState(now: Date, table: TableRow, reservations: ReservationRow[]) {
  const nowMs = now.getTime();
  const twelveHoursMs = 12 * 60 * 60 * 1000;

  const relevantRes = reservations
    .filter((r) => {
      const isThisTable = r.tables?.some(t => t.id === table.id);
      const b = getBucket(r.status);
      if (!isThisTable || b === "cancelled" || b === "no_show") return false;

      const start = new Date(r.start_time).getTime();
      const end = new Date(r.end_time).getTime();
      return start <= nowMs + twelveHoursMs && end >= nowMs - twelveHoursMs;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const current = relevantRes.find((r) => {
    const start = new Date(r.start_time).getTime();
    const end = new Date(r.end_time).getTime();
    return start <= nowMs && end > nowMs;
  });

  const next = relevantRes.find((r) => 
    new Date(r.start_time).getTime() > nowMs && getBucket(r.status) === "confirmed"
  );

  let state: keyof typeof STATUS_COLORS = "available";
  if (current) {
    const b = getBucket(current.status);
    state = b === "seated" ? "seated" : b === "completed" ? "dirty" : "reserved";
  } else if (next) {
    state = "reserved";
  }

  return { state, current, next };
}

// --- Sub-Components ---
const LegendDot = ({ label, color }: { label: string; color: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
    {label}
  </span>
);

// --- Main Component ---
export default function FloorClient({ restaurantId, userId, tables, todays }: {
  restaurantId: string; userId: string; tables: TableRow[]; todays: ReservationRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const tableData = useMemo(() => 
    tables.map((t) => ({ table: t, ...computeTableState(now, t, todays) })), 
    [now, tables, todays]
  );

  const selected = tableData.find((x) => x.table.id === selectedId);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "720px" }}>
      {/* Header / Legend */}
      <Header />

      {/* Floor Map */}
      <div style={{ position: "relative", width: 1100, height: 720 }}>
        {tableData.map((data) => (
          <TableCard 
            key={data.table.id} 
            data={data} 
            isSelected={selectedId === data.table.id}
            onSelect={setSelectedId}
          />
        ))}
      </div>

      {/* Side Panel */}
      {selected && (
        <SidePanel 
          selected={selected} 
          onClose={() => setSelectedId(null)} 
          context={{ restaurantId, userId }} 
        />
      )}
    </div>
  );
}

// --- UI Parts ---
function Header() {
  return (
    <>
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#22c55e" }} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>Live</span>
      </div>
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 10, fontSize: 12, opacity: 0.85 }}>
        {Object.entries(STATUS_COLORS).map(([label, color]) => (
          <LegendDot key={label} label={label.charAt(0).toUpperCase() + label.slice(1)} color={color} />
        ))}
      </div>
    </>
  );
}

function TableCard({ data, isSelected, onSelect }: { data: any, isSelected: boolean, onSelect: (id: string) => void }) {
  const { table, state, current, next } = data;
  const color = STATUS_COLORS[state as keyof typeof STATUS_COLORS];
  const spend = current?.spend_pkr || next?.spend_pkr;
  const guestName = current?.customers?.[0]?.name || next?.customers?.[0]?.name;

  return (
    <button
      onClick={() => onSelect(table.id)}
      style={{
        all: "unset", cursor: "pointer", position: "absolute",
        transform: `translate(${table.pos_x ?? 60}px, ${table.pos_y ?? 60}px)`,
        width: 140, height: 96, borderRadius: 16, background: "white", padding: 10,
        border: isSelected ? `2px solid ${color}` : "1px solid #e8e8e8",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <b style={{ fontWeight: 900 }}>{table.label}</b>
        <span style={{ opacity: 0.6 }}>cap {table.capacity}</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusBadge state={state} color={color} />
        {spend && <SpendBadge amount={spend} />}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {guestName || (next ? `Next ${formatTime(next.start_time)}` : "Free")}
      </div>
    </button>
  );
}

const StatusBadge = ({ state, color }: { state: string, color: string }) => (
  <span style={{ 
    padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
    background: `${color}1A`, border: `1px solid ${color}44`, color 
  }}>
    {state.toUpperCase()}
  </span>
);

const SpendBadge = ({ amount }: { amount: number }) => (
  <span style={{ padding: "2px 6px", borderRadius: 999, background: "#111827", color: "white", fontSize: 10, fontWeight: 900 }}>
    PKR {Math.round(amount)}
  </span>
);

function SidePanel({ selected, onClose, context }: any) {
  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: "100%", background: "white", borderLeft: "1px solid #ddd", padding: 20, zIndex: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Table {selected.table.label}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <p>Capacity: {selected.table.capacity}</p>
      <div style={{ fontSize: 11, color: "#666", marginTop: 40 }}>
        ID: {context.restaurantId} | User: {context.userId}
      </div>
    </div>
  );
}
