import crypto from "node:crypto";
import type { PaymentOrder, Plan } from "@prisma/client";
import { prisma } from "../db";
import { getAllSettings } from "../settings";
import { SETTING_KEYS, type PaymentMethod } from "../constants";
import { uuid } from "../crypto";

/**
 * Payment orchestration for the four supported methods:
 *   - Paymob, Stripe, PayPal  → automatic gateways (redirect + webhook)
 *   - Vodafone Cash           → manual: customer uploads a receipt, admin reviews
 *
 * All gateway calls use the built-in fetch against each provider's REST API —
 * no SDK dependencies. Secrets live in the encrypted Setting store. Activation
 * is "pay-then-activate": a plan is only assigned once money is confirmed (a
 * verified webhook / capture) or an admin approves a manual Vodafone payment.
 */

export interface PaymentSettings {
  paymob: { enabled: boolean; apiKey: string; integrationId: string; iframeId: string; hmac: string };
  stripe: { enabled: boolean; secretKey: string; webhookSecret: string; publishableKey: string };
  paypal: { enabled: boolean; clientId: string; clientSecret: string; mode: "sandbox" | "live" };
  vodafoneCash: { enabled: boolean; phone: string; instructions: string };
}

export interface BuyerInfo {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface CheckoutUrls {
  successUrl: string;
  cancelUrl: string;
}

/** Reads and decrypts every payment setting into a typed shape. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const s = await getAllSettings();
  const bool = (key: string) => s[key] === "true";
  return {
    paymob: {
      enabled: bool(SETTING_KEYS.paymobEnabled),
      apiKey: s[SETTING_KEYS.paymobApiKey] ?? "",
      integrationId: s[SETTING_KEYS.paymobIntegrationId] ?? "",
      iframeId: s[SETTING_KEYS.paymobIframeId] ?? "",
      hmac: s[SETTING_KEYS.paymobHmac] ?? "",
    },
    stripe: {
      enabled: bool(SETTING_KEYS.stripeEnabled),
      secretKey: s[SETTING_KEYS.stripeSecretKey] ?? "",
      webhookSecret: s[SETTING_KEYS.stripeWebhookSecret] ?? "",
      publishableKey: s[SETTING_KEYS.stripePublishableKey] ?? "",
    },
    paypal: {
      enabled: bool(SETTING_KEYS.paypalEnabled),
      clientId: s[SETTING_KEYS.paypalClientId] ?? "",
      clientSecret: s[SETTING_KEYS.paypalClientSecret] ?? "",
      mode: s[SETTING_KEYS.paypalMode] === "live" ? "live" : "sandbox",
    },
    vodafoneCash: {
      enabled: bool(SETTING_KEYS.vodafoneCashEnabled),
      phone: s[SETTING_KEYS.vodafoneCashPhone] ?? "",
      instructions: s[SETTING_KEYS.vodafoneCashInstructions] ?? "",
    },
  };
}
// __APPEND_1__

/** True when a gateway is switched on AND holds the credentials it needs. */
export function isMethodReady(method: PaymentMethod, s: PaymentSettings): boolean {
  switch (method) {
    case "paymob":
      return s.paymob.enabled && !!s.paymob.apiKey && !!s.paymob.integrationId && !!s.paymob.iframeId;
    case "stripe":
      return s.stripe.enabled && !!s.stripe.secretKey;
    case "paypal":
      return s.paypal.enabled && !!s.paypal.clientId && !!s.paypal.clientSecret;
    case "vodafone_cash":
      return s.vodafoneCash.enabled && !!s.vodafoneCash.phone;
    default:
      return false;
  }
}

export interface EnabledMethod {
  method: PaymentMethod;
  label: string;
  /** Automatic gateways redirect + confirm via webhook; false = manual review. */
  automatic: boolean;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  paymob: "Paymob — card or mobile wallet",
  stripe: "Credit / debit card (Stripe)",
  paypal: "PayPal",
  vodafone_cash: "Vodafone Cash (manual)",
};

const ALL_METHODS: PaymentMethod[] = ["paymob", "stripe", "paypal", "vodafone_cash"];

/** Methods a customer may pick right now (enabled + configured). */
export async function getEnabledMethods(s?: PaymentSettings): Promise<EnabledMethod[]> {
  const settings = s ?? (await getPaymentSettings());
  return ALL_METHODS.filter((m) => isMethodReady(m, settings)).map((m) => ({
    method: m,
    label: METHOD_LABELS[m],
    automatic: m !== "vodafone_cash",
  }));
}

/**
 * Subscription window for a billing cycle. `once`/`free` have no expiry
 * (lifetime); monthly/yearly advance the calendar from `from`.
 */
export function computePeriod(
  billingCycle: string,
  from = new Date(),
): { periodStart: Date; periodEnd: Date | null } {
  const periodStart = from;
  if (billingCycle === "yearly") {
    const end = new Date(from);
    end.setFullYear(end.getFullYear() + 1);
    return { periodStart, periodEnd: end };
  }
  if (billingCycle === "monthly") {
    const end = new Date(from);
    end.setMonth(end.getMonth() + 1);
    return { periodStart, periodEnd: end };
  }
  return { periodStart, periodEnd: null };
}

/**
 * Idempotently activates a confirmed order: flips it to "activated" and assigns
 * the plan to the buyer for the computed window. Calling twice (e.g. a webhook
 * retry) is a no-op after the first activation.
 */
export async function activatePaymentOrder(orderId: number): Promise<void> {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, include: { plan: true } });
  if (!order) return;
  if (order.status === "activated") return;
  const { periodStart, periodEnd } = computePeriod(order.plan.billingCycle, new Date());
  await prisma.$transaction([
    prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: "activated", periodStart, periodEnd },
    }),
    prisma.user.update({
      where: { id: order.userId },
      data: { planId: order.planId, planActivatedAt: periodStart, planExpiresAt: periodEnd },
    }),
  ]);
}

/** Creates a fresh order for a plan. Vodafone Cash starts in review; others pending. */
export async function createPaymentOrder(input: {
  userId: number;
  planId: number;
  method: PaymentMethod;
}): Promise<PaymentOrder & { plan: Plan }> {
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error("Plan not found.");
  if (!plan.isActive || !plan.isPublic) throw new Error("This plan is not available for purchase.");

  const settings = await getPaymentSettings();
  if (!isMethodReady(input.method, settings)) throw new Error("That payment method is not available.");

  const status = input.method === "vodafone_cash" ? "awaiting_review" : "pending";
  const order = await prisma.paymentOrder.create({
    data: {
      uuid: uuid(),
      userId: input.userId,
      planId: plan.id,
      method: input.method,
      amountCents: plan.priceCents,
      currency: plan.currency,
      status,
    },
  });
  return { ...order, plan };
}
// __APPEND_2__

// --------------------------------------------------------------------- Stripe
/**
 * Creates a Stripe Checkout Session via the REST API (form-encoded) and returns
 * the hosted payment URL to redirect the buyer to. The session id is stored on
 * the order so the webhook can correlate it.
 */
export async function startStripeCheckout(
  order: PaymentOrder,
  plan: Plan,
  s: PaymentSettings,
  urls: CheckoutUrls,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", urls.successUrl);
  body.set("cancel_url", urls.cancelUrl);
  body.set("client_reference_id", order.uuid);
  body.set("metadata[orderId]", String(order.id));
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", plan.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(order.amountCents));
  body.set("line_items[0][price_data][product_data][name]", plan.name);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) throw new Error(data.error?.message ?? "Stripe checkout could not be created.");
  await prisma.paymentOrder.update({ where: { id: order.id }, data: { gatewayRef: data.id ?? null } });
  return data.url;
}

// --------------------------------------------------------------------- PayPal
function paypalBase(mode: "sandbox" | "live"): string {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(s: PaymentSettings): Promise<string> {
  const base = paypalBase(s.paypal.mode);
  const auth = Buffer.from(`${s.paypal.clientId}:${s.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? "PayPal authentication failed.");
  return data.access_token;
}

/** Creates a PayPal order and returns the approval URL to redirect to. */
export async function startPaypalCheckout(
  order: PaymentOrder,
  plan: Plan,
  s: PaymentSettings,
  urls: CheckoutUrls,
): Promise<string> {
  const base = paypalBase(s.paypal.mode);
  const token = await paypalAccessToken(s);
  const value = (order.amountCents / 100).toFixed(2);
  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: String(order.id),
          description: plan.name.slice(0, 127),
          amount: { currency_code: order.currency, value },
        },
      ],
      application_context: {
        return_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  const data = (await res.json()) as { id?: string; links?: { rel: string; href: string }[]; message?: string };
  if (!res.ok || !data.id) throw new Error(data.message ?? "PayPal order could not be created.");
  await prisma.paymentOrder.update({ where: { id: order.id }, data: { gatewayRef: data.id } });
  const approve = (data.links ?? []).find((l) => l.rel === "approve");
  if (!approve) throw new Error("PayPal did not return an approval link.");
  return approve.href;
}

/** Captures an approved PayPal order. Returns true only when fully COMPLETED. */
export async function capturePaypalOrder(paypalOrderId: string, s: PaymentSettings): Promise<boolean> {
  const base = paypalBase(s.paypal.mode);
  const token = await paypalAccessToken(s);
  const res = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = (await res.json()) as { status?: string };
  return res.ok && data.status === "COMPLETED";
}

/** Authoritative status check for a PayPal order (used by the webhook safety net). */
export async function isPaypalOrderCompleted(paypalOrderId: string, s: PaymentSettings): Promise<boolean> {
  if (!paypalOrderId) return false;
  const base = paypalBase(s.paypal.mode);
  const token = await paypalAccessToken(s);
  const res = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { status?: string };
  return data.status === "COMPLETED";
}
// __APPEND_3__

// --------------------------------------------------------------------- Paymob
/**
 * Classic Paymob flow: auth token → register order → payment key → hosted
 * iframe URL. Returns the checkout URL to redirect the buyer to. The Paymob
 * order id is stored on the order for callback correlation.
 */
export async function startPaymobCheckout(
  order: PaymentOrder,
  plan: Plan,
  s: PaymentSettings,
  buyer: BuyerInfo,
): Promise<string> {
  const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: s.paymob.apiKey }),
  });
  const auth = (await authRes.json()) as { token?: string; detail?: string };
  if (!authRes.ok || !auth.token) throw new Error(auth.detail ?? "Paymob authentication failed.");

  const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: auth.token,
      delivery_needed: false,
      amount_cents: order.amountCents,
      currency: order.currency,
      merchant_order_id: order.uuid,
      items: [{ name: plan.name, amount_cents: order.amountCents, quantity: 1 }],
    }),
  });
  const pmOrder = (await orderRes.json()) as { id?: number; message?: string };
  if (!orderRes.ok || !pmOrder.id) throw new Error(pmOrder.message ?? "Paymob order registration failed.");

  const keyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: auth.token,
      amount_cents: order.amountCents,
      expiration: 3600,
      order_id: pmOrder.id,
      currency: order.currency,
      integration_id: Number(s.paymob.integrationId),
      billing_data: {
        email: buyer.email,
        first_name: buyer.firstName || "SPanel",
        last_name: buyer.lastName || "Customer",
        phone_number: buyer.phone || "+20000000000",
        apartment: "NA",
        floor: "NA",
        street: "NA",
        building: "NA",
        shipping_method: "NA",
        postal_code: "NA",
        city: "NA",
        country: "NA",
        state: "NA",
      },
    }),
  });
  const key = (await keyRes.json()) as { token?: string; message?: string };
  if (!keyRes.ok || !key.token) throw new Error(key.message ?? "Paymob payment key request failed.");

  await prisma.paymentOrder.update({ where: { id: order.id }, data: { gatewayRef: String(pmOrder.id) } });
  return `https://accept.paymob.com/api/acceptance/iframes/${s.paymob.iframeId}?payment_token=${key.token}`;
}

// ----------------------------------------------------------- webhook verifying
/**
 * Verifies a Stripe webhook signature. `Stripe-Signature` is `t=<ts>,v1=<sig>`;
 * the signed payload is `${t}.${rawBody}` HMAC-SHA256 with the endpoint secret.
 */
export function verifyStripeSignature(rawBody: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const idx = piece.indexOf("=");
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

/**
 * Verifies a Paymob transaction callback HMAC (SHA-512 over an ordered subset of
 * the transaction object). Accepts the raw callback body (with `obj`) or the obj.
 */
export function verifyPaymobHmac(payload: unknown, receivedHmac: string | null, secret: string): boolean {
  if (!receivedHmac || !secret) return false;
  const root = (payload ?? {}) as Record<string, unknown>;
  const o = ((root.obj as Record<string, unknown>) ?? root) as Record<string, unknown>;
  const orderField = o.order as { id?: unknown } | undefined;
  const source = (o.source_data as Record<string, unknown>) ?? {};
  const ordered = [
    o.amount_cents,
    o.created_at,
    o.currency,
    o.error_occured,
    o.has_parent_transaction,
    o.id,
    o.integration_id,
    o.is_3d_secure,
    o.is_auth,
    o.is_capture,
    o.is_refunded,
    o.is_standalone_payment,
    o.is_voided,
    orderField?.id ?? orderField,
    o.owner,
    o.pending,
    source.pan,
    source.sub_type,
    source.type,
    o.success,
  ]
    .map((v) => (v === undefined || v === null ? "" : String(v)))
    .join("");
  const expected = crypto.createHmac("sha512", secret).update(ordered).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHmac.toLowerCase()));
  } catch {
    return false;
  }
}

/** Finds an order by its gateway reference (Stripe session / PayPal / Paymob order id). */
export async function findOrderByGatewayRef(ref: string): Promise<PaymentOrder | null> {
  if (!ref) return null;
  return prisma.paymentOrder.findFirst({ where: { gatewayRef: ref } });
}

/** Finds an order by its uuid (Stripe client_reference_id / Paymob merchant_order_id). */
export async function findOrderByUuid(value: string): Promise<PaymentOrder | null> {
  if (!value) return null;
  return prisma.paymentOrder.findUnique({ where: { uuid: value } });
}

/** Marks an order failed unless it was already activated (keeps activation sticky). */
export async function markOrderFailed(orderId: number, status: "failed" | "cancelled" = "failed"): Promise<void> {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status === "activated") return;
  await prisma.paymentOrder.update({ where: { id: orderId }, data: { status } });
}

/** Server-side check that a Stripe Checkout Session was actually paid. */
export async function isStripeSessionPaid(sessionId: string, s: PaymentSettings): Promise<boolean> {
  if (!sessionId || !s.stripe.secretKey) return false;
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${s.stripe.secretKey}` },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { payment_status?: string };
  return data.payment_status === "paid";
}



