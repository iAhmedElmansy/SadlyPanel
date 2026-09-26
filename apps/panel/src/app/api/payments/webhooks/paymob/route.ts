import { NextResponse } from "next/server";
import {
  activatePaymentOrder,
  findOrderByGatewayRef,
  findOrderByUuid,
  getPaymentSettings,
  verifyPaymobHmac,
} from "@/lib/services/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhooks/paymob
 *
 * Paymob "transaction processed" callback. The HMAC arrives as a `?hmac=` query
 * param (and/or in the body); it is verified over an ordered subset of the
 * transaction object. On a successful transaction the matching order is
 * activated. Configure this URL as the processed callback in the Paymob
 * integration settings.
 */
export async function POST(request: Request) {
  const settings = await getPaymentSettings();
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const received = hmac ?? (body.hmac as string | undefined) ?? null;
  if (!verifyPaymobHmac(body, received, settings.paymob.hmac)) {
    return NextResponse.json({ error: "Invalid HMAC." }, { status: 400 });
  }

  const obj = (body.obj as Record<string, unknown>) ?? {};
  const success = obj.success === true || obj.success === "true";
  const order = (obj.order as { id?: unknown; merchant_order_id?: unknown }) ?? {};

  if (success) {
    let found = order.id ? await findOrderByGatewayRef(String(order.id)) : null;
    if (!found && order.merchant_order_id) found = await findOrderByUuid(String(order.merchant_order_id));
    if (found) await activatePaymentOrder(found.id);
  }

  return NextResponse.json({ received: true });
}
