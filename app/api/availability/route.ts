import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const restaurantId = searchParams.get("restaurantId");
  const start = searchParams.get("start"); // ISO string
  const partySizeRaw = searchParams.get("partySize");
  const durationMinutesRaw = searchParams.get("durationMinutes") || "120";

  if (!restaurantId || !start || !partySizeRaw) {
    return NextResponse.json({ error: "Missing restaurantId/start/partySize" }, { status: 400 });
  }

  const partySize = Number(partySizeRaw);
  const durationMinutes = Number(durationMinutesRaw);

  const startTime = new Date(start);
  const endTime = addMinutes(startTime, durationMinutes);

  const supabase = supabaseServer();

  // 1) get all tables that can fit party size
  const { data: tables, error: tErr } = await supabase
    .from("tables")
    .select("id,label,capacity,pos_x,pos_y")
    .eq("restaurant_id", restaurantId)
    .gte("capacity", partySize)
    .order("capacity", { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const tableIds = (tables ?? []).map((t) => t.id);
  if (tableIds.length === 0) return NextResponse.json({ available: [], blocked: [] });

  // 2) find reservations that overlap that time window
  // overlap rule: existing.start < new.end AND existing.end > new.start
  const { data: conflicts, error: cErr } = await supabase
    .from("reservations")
    .select("id, table_id, start_time, end_time, status, party_size")
    .eq("restaurant_id", restaurantId)
    .in("table_id", tableIds)
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString())
    .not("status", "in", "(cancelled,no_show)");

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const conflictByTable = new Map<string, any[]>();
  for (const r of conflicts ?? []) {
    const list = conflictByTable.get(r.table_id) ?? [];
    list.push(r);
    conflictByTable.set(r.table_id, list);
  }

  const available = [];
  const blocked = [];

  for (const t of tables ?? []) {
    const hits = conflictByTable.get(t.id) ?? [];
    if (hits.length === 0) available.push(t);
    else blocked.push({ table: t, conflicts: hits });
  }

  return NextResponse.json({
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    partySize,
    durationMinutes,
    available,
    blocked
  });
}
