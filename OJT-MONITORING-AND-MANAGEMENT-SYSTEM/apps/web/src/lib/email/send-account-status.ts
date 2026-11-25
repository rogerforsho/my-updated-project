/**
 * Account Status Email Dispatcher for Colegio de Montalban OJT Portal
 * Sends official institutional emails to students when their accounts are approved or rejected.
 */

import { deliverEmail } from './deliver';

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
  const isApproved = status === 'active';
  const subject = isApproved
    ? 'Your OJT registration is approved - next steps'
    : 'Your OJT registration needs changes';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <title>${escapeHtml(subject)}</title>
        <style>
          @media only screen and (max-width: 620px) {
            .email-shell { width: 100% !important; }
            .email-content { padding: 28px 20px !important; }
            .email-header { padding: 28px 20px !important; }
          }
        </style>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F6F2; color: #18271D; margin: 0; padding: 24px 12px; -webkit-text-size-adjust: 100%;">
        <div class="email-shell" style="max-width: 600px; margin: 0 auto; background-color: #FFFEFB; border-radius: 18px; border: 1px solid #DCE5DB; overflow: hidden;">
          <!-- Institutional Header -->
          <div class="email-header" style="background-color: #092E1D; padding: 32px 28px; text-align: left;">
            <p style="color: #C5B174; font-size: 11px; font-weight: 800; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1.4px;">
              OJT Practicum Portal
            </p>
            <h1 style="color: #ffffff; font-family: Georgia, 'Times New Roman', serif; font-size: 23px; line-height: 1.2; font-weight: 800; margin: 0; letter-spacing: -0.3px;">
              Colegio de Montalban
            </h1>
            <p style="color: #E4DBC4; font-size: 12px; line-height: 1.5; font-weight: 600; margin: 8px 0 0;">
              Cross-Platform OJT Practicum System
            </p>
          </div>

          <!-- Body Content -->
          <div class="email-content" style="padding: 32px 36px 28px; background-color: #FFFEFB;">
            ${isApproved ? `
              <div style="display: inline-block; background-color: #EDF2EB; border: 1px solid #AFC4B1; border-radius: 9999px; padding: 7px 12px; margin-bottom: 18px;">
                <span style="color: #174E32; font-size: 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px;">
                  <span style="font-size: 11px;">Account Approved</span>
                  ✓ Account Verified &amp; Approved
                </span>
              </div>
              <h2 style="color: #18271D; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 1.15; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.4px;">
                Welcome to OJT.
              </h2>
              <p style="color: #45644A; font-size: 15px; line-height: 1.65; margin: 0 0 16px;">
                Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
              </p>
              <p style="color: #5A6A5E; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
                Your registration for the Colegio de Montalban OJT Practicum System has been reviewed and <strong style="color: #18271D;">approved</strong> by your OJT Coordinator.
              </p>

              <!-- Mobile Login Guide -->
              <div style="background-color: #EDF2EB; border-left: 4px solid #174E32; padding: 16px 18px; border-radius: 10px; margin: 0 0 20px;">
                <p style="color: #174E32; font-size: 0; font-weight: 800; margin: 0 0 6px;">
                  <span style="font-size: 13px;">Sign In Via Mobile App</span>
                  📱 Sign In Via Mobile App
                </p>
                <p style="color: #45644A; font-size: 13px; line-height: 1.6; margin: 0;">
                  Students use the <strong style="color: #18271D;">CdM OJT Mobile App</strong> only. Sign in with the email and password you registered with. The web portal is not available to students.
                </p>
              </div>

              <!-- Mandatory Requirement Notice -->
              <div style="background-color: #F4F0E3; border: 1px solid #E4DBC4; border-radius: 12px; padding: 18px 20px; margin: 0 0 24px;">
                <h3 style="color: #61481F; font-size: 0; font-weight: 800; margin: 0 0 8px;">
                  <span style="font-size: 14px;">Before you can time in</span>
                  ⚠️ Before you can time in
                </h3>
                <p style="color: #73551F; font-size: 13px; line-height: 1.65; margin: 0 0 12px;">
                  You can now sign in, but <strong>Time In / Time Out</strong> stays locked until you upload <strong>ONE PDF or DOCX file</strong> in the mobile app (Reports tab, Pre-deployment Requirements) and your OJT Coordinator approves it. The single file must contain all 4 documents:
                </p>
                <ol style="color: #73551F; font-size: 13px; line-height: 1.65; margin: 0; padding-left: 20px;">
                  <li><strong>Parent/Guardian Consent Waiver</strong> (notarized; photo or PDF)</li>
                  <li><strong>Medical Certificate</strong> (photo or PDF)</li>
                  <li><strong>Pre-OJT Orientation Certificate</strong></li>
                  <li><strong>Endorsement Letter</strong></li>
                </ol>
                <p style="color: #61481F; font-size: 12px; font-weight: 600; margin: 12px 0 0;">
                  After they are approved, propose your host company and work schedule in the app. Attendance opens once your Coordinator approves your placement and schedule.
                </p>
              </div>
            ` : `
              <div style="display: inline-block; background-color: #FBEDEA; border: 1px solid #E7B7B1; border-radius: 9999px; padding: 7px 12px; margin-bottom: 18px;">
                <span style="color: #8B3A32; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px;">
                  Changes Needed
                </span>
              </div>
              <h2 style="color: #18271D; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; line-height: 1.15; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.4px;">
                Your registration needs changes.
              </h2>
              <p style="color: #45644A; font-size: 15px; line-height: 1.65; margin: 0 0 16px;">
                Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
              </p>
              <p style="color: #5A6A5E; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
                Your OJT Coordinator reviewed your registration for the Colegio de Montalban OJT Practicum System and could not approve it yet.
              </p>

              ${reason ? `
                <div style="background-color: #FBEDEA; border-left: 4px solid #B94A40; padding: 16px 18px; border-radius: 10px; margin: 0 0 24px;">
                  <p style="color: #8B3A32; font-size: 13px; font-weight: 800; margin: 0 0 6px;">
                    Reason Provided by OJT Coordinator:
                  </p>
                  <p style="color: #6F302A; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                    &ldquo;${escapeHtml(reason)}&rdquo;
                  </p>
                </div>
              ` : ''}

              <p style="color: #45644A; font-size: 13px; line-height: 1.65; margin: 0 0 20px; padding: 16px 18px; border: 1px solid #DCE5DB; border-radius: 12px; background-color: #EDF2EB;">
                <strong style="color: #174E32;">What to do next:</strong> open the CdM OJT Mobile App and sign in. You will be taken to a screen where you can correct your details and re-upload your student ID, then resubmit for review. If you think this is a mistake, contact your OJT Coordinator (ICS or IBE Practicum Office).
              </p>
            `}

            <p style="color: #879687; font-size: 11px; line-height: 1.6; margin: 24px 0 0; border-top: 1px solid #DCE5DB; padding-top: 18px;">
              This is an automated notification from the Colegio de Montalban Cross-Platform OJT Monitoring and Management System. Please do not reply directly to this email.
            </p>
          </div>

          <!-- Institutional Footer -->
          <div style="background-color: #EDF2EB; padding: 20px 28px; text-align: center; border-top: 1px solid #DCE5DB;">
            <p style="color: #45644A; font-size: 0; margin: 0; font-weight: 700;">
              <span style="font-size: 11px;">Colegio de Montalban &bull; Kasiglahan Village, Rodriguez, Rizal</span>
              Colegio de Montalban • Kasiglahan Village, Rodriguez, Rizal
            </p>
            <p style="color: #879687; font-size: 10px; line-height: 1.5; margin: 5px 0 0;">
              Institute of Computing Studies (ICS) &amp; Institute of Business and Entrepreneurship (IBE)
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return deliverEmail({ to, subject, html: htmlContent, category: 'Account Status', idempotencyKey });
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
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ojt.cdm.edu.ph';
  const subject = `Your CdM OJT supervisor account is ready (${companyName})`;

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
            <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 14px 0;">Welcome, Supervisor!</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
              Dear <strong style="color: #0A3824;">${escapeHtml(fullName)}</strong>,
            </p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              A supervisor account has been created for you at <strong>${escapeHtml(companyName)}</strong> (${escapeHtml(position)}) in the Colegio de Montalban OJT Practicum System. You will use it on the web portal to review the attendance, reports and evaluations of the students assigned to you.
            </p>
            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin: 0 0 20px 0;">
              <p style="color: #78350f; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>First step:</strong> choose your password using the link in the separate email titled <strong>&ldquo;Set or reset your CdM OJT password&rdquo;</strong>. It may already be in your inbox. Check your spam folder if you cannot find it.
              </p>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 0 0 24px 0;">
              <h3 style="color: #0f172a; font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Your Account Details</h3>
              <p style="font-size: 13px; color: #475569; margin: 0 0 6px 0;"><strong>Web Portal:</strong> <a href="${portalUrl}/auth/sign-in" style="color: #0A3824; font-weight: 600;">${portalUrl}/auth/sign-in</a></p>
              <p style="font-size: 13px; color: #475569; margin: 0 0 6px 0;"><strong>Login Email:</strong> <span style="font-family: monospace; color: #0f172a;">${escapeHtml(to)}</span></p>
              <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Employee ID:</strong> <span style="font-family: monospace; color: #0f172a;">${escapeHtml(employeeNumber)}</span></p>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 20px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              The password link works only once. If it has expired, contact your OJT Coordinator or the system administrator to have a new one sent.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return deliverEmail({ to, subject, html: htmlContent, category: 'Supervisor Welcome', idempotencyKey });
}
