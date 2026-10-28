import nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  category: string;
  idempotencyKey?: string;
}

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | undefined;

/** Sends through Gmail SMTP; needs SMTP_USER and SMTP_PASS. */
export async function deliverEmail(message: EmailMessage): Promise<{ success: boolean; error?: string }> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return { success: false, error: 'Email delivery is not configured.' };
  try {
    // shortcut: Gmail SMTP has no idempotency key and ~500 mails/day, so retries can duplicate; use a domain-verified SMTP relay for production.
    smtpTransport ??= nodemailer.createTransport({ service: 'gmail', auth: { user: smtpUser, pass: smtpPass } });
    await smtpTransport.sendMail({
      from: process.env.EMAIL_FROM || smtpUser,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    return { success: true };
  } catch {
    console.error('[deliverEmail] smtp request failed');
    return { success: false, error: 'Email delivery failed.' };
  }
}
