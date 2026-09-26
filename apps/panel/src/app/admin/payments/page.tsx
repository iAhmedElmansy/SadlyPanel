import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { PaymentReview } from "./payment-review";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "bad" | "info"> = {
  pending: "warn",
  awaiting_review: "info",
  paid: "info",
  activated: "ok",
  rejected: "bad",
  failed: "bad",
  cancelled: "neutral",
};

const METHOD_LABEL: Record<string, string> = {
  paymob: "Paymob",
  stripe: "Stripe",
  paypal: "PayPal",
  vodafone_cash: "Vodafone Cash",
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const orders = await prisma.paymentOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      plan: { select: { name: true } },
      user: { select: { username: true, email: true } },
    },
  });

  const pendingReview = orders.filter((o) => o.method === "vodafone_cash" && o.status === "awaiting_review");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payments</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every checkout attempt. Automatic gateways activate on a verified webhook; Vodafone Cash payments wait here for
          your review.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Awaiting review"
          description="Manual Vodafone Cash payments. Check the receipt, then approve to activate the plan or reject."
          action={<Badge tone={pendingReview.length ? "info" : "neutral"}>{pendingReview.length} pending</Badge>}
        />
        <CardBody className="space-y-4">
          {pendingReview.length === 0 ? (
            <EmptyState icon={<Wallet className="size-5" />} title="Nothing to review" description="Manual payments will appear here." />
          ) : (
            pendingReview.map((order) => (
              <PaymentReview
                key={order.id}
                order={{
                  id: order.id,
                  user: order.user.username,
                  email: order.user.email,
                  plan: order.plan.name,
                  amount: formatPrice(order.amountCents, order.currency, "once"),
                  senderPhone: order.senderPhone,
                  proofImagePath: order.proofImagePath,
                  createdAt: order.createdAt.toISOString(),
                }}
              />
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="All orders" description="Newest first (last 200)." />
        <CardBody className="overflow-x-auto">
          {orders.length === 0 ? (
            <EmptyState icon={<Wallet className="size-5" />} title="No payments yet" description="Orders appear once customers check out." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-dim">
                  <th className="px-2 py-2 font-medium">Customer</th>
                  <th className="px-2 py-2 font-medium">Plan</th>
                  <th className="px-2 py-2 font-medium">Method</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-line-soft">
                    <td className="px-2 py-2">
                      <div className="text-ink">{order.user.username}</div>
                      <div className="text-xs text-ink-dim">{order.user.email}</div>
                    </td>
                    <td className="px-2 py-2 text-ink-muted">{order.plan.name}</td>
                    <td className="px-2 py-2 text-ink-muted">{METHOD_LABEL[order.method] ?? order.method}</td>
                    <td className="px-2 py-2 text-ink-muted">{formatPrice(order.amountCents, order.currency, "once")}</td>
                    <td className="px-2 py-2">
                      <Badge tone={STATUS_TONE[order.status] ?? "neutral"}>{order.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-2 py-2 text-xs text-ink-dim">{order.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
