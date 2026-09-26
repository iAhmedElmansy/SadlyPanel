"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import {
  createPaymentOrder,
  getPaymentSettings,
  isMethodReady,
  startPaymobCheckout,
  startPaypalCheckout,
  startStripeCheckout,
} from "@/lib/services/payments";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/constants";

export interface CheckoutState {
  error?: string;
}

const ALLOWED_RECEIPT_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;

/** Persists a Vodafone Cash receipt under public/uploads and returns its path. */
async function storeReceipt(file: File): Promise<string> {
  const extension = ALLOWED_RECEIPT_TYPES[file.type];
  if (!extension) throw new Error("Upload a PNG, JPEG or WebP image of your receipt.");
  if (file.size > MAX_RECEIPT_BYTES) throw new Error("The receipt image must be 6 MB or smaller.");
  const directory = path.join(process.cwd(), "public", "uploads");
  await mkdir(directory, { recursive: true });
  const fileName = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  await writeFile(path.join(directory, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${fileName}`;
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

// __APPEND_ACTIONS__

/**
 * Starts checkout with an automatic gateway (Paymob / Stripe / PayPal). Creates
 * a pending order, asks the gateway for a hosted payment URL, and redirects the
 * buyer there. The plan is only assigned later, once payment is confirmed.
 */
export async function startCheckoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const planId = Number(formData.get("planId"));
  const method = String(formData.get("method") ?? "");
  if (!Number.isInteger(planId)) return { error: "Choose a plan." };
  if (!isPaymentMethod(method) || method === "vodafone_cash") return { error: "Choose a valid payment method." };

  const settings = await getPaymentSettings();
  if (!isMethodReady(method, settings)) return { error: "That payment method is not available right now." };

  let redirectUrl = "";
  try {
    const order = await createPaymentOrder({ userId: user.id, planId, method });
    const urls = {
      successUrl: `${env.appUrl}/api/payments/return?order=${order.uuid}&method=${method}`,
      cancelUrl: `${env.appUrl}/api/payments/cancel?order=${order.uuid}`,
    };
    if (method === "stripe") {
      redirectUrl = await startStripeCheckout(order, order.plan, settings, urls);
    } else if (method === "paypal") {
      redirectUrl = await startPaypalCheckout(order, order.plan, settings, urls);
    } else if (method === "paymob") {
      redirectUrl = await startPaymobCheckout(order, order.plan, settings, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    }
    await logActivity({ event: "billing:checkout.start", userId: user.id, properties: { planId, method } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start checkout." };
  }

  if (!redirectUrl) return { error: "The gateway did not return a checkout URL." };
  redirect(redirectUrl);
}

/**
 * Submits a manual Vodafone Cash payment: stores the uploaded receipt and files
 * an order for admin review. Nothing is activated until an admin approves it.
 */
export async function submitVodafoneCashAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const planId = Number(formData.get("planId"));
  const senderPhone = String(formData.get("senderPhone") ?? "").trim();
  const receipt = formData.get("receipt");
  if (!Number.isInteger(planId)) return { error: "Choose a plan." };
  if (!senderPhone) return { error: "Enter the phone number you paid from." };
  if (!(receipt instanceof File) || receipt.size === 0) return { error: "Attach a photo of your payment receipt." };

  const settings = await getPaymentSettings();
  if (!isMethodReady("vodafone_cash", settings)) return { error: "Vodafone Cash is not available right now." };

  try {
    const proofImagePath = await storeReceipt(receipt);
    const order = await createPaymentOrder({ userId: user.id, planId, method: "vodafone_cash" });
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { proofImagePath, senderPhone } });
    await logActivity({ event: "billing:vodafone.submit", userId: user.id, properties: { planId, orderId: order.id } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not submit your payment." };
  }

  revalidatePath("/dashboard/billing");
  redirect("/dashboard/billing?status=review");
}

