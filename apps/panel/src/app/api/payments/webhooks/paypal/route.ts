import { NextResponse } from "next/server";
import {
  activatePaymentOrder,
  findOrderByGatewayRef,
  getPaymentSettings,
  isPaypalOrderCompleted,
} from "@/lib/services/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhooks/paypal
 *
 * PayPal webhook safety net. Rather than trusting the notification body, the
 * referenced PayPal order id is pulled from the event and its status is
 * re-checked authoritatively against the PayPal REST API with our own
 * credentials before the matching order is activated. Idempotent: activating an
 * already-activated order is a no-op.
 *
 * Handles both order-level events (CHECKOUT.ORDER.*, resource.id is the order)
 * and capture events (PAYMENT.CAPTURE.*, the order id is nested under
 * resource.supplementary_data.related_ids.order_id).
 */
export async function POST(request: Request) {
  const settings = await getPaymentSettings();

  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = (await request.json()) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const type = event.event_type ?? "";
  const resource = event.resource ?? {};
  let paypalOrderId = "";
  if (type.startsWith("CHECKOUT.ORDER")) {
    paypalOrderId = String(resource.id ?? "");
  } else if (type.startsWith("PAYMENT.CAPTURE")) {
    const supplementary = resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined;
    paypalOrderId = String(supplementary?.related_ids?.order_id ?? "");
  }

  if (paypalOrderId) {
    const order = await findOrderByGatewayRef(paypalOrderId);
    if (order && (await isPaypalOrderCompleted(paypalOrderId, settings))) {
      await activatePaymentOrder(order.id);
    }
  }

  return NextResponse.json({ received: true });
}
