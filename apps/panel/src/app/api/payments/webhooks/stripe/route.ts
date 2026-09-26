import { NextResponse } from "next/server";
import {
  activatePaymentOrder,
  findOrderByGatewayRef,
  findOrderByUuid,
  getPaymentSettings,
  verifyStripeSignature,
} from "@/lib/services/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhooks/stripe
 *
 * Verifies the Stripe-Signature over the raw body, then activates the order on
 * `checkout.session.completed` when the session is paid. Idempotent.
 */
export async function POST(request: Request) {
  const settings = await getPaymentSettings();
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(rawBody, signature, settings.stripe.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object ?? {};
    const paid = session.payment_status === "paid" || session.status === "complete";
    const clientRef = session.client_reference_id as string | undefined;

    if (paid) {
      let order = await findOrderByGatewayRef(String(session.id ?? ""));
      if (!order && clientRef) order = await findOrderByUuid(clientRef);
      if (order) await activatePaymentOrder(order.id);
    }
  }

  return NextResponse.json({ received: true });
}
