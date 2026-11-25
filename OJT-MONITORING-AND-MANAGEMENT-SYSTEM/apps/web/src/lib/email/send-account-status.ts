/**
 * Branded transactional email templates for Colegio de Montalban's OJT portal.
 * The workflow and delivery behavior stay in the callers; this module owns presentation only.
 */

import { deliverEmail } from './deliver';

const colors = {
  green: '#092E1D', greenBright: '#0A3824', greenText: '#174E32', ink: '#18271D',
  muted: '#5A6A5E', soft: '#F4F6F2', surface: '#FFFEFB', line: '#DCE5DB',
  paleGreen: '#EDF2EB', gold: '#C5B174', paleGold: '#F4F0E3', goldText: '#73551F',
  paleRed: '#FBEDEA', red: '#8B3A32',
};

const portalUrl = () => (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) || 'https://ojt.cdm.edu.ph';

function renderShell(title: string, content: string): string {
  const logoUrl = `${portalUrl()}/logo.png`;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <title>${escapeHtml(title)}</title>
        <style>
          @media only screen and (max-width: 620px) {
            .email-body { padding: 20px 12px !important; }
            .email-header, .email-content, .email-footer { padding-left: 22px !important; padding-right: 22px !important; }
            .email-title { font-size: 28px !important; }
            .email-button { display: block !important; text-align: center !important; }
          }
        </style>
      </head>
      <body class="email-body" style="margin:0; padding:32px 16px; background:${colors.soft}; color:${colors.ink}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-text-size-adjust:100%;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(title)} — Colegio de Montalban OJT Practicum Portal</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
          <table role="presentation" class="email-shell" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:${colors.surface}; border:1px solid ${colors.line}; border-radius:24px; overflow:hidden;">
            <tr><td class="email-header" style="padding:28px 32px; background:${colors.green};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="48" valign="middle"><img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="Colegio de Montalban seal" style="display:block; width:40px; height:40px; border-radius:12px; background:${colors.paleGreen}; padding:4px; box-sizing:border-box;"></td>
                <td style="padding-left:12px;"><p style="margin:0 0 4px; color:${colors.gold}; font-size:11px; line-height:1.4; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">OJT Practicum Portal</p><p style="margin:0; color:#FFFFFF; font-size:21px; line-height:1.2; font-weight:800; letter-spacing:-.3px;">Colegio de Montalban</p></td>
              </tr></table>
              <p style="margin:18px 0 0; color:#E4DBC4; font-size:12px; line-height:1.5; font-weight:600;">Institute of Computing Studies · Institute of Business and Entrepreneurship</p>
            </td></tr>
            <tr><td class="email-content" style="padding:36px 40px 30px;">${content}</td></tr>
            <tr><td class="email-footer" style="padding:22px 32px; background:${colors.paleGreen}; border-top:1px solid ${colors.line}; text-align:center;"><p style="margin:0; color:${colors.greenText}; font-size:11px; line-height:1.5; font-weight:700;">Colegio de Montalban · Kasiglahan Village, Rodriguez, Rizal</p><p style="margin:6px 0 0; color:#879687; font-size:10px; line-height:1.5;">Automated message from the OJT Practicum Portal. Please do not reply directly.</p></td></tr>
          </table>
        </td></tr></table>
      </body>
    </html>
  `;
}

function renderBadge(label: string, background: string, border: string, foreground: string): string {
  return `<span style="display:inline-block; margin:0 0 20px; padding:7px 12px; border:1px solid ${border}; border-radius:999px; background:${background}; color:${foreground}; font-size:11px; line-height:1.2; font-weight:800; letter-spacing:.7px; text-transform:uppercase;">${label}</span>`;
}

function renderPanel(content: string, background: string, border: string, accent?: string): string {
  return `<div style="margin:0 0 22px; padding:18px 20px; border:1px solid ${border}; border-left:4px solid ${accent || border}; border-radius:14px; background:${background};">${content}</div>`;
}

function renderButton(label: string, href: string): string {
  return `<a class="email-button" href="${escapeHtml(href)}" style="display:inline-block; padding:13px 20px; border-radius:12px; background:${colors.greenBright}; color:#FFFFFF; font-size:14px; line-height:1.2; font-weight:800; text-decoration:none;">${label} &rarr;</a>`;
}

interface SendAccountStatusOptions { to: string; fullName: string; status: 'active' | 'rejected'; reason?: string; idempotencyKey?: string; }

export async function sendAccountStatusEmail({ to, fullName, status, reason, idempotencyKey }: SendAccountStatusOptions): Promise<{ success: boolean; error?: string }> {
  const isApproved = status === 'active';
  const subject = isApproved ? 'Your OJT registration is approved - next steps' : 'Your OJT registration needs changes';
  const content = isApproved ? `
    ${renderBadge('Account Approved', colors.paleGreen, '#AFC4B1', colors.greenText)}
    <h1 class="email-title" style="margin:0 0 16px; color:${colors.ink}; font-size:32px; line-height:1.1; font-weight:850; letter-spacing:-1px;">Welcome to OJT.</h1>
    <p style="margin:0 0 14px; color:${colors.greenText}; font-size:15px; line-height:1.65;">Dear <strong style="color:${colors.greenBright};">${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 24px; color:${colors.muted}; font-size:15px; line-height:1.75;">Your registration for the Colegio de Montalban OJT Practicum System has been reviewed and <strong style="color:${colors.ink};">approved</strong> by your OJT Coordinator.</p>
    ${renderPanel('<p style="margin:0 0 7px; color:' + colors.greenText + '; font-size:13px; line-height:1.4; font-weight:800;">Sign In Via Mobile App</p><p style="margin:0; color:#45644A; font-size:13px; line-height:1.65;">Students use the <strong style="color:' + colors.ink + ';">CdM OJT Mobile App</strong> only. Sign in with the email and password you registered with. The web portal is not available to students.</p>', colors.paleGreen, '#AFC4B1', colors.greenText)}
    ${renderPanel('<h2 style="margin:0 0 9px; color:#61481F; font-size:14px; line-height:1.4; font-weight:800;">Before you can time in</h2><p style="margin:0 0 12px; color:' + colors.goldText + '; font-size:13px; line-height:1.65;">You can now sign in, but <strong>Time In / Time Out</strong> stays locked until you upload <strong>ONE PDF or DOCX file</strong> in the mobile app (Reports tab, Pre-deployment Requirements) and your OJT Coordinator approves it. The single file must contain all 4 documents:</p><ol style="margin:0; padding-left:20px; color:' + colors.goldText + '; font-size:13px; line-height:1.65;"><li><strong>Parent/Guardian Consent Waiver</strong> (notarized; photo or PDF)</li><li><strong>Medical Certificate</strong> (photo or PDF)</li><li><strong>Pre-OJT Orientation Certificate</strong></li><li><strong>Endorsement Letter</strong></li></ol><p style="margin:12px 0 0; color:#61481F; font-size:12px; line-height:1.55; font-weight:600;">After they are approved, propose your host company and work schedule in the app. Attendance opens once your Coordinator approves your placement and schedule.</p>', colors.paleGold, '#E4DBC4', '#B79A55')}
    ${renderButton('Open the portal', `${portalUrl()}/auth/sign-in`)}
  ` : `
    ${renderBadge('Changes Needed', colors.paleRed, '#E7B7B1', colors.red)}
    <h1 class="email-title" style="margin:0 0 16px; color:${colors.ink}; font-size:32px; line-height:1.1; font-weight:850; letter-spacing:-1px;">Your registration needs changes.</h1>
    <p style="margin:0 0 14px; color:${colors.greenText}; font-size:15px; line-height:1.65;">Dear <strong style="color:${colors.greenBright};">${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 24px; color:${colors.muted}; font-size:15px; line-height:1.75;">Your OJT Coordinator reviewed your registration for the Colegio de Montalban OJT Practicum System and could not approve it yet.</p>
    ${reason ? renderPanel('<p style="margin:0 0 7px; color:' + colors.red + '; font-size:13px; line-height:1.4; font-weight:800;">Reason Provided by OJT Coordinator</p><p style="margin:0; color:#6F302A; font-size:14px; line-height:1.65; font-style:italic;">&ldquo;' + escapeHtml(reason) + '&rdquo;</p>', colors.paleRed, '#E7B7B1', '#B94A40') : ''}
    ${renderPanel('<p style="margin:0; color:' + colors.greenText + '; font-size:13px; line-height:1.65;"><strong>What to do next:</strong> open the CdM OJT Mobile App and sign in. You will be taken to a screen where you can correct your details and re-upload your student ID, then resubmit for review. If you think this is a mistake, contact your OJT Coordinator (ICS or IBE Practicum Office).</p>', colors.paleGreen, colors.line, colors.greenText)}
    ${renderButton('Review your registration', `${portalUrl()}/auth/sign-in`)}
  `;
  return deliverEmail({ to, subject, html: renderShell(subject, content), category: 'Account Status', idempotencyKey });
}

export interface SendSupervisorWelcomeOptions { to: string; fullName: string; companyName: string; position: string; employeeNumber: string; idempotencyKey?: string; }

export async function sendSupervisorWelcomeEmail({ to, fullName, companyName, position, employeeNumber, idempotencyKey }: SendSupervisorWelcomeOptions): Promise<{ success: boolean; error?: string }> {
  const subject = `Your CdM OJT supervisor account is ready (${companyName})`;
  const content = `
    ${renderBadge('Supervisor Account Created', colors.paleGreen, '#AFC4B1', colors.greenText)}
    <h1 class="email-title" style="margin:0 0 16px; color:${colors.ink}; font-size:32px; line-height:1.1; font-weight:850; letter-spacing:-1px;">Welcome, Supervisor.</h1>
    <p style="margin:0 0 14px; color:${colors.greenText}; font-size:15px; line-height:1.65;">Dear <strong style="color:${colors.greenBright};">${escapeHtml(fullName)}</strong>,</p>
    <p style="margin:0 0 24px; color:${colors.muted}; font-size:15px; line-height:1.75;">A supervisor account has been created for you at <strong style="color:${colors.ink};">${escapeHtml(companyName)}</strong> (${escapeHtml(position)}) in the Colegio de Montalban OJT Practicum System. You will use it on the web portal to review the attendance, reports and evaluations of the students assigned to you.</p>
    ${renderPanel('<p style="margin:0; color:' + colors.goldText + '; font-size:13px; line-height:1.65;"><strong>First step:</strong> choose your password using the link in the separate email titled <strong>&ldquo;Set or reset your CdM OJT password&rdquo;</strong>. It may already be in your inbox. Check your spam folder if you cannot find it.</p>', colors.paleGold, '#E4DBC4', '#B79A55')}
    <div style="margin:0 0 24px; padding:20px; border:1px solid ${colors.line}; border-radius:14px; background:${colors.paleGreen};"><h2 style="margin:0 0 13px; color:${colors.ink}; font-size:14px; line-height:1.4; font-weight:800;">Your account details</h2><p style="margin:0 0 7px; color:${colors.muted}; font-size:13px; line-height:1.55;"><strong>Web Portal:</strong> <a href="${escapeHtml(`${portalUrl()}/auth/sign-in`)}" style="color:${colors.greenText}; font-weight:800;">${escapeHtml(`${portalUrl()}/auth/sign-in`)}</a></p><p style="margin:0 0 7px; color:${colors.muted}; font-size:13px; line-height:1.55;"><strong>Login Email:</strong> <span style="color:${colors.ink}; font-family:monospace;">${escapeHtml(to)}</span></p><p style="margin:0; color:${colors.muted}; font-size:13px; line-height:1.55;"><strong>Employee ID:</strong> <span style="color:${colors.ink}; font-family:monospace;">${escapeHtml(employeeNumber)}</span></p></div>
    ${renderButton('Open the web portal', `${portalUrl()}/auth/sign-in`)}
    <p style="margin:22px 0 0; padding-top:18px; border-top:1px solid ${colors.line}; color:#879687; font-size:11px; line-height:1.6;">The password link works only once. If it has expired, contact your OJT Coordinator or the system administrator to have a new one sent.</p>
  `;
  return deliverEmail({ to, subject, html: renderShell(subject, content), category: 'Supervisor Welcome', idempotencyKey });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
