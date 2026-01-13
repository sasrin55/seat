import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const required = ["restaurant_id", "table_id", "party_size", "start_time", "end_time", "source", "created_by"];
    for (const k of required) {
      if (!body?.[k]) return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { error } = await supabase.from("reservations").insert({
      restaurant_id: body.restaurant_id,
      table_id: body.table_id,
      customer_id: null,
      party_size: Number(body.party_size),
      start_time: body.start_time,
      end_time: body.end_time,
      source: body.source,
      status: "confirmed",
      notes: body.notes ?? null,
      created_by: body.created_by,
      created_at: new Date().toISOString()
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
