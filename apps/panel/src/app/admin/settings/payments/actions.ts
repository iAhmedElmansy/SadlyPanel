"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { setSettings } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

export interface PaymentSettingsState {
  error?: string;
  success?: string;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const on = (form: FormData, key: string) => (form.get(key) === "on" ? "true" : "false");

/**
 * Persists the payment-gateway configuration. Secret fields (API keys, HMAC,
 * webhook/client secrets) are encrypted via ENCRYPTED_SETTING_KEYS, and
 * setSettings() skips an empty secret so a blank field never wipes a stored key.
 */
export async function updatePaymentSettingsAction(
  _prev: PaymentSettingsState,
  formData: FormData,
): Promise<PaymentSettingsState> {
  const admin = await requireAdmin();

  const mode = str(formData, "paypalMode") === "live" ? "live" : "sandbox";

  await setSettings({
    // Paymob
    [SETTING_KEYS.paymobEnabled]: on(formData, "paymobEnabled"),
    [SETTING_KEYS.paymobApiKey]: str(formData, "paymobApiKey"),
    [SETTING_KEYS.paymobIntegrationId]: str(formData, "paymobIntegrationId"),
    [SETTING_KEYS.paymobIframeId]: str(formData, "paymobIframeId"),
    [SETTING_KEYS.paymobHmac]: str(formData, "paymobHmac"),
    // Stripe
    [SETTING_KEYS.stripeEnabled]: on(formData, "stripeEnabled"),
    [SETTING_KEYS.stripeSecretKey]: str(formData, "stripeSecretKey"),
    [SETTING_KEYS.stripeWebhookSecret]: str(formData, "stripeWebhookSecret"),
    [SETTING_KEYS.stripePublishableKey]: str(formData, "stripePublishableKey"),
    // PayPal
    [SETTING_KEYS.paypalEnabled]: on(formData, "paypalEnabled"),
    [SETTING_KEYS.paypalClientId]: str(formData, "paypalClientId"),
    [SETTING_KEYS.paypalClientSecret]: str(formData, "paypalClientSecret"),
    [SETTING_KEYS.paypalMode]: mode,
    // Vodafone Cash
    [SETTING_KEYS.vodafoneCashEnabled]: on(formData, "vodafoneCashEnabled"),
    [SETTING_KEYS.vodafoneCashPhone]: str(formData, "vodafoneCashPhone"),
    [SETTING_KEYS.vodafoneCashInstructions]: str(formData, "vodafoneCashInstructions"),
  });

  await logActivity({ event: "admin:settings.payments", userId: admin.id });
  revalidatePath("/admin/settings/payments");
  return { success: "Payment settings saved." };
}
