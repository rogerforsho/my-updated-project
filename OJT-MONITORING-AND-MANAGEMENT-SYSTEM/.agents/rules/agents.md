# AI Development Team & Project Operating Rules

## Project
**Cross-Platform On-the-Job Training (OJT) Monitoring and Management System**

The system is being developed for Colegio de Montalban to manage and monitor OJT activities for students under the Institute of Computing Studies (ICS) and Institute of Business and Entrepreneurship (IBE).

The system consists of:
- Web application (Next.js App Router + Tailwind CSS)
- Mobile application (React Native + Expo)
- Centralized database (Supabase / PostgreSQL)
- Role-based access control (RLS)

The system's purpose is to centralize OJT attendance, rendered hours, reports, progress monitoring, evaluations, notifications, and related OJT records.

---

# 1. Non-Negotiable Project Rules

These rules apply to ALL agents.

## 1.1 Do Not Invent Requirements
DO NOT add:
- Features, Pages, User roles, Database tables, Database columns, Workflows, Business rules, APIs, Services, Integrations, Technologies, Authentication methods, UI functionality
unless they are explicitly defined by the project requirements, existing implementation, database schema, or a direct user instruction.

If something is unclear: **STOP and ask for clarification.** Do not guess.

---

## 1.2 Stay Within Project Scope
The project is an OJT Monitoring and Management System.
Do not turn the system into:
- A general HR system
- A recruitment platform
- A job-search platform
- A payroll system
- A general school management system
- A general document management platform
- A general communication/social platform

Only implement functionality required by the project.

---

## 1.3 QR ATTENDANCE IS NOT PART OF THIS PROJECT
This is a strict requirement.
DO NOT implement:
- QR attendance, QR scanning, QR generation, QR tokens, QR validation, QR-based time-in, QR-based time-out, QR attendance tables, QR attendance fields

The intended attendance workflow is based on:
- Time in
- Time out
- Selfie submission
- Attendance verification
- Late-status handling
- Rendered-hour computation

---

## 1.4 Do Not Assume Missing Business Rules
Examples of information that must not be invented:
- Required OJT hours
- Exact working hours
- Grace periods
- Late rules
- Attendance approval rules
- Report approval rules
- Evaluation scoring rules
- Notification rules
- File size limits
- File retention periods
- User approval procedures

If the requirement is not defined: **Ask before implementing it.**

---

## 1.5 Preserve Existing Work
Before changing existing code:
1. Inspect the existing implementation.
2. Understand its purpose.
3. Determine whether it is required.
4. Avoid unnecessary rewrites.
5. Modify only what is necessary.

Do not rewrite working modules simply because another implementation looks cleaner.

---

# 2. Source of Truth Priority
When information conflicts, use this order:
1. Direct user instruction
2. Approved project requirements/specification
3. Current database schema
4. Existing project architecture and code
5. Capstone manuscript
6. General technical assumptions

Never override a direct user instruction with an assumption from the manuscript or existing code.
If two project sources conflict and the conflict cannot be resolved: **STOP and ask the user.**

---

# 3. Current Technology Direction
The project is intended to use:
### Web
- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS

### Mobile
- React Native
- Expo (Expo Go)
- TypeScript
- NativeWind

### Backend / Platform
- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Private Storage & RLS

### Development
- Git
- GitHub
- VS Code

Do not replace the stack without explicit authorization.

---

# 4. Current User Roles
The system currently defines these 6 roles:
1. **Student**
2. **Coordinator**
3. **Supervisor**
4. **ProgramHead**
5. **Admin**
6. **IT Experts / Evaluators** (ISO/IEC 25010:2023 evaluation)

Do not create additional roles unless explicitly requested.

---

# 5. Core System Areas
The project currently covers:

## Student
- Student account & profile
- OJT assignment
- Online Attendance (Selfie-based)
- Rendered hours computation
- Digital reports and requirements
- Progress monitoring
- Notifications & announcements

## Coordinator
- Student monitoring & approvals
- Attendance verification
- Report/document checking
- OJT progress monitoring
- Company & supervisor assignment
- Evaluations and administrative records

## Company Supervisor
- Assigned trainees
- Trainee attendance verification & selfie review
- Trainee activity/record review
- Feedback & performance evaluation

## Program Head
- Department/program monitoring (ICS / IBE)
- OJT summary reports
- Student completion status

## Admin
- User account management
- System records
- Announcements
- Configuration/settings

---

# 6. Database Rules
The current PostgreSQL/Supabase schema must be treated as an important source of truth.
Current major entities include:
- `users`
- `students`
- `coordinators`
- `supervisors`
- `program_heads`
- `admins`
- `companies`
- `student_assignments`
- `attendance`
- `reports`
- `evaluations`
- `notifications`
- `internship_progress`
- `work_schedules`
- `announcements`

Do not invent the purpose or behavior of unclear tables. Ask for clarification before making a destructive change.

---

# 7. Attendance Rules
Attendance currently uses:
- Student
- OJT assignment
- Attendance date
- Time in & time-in selfie
- Time out & time-out selfie
- Verification status
- Late status
- Rendered-hour computation

Attendance must NOT use QR codes or offline synchronization queues.

---

# 8. Security Rules
- Implement authentication correctly.
- Enforce role-based authorization and Supabase Row Level Security (RLS).
- Protect restricted pages and routes.
- Prevent IDOR vulnerabilities.
- Validate uploaded files and store selfies securely in private buckets.
- Avoid exposing service-role credentials to client applications.
- Never hardcode secrets.

---

# 9. UI Rules
- Modern, clean, professional
- Green/teal primary theme
- Consistent spacing and clear navigation
- Responsive web interface
- Appropriate mobile layouts

---

# 10. Architect Agent Role & Workflow
The Architect Agent is responsible for:
- Understanding the complete project context and planning implementation
- Maintaining consistency between web, mobile, database, and backend
- Breaking work into manageable tasks and preventing scope creep
- Producing: Current State, Target State, Files Affected, Database Impact, Security Impact, Testing Requirements, Implementation Order

---

# 11. Engineer Agent Role & Workflow
The Engineer Agent is responsible for:
- Writing production-quality code following the Architect's approved plan
- Inspect $\to$ Plan $\to$ Implement $\to$ Test $\to$ Fix $\to$ Report
- Running type checks, linting, and build checks

---

# 12. Definition of Done
A task is complete only when:
- The requested functionality is implemented without unauthorized additions.
- Type checking and build checks pass cleanly.
- Database changes and RLS policies are applied correctly.
- No QR attendance or offline queuing functionality is introduced.
- The implementation matches the project requirements and engineering standards.
