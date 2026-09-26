"use client";

import { useActionState } from "react";
import { CreditCard, Save, Smartphone, Wallet } from "lucide-react";
import { updatePaymentSettingsAction, type PaymentSettingsState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/button";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";

export interface PaymentSettingsValues {
  paymob: { enabled: boolean; integrationId: string; iframeId: string; hasApiKey: boolean; hasHmac: boolean };
  stripe: { enabled: boolean; publishableKey: string; hasSecretKey: boolean; hasWebhookSecret: boolean };
  paypal: { enabled: boolean; clientId: string; mode: "sandbox" | "live"; hasClientSecret: boolean };
  vodafoneCash: { enabled: boolean; phone: string; instructions: string };
}

/** Placeholder shown for a secret that is already stored (never the value). */
const SECRET_SET = "•••••••••• stored — leave blank to keep";
const SECRET_EMPTY = "Not set";

export function PaymentSettingsForm({ values }: { values: PaymentSettingsValues }) {
  const [state, action] = useActionState<PaymentSettingsState, FormData>(updatePaymentSettingsAction, {});

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {/* __CARDS__ */}

      <Card>
        <CardHeader
          title="Paymob"
          description="Egyptian card & wallet gateway. Needs your API key, an online-card integration ID, the iframe ID for the hosted checkout, and the HMAC secret used to verify callbacks."
          action={<Wallet className="size-4 text-ink-dim" />}
        />
        <CardBody className="space-y-4">
          <Checkbox name="paymobEnabled" defaultChecked={values.paymob.enabled} label="Offer Paymob at checkout" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API key" hint={values.paymob.hasApiKey ? SECRET_SET : SECRET_EMPTY}>
              <Input name="paymobApiKey" type="password" autoComplete="off" placeholder={values.paymob.hasApiKey ? "••••••••" : ""} />
            </Field>
            <Field label="HMAC secret" hint={values.paymob.hasHmac ? SECRET_SET : SECRET_EMPTY}>
              <Input name="paymobHmac" type="password" autoComplete="off" placeholder={values.paymob.hasHmac ? "••••••••" : ""} />
            </Field>
            <Field label="Integration ID">
              <Input name="paymobIntegrationId" defaultValue={values.paymob.integrationId} placeholder="e.g. 123456" />
            </Field>
            <Field label="Iframe ID" hint="From Paymob → Developers → iframes.">
              <Input name="paymobIframeId" defaultValue={values.paymob.iframeId} placeholder="e.g. 98765" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Stripe"
          description="Global card payments via Stripe Checkout. Add the webhook secret from your Stripe dashboard for the checkout.session.completed event."
          action={<CreditCard className="size-4 text-ink-dim" />}
        />
        <CardBody className="space-y-4">
          <Checkbox name="stripeEnabled" defaultChecked={values.stripe.enabled} label="Offer Stripe at checkout" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Secret key" hint={values.stripe.hasSecretKey ? SECRET_SET : SECRET_EMPTY}>
              <Input name="stripeSecretKey" type="password" autoComplete="off" placeholder={values.stripe.hasSecretKey ? "sk_live_••••" : "sk_live_…"} />
            </Field>
            <Field label="Webhook signing secret" hint={values.stripe.hasWebhookSecret ? SECRET_SET : SECRET_EMPTY}>
              <Input name="stripeWebhookSecret" type="password" autoComplete="off" placeholder={values.stripe.hasWebhookSecret ? "whsec_••••" : "whsec_…"} />
            </Field>
            <Field label="Publishable key" hint="Public; safe to store in plain text." className="sm:col-span-2">
              <Input name="stripePublishableKey" defaultValue={values.stripe.publishableKey} placeholder="pk_live_…" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="PayPal"
          description="PayPal Orders v2. Use sandbox credentials while testing, then switch to live."
          action={<Wallet className="size-4 text-ink-dim" />}
        />
        <CardBody className="space-y-4">
          <Checkbox name="paypalEnabled" defaultChecked={values.paypal.enabled} label="Offer PayPal at checkout" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID">
              <Input name="paypalClientId" defaultValue={values.paypal.clientId} placeholder="AY…" />
            </Field>
            <Field label="Client secret" hint={values.paypal.hasClientSecret ? SECRET_SET : SECRET_EMPTY}>
              <Input name="paypalClientSecret" type="password" autoComplete="off" placeholder={values.paypal.hasClientSecret ? "••••••••" : ""} />
            </Field>
            <Field label="Environment" className="sm:col-span-2">
              <Select name="paypalMode" defaultValue={values.paypal.mode}>
                <option value="sandbox">Sandbox (testing)</option>
                <option value="live">Live</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Vodafone Cash"
          description="Manual review. Customers send money to your number, upload the receipt, and you approve or reject each payment."
          action={<Smartphone className="size-4 text-ink-dim" />}
        />
        <CardBody className="space-y-4">
          <Checkbox name="vodafoneCashEnabled" defaultChecked={values.vodafoneCash.enabled} label="Offer Vodafone Cash at checkout" />
          <Field label="Receiving phone number" hint="Shown to the customer so they know where to send payment.">
            <Input name="vodafoneCashPhone" defaultValue={values.vodafoneCash.phone} placeholder="01xxxxxxxxx" />
          </Field>
          <Field label="Instructions" hint="Displayed on the checkout page above the receipt upload.">
            <Textarea
              name="vodafoneCashInstructions"
              defaultValue={values.vodafoneCash.instructions}
              placeholder="Send the exact amount to the number above, then upload a screenshot of the confirmation SMS."
            />
          </Field>
        </CardBody>
      </Card>


      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">
          <Save className="size-4" />
          Save payment settings
        </SubmitButton>
      </div>
    </form>
  );
}
