/**
 * Account Status Email Dispatcher for Colegio de Montalban OJT Portal
 * Sends official institutional emails to students when their accounts are approved or rejected.
 */

interface SendAccountStatusOptions {
  to: string;
  fullName: string;
  status: 'active' | 'rejected';
  reason?: string;
  idempotencyKey?: string;
}

export async function sendAccountStatusEmail({
  to,
  fullName,
  status,
  reason,
  idempotencyKey,
}: SendAccountStatusOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Colegio de Montalban <onboarding@resend.dev>';

  const isApproved = status === 'active';
  const subject = isApproved
    ? 'Colegio de Montalban OJT - Account Verified & Approved: Action Required'
    : 'Colegio de Montalban OJT - Registration Status: Not Approved';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Institutional Header -->
          <div style="background-color: #0A3824; padding: 28px 24px; text-align: center;">
            <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: 0.5px;">
              COLEGIO DE MONTALBAN
            </h1>
            <p style="color: #D5B254; font-size: 12px; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">
              Cross-Platform OJT Practicum System
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding: 32px 28px;">
            ${isApproved ? `
              <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 12px; margin-bottom: 16px;">
                <span style="color: #047857; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  ✓ Account Verified &amp; Approved
                </span>
              </div>
              <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 14px 0;">
                Welcome, Trainee!
              </h2>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
              </p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                Your registration for the Colegio de Montalban OJT Practicum System has been officially reviewed and <strong>APPROVED</strong> by your Institute OJT Coordinator.
              </p>

              <!-- Mobile Login Guide -->
              <div style="background-color: #f8fafc; border-left: 4px solid #0A3824; padding: 14px 18px; border-radius: 6px; margin: 0 0 24px 0;">
                <p style="color: #0f172a; font-size: 13px; font-weight: 700; margin: 0 0 4px 0;">
                  📱 Sign In Via Mobile App
                </p>
                <p style="color: #475569; font-size: 13px; line-height: 1.5; margin: 0;">
                  Student interns access attendance and journal logs exclusively through the <strong>CdM OJT Mobile App</strong> using your registered email and password.
                </p>
              </div>

              <!-- Mandatory Requirement Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 20px; margin: 0 0 24px 0;">
                <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">
                  ⚠️ Action Required: Feature Access Notice
                </h3>
                <p style="color: #78350f; font-size: 13px; line-height: 1.6; margin: 0 0 12px 0;">
                  You can now sign in to the mobile app, but your <strong>Daily Attendance (Time In / Time Out)</strong> is currently <strong>LOCKED</strong>. Under institutional practicum rules, you must submit the following <strong>2 required pre-deployment documents</strong> directly inside the mobile app:
                </p>
                <ol style="color: #78350f; font-size: 13px; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li><strong>Pre-OJT Orientation Certificate</strong></li>
                  <li><strong>Endorsement Letter</strong></li>
                </ol>
                <p style="color: #92400e; font-size: 12px; font-weight: 600; margin: 12px 0 0 0;">
                  An OJT Coordinator reviews these documents before placement and attendance are enabled.
                </p>
              </div>
            ` : `
              <div style="display: inline-block; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 9999px; padding: 4px 12px; margin-bottom: 16px;">
                <span style="color: #b91c1c; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Registration Not Approved
                </span>
              </div>
              <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 14px 0;">
                Account Status Update
              </h2>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
              </p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                We regret to inform you that your registration for the Colegio de Montalban OJT Practicum System could not be approved at this time.
              </p>

              ${reason ? `
                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin: 0 0 24px 0;">
                  <p style="color: #991b1b; font-size: 13px; font-weight: 700; margin: 0 0 4px 0;">
                    Reason Provided by OJT Coordinator:
                  </p>
                  <p style="color: #7f1d1d; font-size: 13px; line-height: 1.5; margin: 0; font-style: italic;">
                    &ldquo;${escapeHtml(reason)}&rdquo;
                  </p>
                </div>
              ` : ''}

              <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
                If you believe this decision is in error or your student enrollment details were misentered, please consult directly with your Department OJT Coordinator (ICS or IBE Practicum Office).
              </p>
            `}

            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              This is an automated notification from the Colegio de Montalban Cross-Platform OJT Monitoring and Management System. Please do not reply directly to this email.
            </p>
          </div>

          <!-- Institutional Footer -->
          <div style="background-color: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 11px; margin: 0; font-weight: 600;">
              Colegio de Montalban • Kasiglahan Village, Rodriguez, Rizal
            </p>
            <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0 0;">
              Institute of Computing Studies (ICS) &amp; Institute of Business and Entrepreneurship (IBE)
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. Dispatch via Resend REST API if configured
  if (apiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html: htmlContent,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.error('[sendAccountStatusEmail] provider rejected delivery:', response.status);
        return { success: false, error: 'Email delivery failed.' };
      }

      return { success: true };
    } catch {
      console.error('[sendAccountStatusEmail] provider request failed');
      return { success: false, error: 'Email delivery failed.' };
    }
  }

  return { success: false, error: 'Email delivery is not configured.' };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SendSupervisorWelcomeOptions {
  to: string;
  fullName: string;
  companyName: string;
  position: string;
  employeeNumber: string;
  idempotencyKey?: string;
}

export async function sendSupervisorWelcomeEmail({
  to,
  fullName,
  companyName,
  position,
  employeeNumber,
  idempotencyKey,
}: SendSupervisorWelcomeOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Colegio de Montalban <onboarding@resend.dev>';
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ojt.cdm.edu.ph';
  const subject = `Set up your CdM OJT Portal supervisor account (${companyName})`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #0A3824; padding: 28px 24px; text-align: center;">
            <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0;">COLEGIO DE MONTALBAN</h1>
            <p style="color: #D5B254; font-size: 12px; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase;">Industry Practicum Portal</p>
          </div>
          <div style="padding: 32px 28px;">
            <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 12px; margin-bottom: 16px;">
              <span style="color: #047857; font-size: 12px; font-weight: 700; text-transform: uppercase;">✓ Supervisor Account Created</span>
            </div>
            <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 14px 0;">Welcome, Industry Mentor!</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
              Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
            </p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              An Industry Supervisor profile has been established for you representing <strong>${escapeHtml(companyName)}</strong> (${escapeHtml(position)}) in the Colegio de Montalban OJT Practicum System.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 0 0 24px 0;">
              <h3 style="color: #0f172a; font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Your Account Details</h3>
              <p style="font-size: 13px; color: #475569; margin: 0 0 6px 0;"><strong>Web Portal:</strong> <a href="${portalUrl}/auth/sign-in" style="color: #0A3824; font-weight: 600;">${portalUrl}/auth/sign-in</a></p>
              <p style="font-size: 13px; color: #475569; margin: 0 0 6px 0;"><strong>Login Email:</strong> <span style="font-family: monospace; color: #0f172a;">${escapeHtml(to)}</span></p>
              <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Employee ID:</strong> <span style="font-family: monospace; color: #0f172a;">${escapeHtml(employeeNumber)}</span></p>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 20px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              A separate one-time account invitation contains your password setup link. Use it to choose your own password. Contact your OJT Coordinator if you need a new invitation.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject,
          html: htmlContent,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.error('[sendSupervisorWelcomeEmail] provider rejected delivery:', res.status);
        return { success: false, error: 'Welcome email could not be delivered.' };
      }
      return { success: true };
    } catch {
      console.error('[sendSupervisorWelcomeEmail] provider request failed');
      return { success: false, error: 'Welcome email could not be delivered.' };
    }
  }

  // Never print credentials to process logs.
  return { success: false, error: 'Welcome email is not configured.' };
}
