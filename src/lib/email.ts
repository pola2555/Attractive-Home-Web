import 'server-only';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SITE_URL } from './seo';

// Transactional email — one small SES v2 module reused by staff password reset,
// customer email verification / reset, and lead notifications. It is written to
// DEGRADE GRACEFULLY: when EMAIL_FROM is unset (SES is owner-managed and wired
// at cutover) sendEmail() logs and no-ops instead of throwing, so sign-up,
// reset and lead flows still succeed in dev/preview. Credentials come from the
// standard AWS SDK env chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).

type EmailConfig = { from: string; region: string; enabled: boolean };

function config(): EmailConfig {
  const from = (process.env.EMAIL_FROM ?? '').trim();
  const region = (process.env.SES_REGION ?? process.env.AWS_REGION ?? process.env.S3_REGION ?? 'ap-south-1').trim();
  return { from, region, enabled: Boolean(from && region) };
}

export function isEmailConfigured(): boolean {
  return config().enabled;
}

let client: SESv2Client | null = null;
function sesClient(region: string): SESv2Client {
  if (!client) client = new SESv2Client({ region });
  return client;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
};
export type SendEmailResult = { ok: boolean; skipped?: boolean; id?: string; error?: string };

function toList(v: string | string[]): string[] {
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = config();
  const to = toList(input.to);
  if (to.length === 0) return { ok: false, error: 'no recipients' };
  if (!cfg.enabled) {
    console.warn(`[email] EMAIL_FROM not set — skipping "${input.subject}" to ${to.join(', ')}`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await sesClient(cfg.region).send(
      new SendEmailCommand({
        FromEmailAddress: cfg.from,
        Destination: { ToAddresses: to },
        ...(input.replyTo ? { ReplyToAddresses: toList(input.replyTo) } : {}),
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: input.html, Charset: 'UTF-8' },
              ...(input.text ? { Text: { Data: input.text, Charset: 'UTF-8' } } : {}),
            },
          },
        },
      }),
    );
    return { ok: true, id: res.MessageId };
  } catch (err) {
    // Best-effort: a send failure must never crash the calling flow.
    console.error('[email] send failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}

// ---------------------------------------------------------------------------
// Templates — inline-styled HTML (email clients strip <style>/external CSS) with
// a plain-text alternative. All interpolated values are HTML-escaped.
// ---------------------------------------------------------------------------

const BRAND = 'Attractive Home';

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#0d1822;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0d1822;padding:20px 32px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px;">${BRAND}</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0d1822;">${esc(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 32px;background:#faf5ec;color:#8a8175;font-size:12px;">${BRAND} · Dubai, UAE</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${esc(url)}" style="display:inline-block;background:#c08b5c;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;font-size:15px;">${esc(label)}</a>`;
}

function greeting(name?: string | null): string {
  return name ? `Hi ${esc(name)},` : 'Hi,';
}

export function sendStaffPasswordResetEmail(opts: {
  to: string;
  name?: string | null;
  token: string;
  expiresInHours: number;
}): Promise<SendEmailResult> {
  const url = `${SITE_URL}/dashboard/reset-password?token=${encodeURIComponent(opts.token)}`;
  const html = layout(
    'Reset your dashboard password',
    `<p>${greeting(opts.name)}</p>
<p>We received a request to reset the password for your ${BRAND} dashboard account. This link is valid for ${opts.expiresInHours} hour${opts.expiresInHours === 1 ? '' : 's'}.</p>
<p style="margin:24px 0;">${button(url, 'Reset password')}</p>
<p style="color:#8a8175;font-size:13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  );
  const text = `Reset your ${BRAND} dashboard password (valid ${opts.expiresInHours}h):\n${url}\n\nIf you didn't request this, ignore this email.`;
  return sendEmail({ to: opts.to, subject: `Reset your ${BRAND} dashboard password`, html, text });
}

export function sendCustomerVerificationEmail(opts: {
  to: string;
  name?: string | null;
  token: string;
  locale: string;
  expiresInHours: number;
}): Promise<SendEmailResult> {
  const url = `${SITE_URL}/${opts.locale}/account/verify?token=${encodeURIComponent(opts.token)}`;
  const html = layout(
    'Confirm your email address',
    `<p>${greeting(opts.name)}</p>
<p>Welcome to ${BRAND}. Please confirm your email address to finish setting up your account. This link is valid for ${opts.expiresInHours} hours.</p>
<p style="margin:24px 0;">${button(url, 'Confirm email')}</p>
<p style="color:#8a8175;font-size:13px;">If you didn't create this account, you can ignore this email.</p>`,
  );
  const text = `Confirm your ${BRAND} email address (valid ${opts.expiresInHours}h):\n${url}\n\nIf you didn't create this account, ignore this email.`;
  return sendEmail({ to: opts.to, subject: `Confirm your ${BRAND} email address`, html, text });
}

export function sendCustomerPasswordResetEmail(opts: {
  to: string;
  name?: string | null;
  token: string;
  locale: string;
  expiresInHours: number;
}): Promise<SendEmailResult> {
  const url = `${SITE_URL}/${opts.locale}/account/reset-password?token=${encodeURIComponent(opts.token)}`;
  const html = layout(
    'Reset your password',
    `<p>${greeting(opts.name)}</p>
<p>We received a request to reset the password for your ${BRAND} account. This link is valid for ${opts.expiresInHours} hour${opts.expiresInHours === 1 ? '' : 's'}.</p>
<p style="margin:24px 0;">${button(url, 'Reset password')}</p>
<p style="color:#8a8175;font-size:13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  );
  const text = `Reset your ${BRAND} password (valid ${opts.expiresInHours}h):\n${url}\n\nIf you didn't request this, ignore this email.`;
  return sendEmail({ to: opts.to, subject: `Reset your ${BRAND} password`, html, text });
}

export function sendLeadNotificationEmail(opts: {
  to: string[];
  lead: {
    name: string;
    phone: string;
    email?: string | null;
    message?: string | null;
    channel: string;
    sourcePath?: string | null;
    localeCode?: string | null;
  };
}): Promise<SendEmailResult> {
  const rows: [string, string | null | undefined][] = [
    ['Name', opts.lead.name],
    ['Phone', opts.lead.phone],
    ['Email', opts.lead.email],
    ['Channel', opts.lead.channel],
    ['Language', opts.lead.localeCode],
    ['Page', opts.lead.sourcePath],
  ];
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 16px 5px 0;color:#8a8175;font-size:14px;">${k}</td><td style="padding:5px 0;font-size:14px;font-weight:bold;">${esc(String(v))}</td></tr>`,
    )
    .join('');
  const messageHtml = opts.lead.message
    ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #eee;white-space:pre-wrap;font-size:14px;">${esc(opts.lead.message)}</p>`
    : '';
  const html = layout(
    'New enquiry',
    `<table role="presentation" cellpadding="0" cellspacing="0">${rowsHtml}</table>${messageHtml}`,
  );
  const textLines = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (opts.lead.message) textLines.push('', opts.lead.message);
  return sendEmail({
    to: opts.to,
    subject: `New enquiry from ${opts.lead.name}`,
    html,
    text: textLines.join('\n'),
    // Let staff reply straight to the customer when they left an email.
    replyTo: opts.lead.email ?? undefined,
  });
}
