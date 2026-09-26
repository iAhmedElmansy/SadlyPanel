import { NextResponse } from "next/server";
import {
  activatePaymentOrder,
  capturePaypalOrder,
  findOrderByUuid,
  getPaymentSettings,
  isStripeSessionPaid,
} from "@/lib/services/payments";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/return
 *
 * Buyers are redirected here by the gateway after an automatic checkout
 * (?order=<uuid>&method=<method>). We confirm payment server-side where we can
 * and activate immediately for a snappy UX; the webhook remains the
 * authoritative safety net.
 *   - Stripe: verify the Checkout Session is paid, then activate.
 *   - PayPal: capture the approved order (?token is the PayPal order id), then activate.
 *   - Paymob: the processed callback activates; land the buyer on the pending banner.
 */
function billing(status: string): NextResponse {
  return NextResponse.redirect(`${env.appUrl}/dashboard/billing?status=${status}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderUuid = url.searchParams.get("order") ?? "";
  const method = url.searchParams.get("method") ?? "";

  const order = await findOrderByUuid(orderUuid);
  if (!order) return billing("cancel");
  if (order.status === "activated") return billing("success");

  const settings = await getPaymentSettings();

  try {
    if (method === "stripe") {
      if (order.gatewayRef && (await isStripeSessionPaid(order.gatewayRef, settings))) {
        await activatePaymentOrder(order.id);
      }
      // Stripe only redirects here after completion; the webhook finalizes if the
      // read-side check lagged. Either way, show the "being activated" banner.
      return billing("success");
    }

    if (method === "paypal") {
      const token = url.searchParams.get("token") || order.gatewayRef || "";
      if (token && (await capturePaypalOrder(token, settings))) {
        await activatePaymentOrder(order.id);
        return billing("success");
      }
      return billing("cancel");
    }

    // Paymob and any other automatic gateway: activation happens on the webhook.
    return billing("success");
  } catch {
    // Payment may still succeed via webhook — don't mark it failed here.
    return billing("success");
  }
}
