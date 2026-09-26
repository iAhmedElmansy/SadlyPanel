"use client";

import { useActionState, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { approvePaymentAction, rejectPaymentAction, type ReviewState } from "./actions";
import { Button, SubmitButton } from "@/components/ui/button";
import { FormError, FormSuccess, Textarea } from "@/components/ui/form";

export interface ReviewOrder {
  id: number;
  user: string;
  email: string;
  plan: string;
  amount: string;
  senderPhone: string | null;
  proofImagePath: string | null;
  createdAt: string;
}

export function PaymentReview({ order }: { order: ReviewOrder }) {
  const [approveState, approve] = useActionState<ReviewState, FormData>(approvePaymentAction, {});
  const [rejectState, reject] = useActionState<ReviewState, FormData>(rejectPaymentAction, {});
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-ink">
            {order.user} <span className="text-ink-dim">· {order.email}</span>
          </p>
          <p className="text-sm text-ink-muted">
            {order.plan} — <span className="text-ink">{order.amount}</span>
          </p>
          <p className="text-xs text-ink-dim">
            {order.senderPhone ? `Sender: ${order.senderPhone} · ` : ""}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        {order.proofImagePath ? (
          <a
            href={order.proofImagePath}
            target="_blank"
            rel="noreferrer"
            className="group relative block shrink-0"
            title="Open full receipt"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.proofImagePath}
              alt="Payment receipt"
              className="h-24 w-24 rounded-md border border-line object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <ExternalLink className="size-4 text-white" />
            </span>
          </a>
        ) : (
          <span className="text-xs text-ink-dim">No receipt uploaded</span>
        )}
      </div>

      <FormError message={approveState.error ?? rejectState.error} />
      <FormSuccess message={approveState.success ?? rejectState.success} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="orderId" value={order.id} />
          <SubmitButton pendingLabel="Approving…">
            <Check className="size-4" />
            Approve & activate
          </SubmitButton>
        </form>
        <Button type="button" variant="ghost" onClick={() => setShowReject((v) => !v)}>
          <X className="size-4" />
          Reject
        </Button>
      </div>

      {showReject ? (
        <form action={reject} className="mt-3 space-y-2">
          <input type="hidden" name="orderId" value={order.id} />
          <Textarea name="reason" placeholder="Reason (optional) — shown to the customer." className="min-h-16" />
          <SubmitButton variant="danger" pendingLabel="Rejecting…">
            Confirm rejection
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
