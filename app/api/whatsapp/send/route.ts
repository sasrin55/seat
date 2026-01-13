import { NextResponse } from "next/server";
import Twilio from "twilio";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, message } = body as { to?: string; message?: string };

    if (!to || !message) {
      return NextResponse.json({ error: "Missing to or message" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !whatsappNumber) {
      return NextResponse.json(
        { error: "Missing Twilio env vars (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)" },
        { status: 500 }
      );
    }

    const client = Twilio(accountSid, authToken);

    const result = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${to}`,
      body: message
    });

    return NextResponse.json({ success: true, sid: result.sid });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send WhatsApp message" }, { status: 500 });
  }
}
