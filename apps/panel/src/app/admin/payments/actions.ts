"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { activatePaymentOrder } from "@/lib/services/payments";
import { logActivity } from "@/lib/activity";

export interface ReviewState {
  error?: string;
  success?: string;
}

/**
 * Approves a manual (Vodafone Cash) payment: records the reviewer and activates
 * the plan for the buyer. Only orders still awaiting review can be approved.
 */
export async function approvePaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId)) return { error: "Invalid order." };

  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };
  if (order.status === "activated") return { success: "Already activated." };
  if (order.status !== "awaiting_review") return { error: "This order is not awaiting review." };

  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: { reviewedById: admin.id, reviewedAt: new Date() },
  });
  await activatePaymentOrder(order.id);

  await logActivity({ event: "admin:payment.approve", userId: admin.id, properties: { orderId: order.id } });
  revalidatePath("/admin/payments");
  return { success: "Payment approved and plan activated." };
}

/**
 * Rejects a manual payment. A rejection reason is OPTIONAL — an empty reason is
 * accepted and simply stored as null.
 */
export async function rejectPaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId)) return { error: "Invalid order." };
  const reason = String(formData.get("reason") ?? "").trim();

  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };
  if (order.status === "activated") return { error: "Cannot reject an already-activated order." };

  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: "rejected",
      rejectionReason: reason || null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });

  await logActivity({ event: "admin:payment.reject", userId: admin.id, properties: { orderId: order.id } });
  revalidatePath("/admin/payments");
  return { success: "Payment rejected." };
}
