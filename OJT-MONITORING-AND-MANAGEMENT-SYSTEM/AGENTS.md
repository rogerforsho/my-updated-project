# Antigravity & Agent Operating Rules

## Project: Cross-Platform OJT Monitoring and Management System (Colegio de Montalban)

### Target Scope & Boundary
- **Institution:** Colegio de Montalban
- **Target Beneficiaries:** 4th-Year students under **Institute of Computing Studies (ICS)** and **Institute of Business and Entrepreneurship (IBE)**.
- **Explicit Exclusions:** No 1st-3rd year students, no outside institutions, no job application/recruitment systems, no MOA transactions, no payroll, and no general HR. (Offline functionality is limited specifically to mobile attendance logging with GPS satellite verification and automatic sync upon internet reconnection; all other modules require an active internet connection).

### Approved Technology Stack
- **Web App:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Mobile App:** React Native + Expo development builds + TypeScript + NativeWind
- **Backend:** Supabase (PostgreSQL, Supabase Auth, Private Storage, Row Level Security)
- **Do not replace or invent additional frameworks/technologies without explicit instructions.**

### 4 Application Account Roles
1. **OJT Student:** Own attendance, hours, reports, and notifications through the mobile app only.
2. **Supervisor:** Assigned students' attendance, reports, and evaluations through web and desktop.
3. **OJT Coordinator:** Academic OJT workflows, limited to granted ICS and/or IBE departments, through web and desktop.
4. **Super Admin:** Account provisioning and system settings through web and desktop; no routine access to academic records or chat content.

The user-facing roles are OJT Student, Supervisor, OJT Coordinator, and Super Admin. Do not expose OJT Staff or Program Head as application roles. See `docs/adr/0006-explicit-ojt-account-roles-and-review-ownership.md` before changing authorization or onboarding.

The mobile attendance flow uses native face detection and requires an installed Expo development build; Expo Go cannot load that native module.

### 9 Agile Increments
1. Authentication and role management
2. Student profile and OJT application (pre-deployment requirements)
3. Attendance and selfie submission
4. Rendered-hour computation
5. Document and report submission
6. Progress monitoring
7. Performance evaluation
8. Notifications and announcements
9. Administrative reports and finalization (read-only completed records)

### Hardware & Security Evaluation Directives
- **Hardware Constraint:** Must run cleanly on an Intel Core i5 / AMD Ryzen 5, **8 GB RAM**, 256 GB SSD machine.
- **Security Reporting Standard:** Security must be described as **"security-related features were evaluated"** under ISO/IEC 25010:2023.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use `gh` from this repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with a root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
