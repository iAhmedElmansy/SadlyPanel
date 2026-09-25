import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpSettings } from "./settings";

let cached: { transporter: Transporter; signature: string } | null = null;

async function buildTransporter(): Promise<{ transporter: Transporter; from: string } | null> {
  const smtp = await getSmtpSettings();
  if (!smtp.enabled || !smtp.host) return null;

  const signature = JSON.stringify([smtp.host, smtp.port, smtp.username, smtp.encryption, smtp.password.length]);
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      transporter: nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.encryption === "ssl",
        requireTLS: smtp.encryption === "tls",
        auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
      }),
    };
  }

  const from = smtp.fromName ? `"${smtp.fromName}" <${smtp.fromAddress || smtp.username}>` : smtp.fromAddress || smtp.username;
  return { transporter: cached.transporter, from };
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(message: MailMessage): Promise<{ sent: boolean; error?: string }> {
  const built = await buildTransporter();
  if (!built) return { sent: false, error: "SMTP is not configured." };
  try {
    await built.transporter.sendMail({
      from: built.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? message.html.replace(/<[^>]+>/g, " "),
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Unknown SMTP error." };
  }
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const built = await buildTransporter();
  if (!built) return { ok: false, error: "SMTP is disabled or missing a host." };
  try {
    await built.transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown SMTP error." };
  }
}

/** A primary call-to-action button used inside branded emails. */
export function renderEmailButton(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0">
    <tr><td style="border-radius:10px;background:#111111">
      <a href="${url}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${label}</a>
    </td></tr>
  </table>`;
}

/** Verification email: greets, explains, offers the CTA button and raw link. */
export function renderVerifyEmail(siteName: string, verifyUrl: string): string {
  return renderBrandedEmail(
    siteName,
    "Confirm your email address",
    `<p>Thanks for creating an account on ${siteName}. Please confirm this email address to activate your account.</p>
     ${renderEmailButton("Verify email", verifyUrl)}
     <p style="font-size:12px;color:#64748b">This link expires in 24 hours and can be used once. If the button does not work, copy and paste this URL into your browser:</p>
     <p style="font-size:12px;word-break:break-all"><a href="${verifyUrl}" style="color:#818cf8">${verifyUrl}</a></p>
     <p style="font-size:12px;color:#64748b">If you did not create this account you can safely ignore this email.</p>`,
  );
}

/** Password-reset email: CTA button + raw link, short-lived and single-use. */
export function renderResetEmail(siteName: string, resetUrl: string): string {
  return renderBrandedEmail(
    siteName,
    "Reset your password",
    `<p>We received a request to reset the password for your ${siteName} account.</p>
     ${renderEmailButton("Reset password", resetUrl)}
     <p style="font-size:12px;color:#64748b">This link expires in 1 hour and can be used once. If the button does not work, copy and paste this URL into your browser:</p>
     <p style="font-size:12px;word-break:break-all"><a href="${resetUrl}" style="color:#818cf8">${resetUrl}</a></p>
     <p style="font-size:12px;color:#64748b">If you did not request a password reset you can safely ignore this email; your password will not change.</p>`,
  );
}

export function renderBrandedEmail(siteName: string, heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#0b0f1a;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #1f2937;font-size:18px;font-weight:600">${siteName}</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f8fafc">${heading}</h1>
          <div style="font-size:14px;line-height:1.7;color:#94a3b8">${body}</div>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #1f2937;font-size:12px;color:#64748b">Sent automatically by ${siteName}.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
