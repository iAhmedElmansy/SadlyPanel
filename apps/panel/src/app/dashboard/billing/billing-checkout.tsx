"use client";

import { useActionState, useState } from "react";
import { Check, CreditCard, Cpu, HardDrive, MemoryStick, Database, Network, Save, Smartphone } from "lucide-react";
import { startCheckoutAction, submitVodafoneCashAction, type CheckoutState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Input } from "@/components/ui/form";
import { cn, formatCpu, formatMib, formatPrice } from "@/lib/utils";

interface PlanCard {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingCycle: string;
  memory: number;
  disk: number;
  cpu: number;
  databaseLimit: number;
  allocationLimit: number;
  backupLimit: number;
}

interface MethodOption {
  method: string;
  label: string;
  automatic: boolean;
}

interface RecentOrder {
  id: number;
  plan: string;
  method: string;
  status: string;
  createdAt: string;
  rejectionReason: string | null;
}

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "bad" | "info"> = {
  pending: "warn",
  awaiting_review: "info",
  paid: "info",
  activated: "ok",
  rejected: "bad",
  failed: "bad",
  cancelled: "neutral",
};

export function BillingCheckout({
  plans,
  methods,
  vodafone,
  preselectPlanId,
  status,
  currentPlan,
  recentOrders,
}: {
  plans: PlanCard[];
  methods: MethodOption[];
  vodafone: { phone: string; instructions: string };
  preselectPlanId: number | null;
  status: string | null;
  currentPlan: { name: string; expiresAt: string | null } | null;
  recentOrders: RecentOrder[];
}) {
  const initialPlan = plans.find((p) => p.id === preselectPlanId)?.id ?? plans[0]?.id ?? null;
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(initialPlan);
  const [method, setMethod] = useState<string>(methods[0]?.method ?? "");
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const isVodafone = method === "vodafone_cash";

  // __BODY__
  const [checkoutState, checkout] = useActionState<CheckoutState, FormData>(startCheckoutAction, {});
  const [vodafoneState, vodafoneSubmit] = useActionState<CheckoutState, FormData>(submitVodafoneCashAction, {});

  const specs = (plan: PlanCard) => [
    { icon: MemoryStick, label: formatMib(plan.memory) + " RAM" },
    { icon: HardDrive, label: formatMib(plan.disk) + " disk" },
    { icon: Cpu, label: formatCpu(plan.cpu) + " CPU" },
    { icon: Database, label: `${plan.databaseLimit} databases` },
    { icon: Network, label: `${plan.allocationLimit} ports` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Billing</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose a plan and pay to activate it on your account.</p>
      </div>

      {status === "review" ? (
        <div className="rounded-md border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          Your Vodafone Cash payment was submitted and is awaiting review. We&apos;ll activate your plan as soon as an
          admin confirms it.
        </div>
      ) : status === "success" ? (
        <div className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Payment received — your plan is being activated. It may take a moment to appear.
        </div>
      ) : status === "cancel" ? (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Checkout was cancelled. No payment was taken.
        </div>
      ) : null}

      {currentPlan ? (
        <Card>
          <CardHeader title="Current plan" />
          <CardBody className="flex items-center justify-between">
            <span className="text-sm text-ink">{currentPlan.name}</span>
            <span className="text-xs text-ink-dim">
              {currentPlan.expiresAt ? `Renews / expires ${new Date(currentPlan.expiresAt).toLocaleDateString()}` : "No expiry"}
            </span>
          </CardBody>
        </Card>
      ) : null}

      {plans.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">No plans are available for purchase yet.</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="1 — Choose a plan" description="Pick the plan you want to subscribe to." />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => {
                  const active = plan.id === selectedPlanId;
                  return (
                    <button
                      type="button"
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        active ? "border-brand bg-brand/5 ring-1 ring-brand/40" : "border-line hover:border-line-strong",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">{plan.name}</span>
                        {active ? <Check className="size-4 text-brand" /> : null}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-ink">
                        {formatPrice(plan.priceCents, plan.currency, plan.billingCycle)}
                      </div>
                      {plan.description ? <p className="mt-1 text-xs text-ink-muted">{plan.description}</p> : null}
                      <ul className="mt-3 space-y-1 border-t border-line-soft pt-3 text-xs text-ink-muted">
                        {specs(plan).map((s) => (
                          <li key={s.label} className="flex items-center gap-1.5">
                            <s.icon className="size-3.5 shrink-0 text-ink-dim" />
                            {s.label}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {methods.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-muted">
                  No payment methods are configured yet. Please check back soon or contact support.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="2 — Payment method" description="Select how you'd like to pay." />
              <CardBody className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {methods.map((m) => {
                    const active = m.method === method;
                    return (
                      <button
                        type="button"
                        key={m.method}
                        onClick={() => setMethod(m.method)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          active ? "border-brand bg-brand/5 ring-1 ring-brand/40" : "border-line hover:border-line-strong",
                        )}
                      >
                        {m.method === "vodafone_cash" ? (
                          <Smartphone className="size-4 text-ink-dim" />
                        ) : (
                          <CreditCard className="size-4 text-ink-dim" />
                        )}
                        <span className="text-ink">{m.label}</span>
                        {active ? <Check className="ml-auto size-4 text-brand" /> : null}
                      </button>
                    );
                  })}
                </div>

                {isVodafone ? (
                  <form action={vodafoneSubmit} className="space-y-4 border-t border-line-soft pt-4">
                    <FormError message={vodafoneState.error} />
                    <input type="hidden" name="planId" value={selectedPlanId ?? ""} />
                    <div className="rounded-md border border-line bg-surface-2 p-3 text-sm">
                      <p className="text-ink">
                        Send{" "}
                        <span className="font-semibold text-ink">
                          {selectedPlan ? formatPrice(selectedPlan.priceCents, selectedPlan.currency, "once") : ""}
                        </span>{" "}
                        to <span className="font-mono font-semibold text-brand-soft">{vodafone.phone || "—"}</span>
                      </p>
                      {vodafone.instructions ? (
                        <p className="mt-1 whitespace-pre-line text-xs text-ink-muted">{vodafone.instructions}</p>
                      ) : null}
                    </div>
                    <Field label="The phone number you paid from" required>
                      <Input name="senderPhone" required placeholder="01xxxxxxxxx" />
                    </Field>
                    <Field label="Payment receipt" hint="PNG, JPEG or WebP up to 6 MB." required>
                      <Input name="receipt" type="file" accept="image/png,image/jpeg,image/webp" required />
                    </Field>
                    <SubmitButton pendingLabel="Submitting…" disabled={!selectedPlanId}>
                      <Save className="size-4" />
                      Submit for review
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={checkout} className="space-y-3 border-t border-line-soft pt-4">
                    <FormError message={checkoutState.error} />
                    <input type="hidden" name="planId" value={selectedPlanId ?? ""} />
                    <input type="hidden" name="method" value={method} />
                    <p className="text-xs text-ink-dim">
                      You&apos;ll be redirected to a secure checkout to complete the payment. Your plan activates
                      automatically once payment is confirmed.
                    </p>
                    <SubmitButton pendingLabel="Redirecting…" disabled={!selectedPlanId || !method}>
                      <CreditCard className="size-4" />
                      Pay{" "}
                      {selectedPlan ? formatPrice(selectedPlan.priceCents, selectedPlan.currency, selectedPlan.billingCycle) : ""}
                    </SubmitButton>
                  </form>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      {recentOrders.length > 0 ? (
        <Card>
          <CardHeader title="Recent payments" />
          <CardBody className="space-y-2">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2 text-sm last:border-0 last:pb-0">
                <div className="min-w-0">
                  <span className="text-ink">{order.plan}</span>
                  <span className="text-ink-dim"> · {order.method.replace(/_/g, " ")}</span>
                  {order.rejectionReason ? (
                    <p className="text-xs text-bad">Rejected: {order.rejectionReason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[order.status] ?? "neutral"}>{order.status.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-ink-dim">{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

