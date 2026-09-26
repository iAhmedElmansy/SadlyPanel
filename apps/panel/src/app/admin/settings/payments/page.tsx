import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getPaymentSettings } from "@/lib/services/payments";
import { PaymentSettingsForm } from "./payment-settings-form";

export const metadata: Metadata = { title: "Payment settings" };
export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage() {
  await requireAdmin();
  const s = await getPaymentSettings();

  // Never ship secret values to the client — only whether each secret is set.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payment settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enable the gateways you want to offer at checkout and enter their credentials. A method is shown to customers
          only when it is enabled and fully configured. Secret keys are encrypted at rest and never displayed again —
          leave a secret field blank to keep the stored value.
        </p>
      </div>
      <PaymentSettingsForm
        values={{
          paymob: {
            enabled: s.paymob.enabled,
            integrationId: s.paymob.integrationId,
            iframeId: s.paymob.iframeId,
            hasApiKey: !!s.paymob.apiKey,
            hasHmac: !!s.paymob.hmac,
          },
          stripe: {
            enabled: s.stripe.enabled,
            publishableKey: s.stripe.publishableKey,
            hasSecretKey: !!s.stripe.secretKey,
            hasWebhookSecret: !!s.stripe.webhookSecret,
          },
          paypal: {
            enabled: s.paypal.enabled,
            clientId: s.paypal.clientId,
            mode: s.paypal.mode,
            hasClientSecret: !!s.paypal.clientSecret,
          },
          vodafoneCash: {
            enabled: s.vodafoneCash.enabled,
            phone: s.vodafoneCash.phone,
            instructions: s.vodafoneCash.instructions,
          },
        }}
      />
    </div>
  );
}
