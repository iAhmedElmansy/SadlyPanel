import { NextResponse } from "next/server";
import { findOrderByUuid, markOrderFailed } from "@/lib/services/payments";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/cancel
 *
 * The gateway sends the buyer here when they abandon an automatic checkout
 * (?order=<uuid>). The pending order is marked cancelled (unless it was already
 * activated by a racing webhook — activation stays sticky) and the buyer is
 * returned to billing with a cancel notice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderUuid = url.searchParams.get("order") ?? "";

  const order = await findOrderByUuid(orderUuid);
  if (order) await markOrderFailed(order.id, "cancelled");

  return NextResponse.redirect(`${env.appUrl}/dashboard/billing?status=cancel`);
}
