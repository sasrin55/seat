import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      restaurantId,
      startISO,
      endISO,
      partySize
    } = body;

    const supabase = supabaseAdmin();

    // 1. Get tables that can fit party size
    const { data: tables, error: tablesErr } = await supabase
      .from("tables")
      .select("id,label,capacity")
      .eq("restaurant_id", restaurantId)
      .gte("capacity", partySize);

    if (tablesErr) throw tablesErr;

    if (!tables || tables.length === 0) {
      return NextResponse.json({ available: [] });
    }

    const tableIds = tables.map(t => t.id);

    // 2. Find conflicting reservations
    const { data: conflicts, error: conflictErr } = await supabase
      .from("reservations")
      .select("table_id")
      .in("table_id", tableIds)
      .neq("status", "cancelled")
      .lt("start_time", endISO)
      .gt("end_time", startISO);

    if (conflictErr) throw conflictErr;

    const blocked = new Set((conflicts || []).map(r => r.table_id));

    // 3. Return only available tables
    const available = tables.filter(t => !blocked.has(t.id));

    return NextResponse.json({ available });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Availability check failed" },
      { status: 500 }
    );
  }
}
