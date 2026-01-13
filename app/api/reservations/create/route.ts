import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey);
}

async function getOrCreateGuestCustomerId(supabase: any, restaurantId: string) {
  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("name", "Guest")
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await supabase
    .from("customers")
    .insert({ restaurant_id: restaurantId, name: "Guest", phone: "" })
    .select("id")
    .single();

  if (createErr) throw createErr;
  return created.id as string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const restaurantId = body.restaurantId as string;
    const userId = body.userId as string;
    const tableId = body.tableId as string;

    const partySize = Number(body.partySize);
    const startISO = body.startISO as string;
    const endISO = body.endISO as string;

    const source = (body.source as string) || "phone";
    const notes = (body.notes as string) || null;

    const supabase = getSupabaseAdmin();

    const customerId = await getOrCreateGuestCustomerId(supabase, restaurantId);

    const { error: insErr } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      customer_id: customerId,
      table_id: tableId,
      party_size: partySize,
      start_time: startISO,
      end_time: endISO,
      source,
      status: "confirmed",
      notes,
      created_by: userId
    });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
