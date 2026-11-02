# OJT system diagrams

Colegio de Montalban — fourth-year ICS and IBE students.

Prepared from the repository's AGENTS.md, GLOSSARY.md, ADR 0006, shared database types, schema.sql, and migrations through 20261028000300. These are repository-based documentation views, not a live database audit.

## Reading the diagrams

- **Level 0** means the context diagram: one process, external actors, and information crossing the boundary. Some schools call this the context diagram and call the next diagram Level 0; check your department's naming convention.
- **Level 1** decomposes that process into six numbered processes and six logical data stores. Rounded boxes are processes, rectangles are actors, and cylinders are data stores. Arrow labels describe data, not execution order.
- The system boundary includes mobile/web software, authentication, database, private file storage, and notification delivery. Provider internals are intentionally abstracted.
- **ERD** uses actual table names with selected key attributes. PK = primary key, FK = foreign key, UK = unique key. Crow's-foot ends denote many; a circle denotes optional. The two ERD views together cover the principal application records; they are not a complete physical schema dump.
- Open the .mmd files in a Mermaid-compatible editor to edit or export images.

## Important interpretation notes

- OJT Student, Supervisor, OJT Coordinator, and Super Admin are the four application roles. The public verifier is an unauthenticated actor, not a fifth account role.
- Supervisors see assigned students and review routine attendance and accomplishment reports. Coordinators act within their granted ICS/IBE scope, handle requirements and attendance exceptions, review incidents and appeals, and record final grades.
- Incident content is limited to its reporting student and authorized Coordinators. Its placement in a shared logical store does not grant Supervisors access.
- Only verified attendance contributes credited hours. GPS and selfies are evidence for review; offline attendance sync does not imply approval.
- Chat is between eligible Coordinator–Supervisor pairs, with an optional student tag. Students and Super Admins do not participate.
- One student can have multiple historical assignments, but only one active assignment. Evaluations are unique by student and evaluation type. Attendance is unique by student and date.
- Branch references in assignments, schedules, and HTE requests use composite (company_id, branch_id) foreign keys. Separate edges visualize both dependencies; they do not imply that any company's branch can be selected.
- Optional role profiles are shown from users to students/supervisors/coordinators/admins. These relationships do not imply every user has every profile.
- ERDs omit most reviewer/actor foreign keys, timestamps, evidence paths, and technical tables to keep the views legible. Auth internals, email queue/rate limits, pending account invitations, legacy program_heads/location tables, and schema-version bookkeeping are outside these views. The original SQL remains authoritative.

## Logical store mapping

| Store | Main records |
|---|---|
| D1 | users, students, supervisors, coordinators, admins, staff_capability_grants, audit_logs; account/invitation and authentication records |
| D2 | companies, company_branches, company_requests, student_assignments, practicum_schedules, work_schedules, non_working_days, supervisor_invites |
| D3 | attendance, internship_progress, private attendance evidence |
| D4 | reports, incident_reports, private requirements/report files |
| D5 | evaluations, evaluation_appeals, ojt_final_grades, certificates |
| D6 | announcements, notifications, chat_conversations, chat_messages, private chat attachments |

System configuration is an administrative input/output in process 1.0; no unverified system_settings table is invented. File storage and relational metadata are grouped into logical stores, not modeled as identical physical storage.

## Boundary balancing

The same five actors appear in both DFDs. Level 0 groups the detailed flows shown at Level 1:

| Actor | Level 1 processes |
|---|---|
| OJT Student | 1.0 registration/access; 2.0 placement; 3.0 attendance/progress; 4.0 submissions; 5.0 appeals/results; 6.0 feed |
| Supervisor | 1.0 access/onboarding; 3.0 attendance review; 4.0 accomplishment review; 5.0 evaluations; 6.0 chat/feed |
| OJT Coordinator | 1.0 access/account review; 2.0 placement; 3.0 exceptions/progress; 4.0 requirements/incidents; 5.0 finalization/reports; 6.0 communication |
| Super Admin | 1.0 provisioning/settings/audit metadata; 6.0 announcements |
| Public certificate verifier | 5.0 certificate verification |

Read/query requests and their corresponding records are grouped for readability. No actor writes directly to a data store, and no store transfers data directly to another store.

## DFD Level 0 — Context

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#e8f2ff","primaryTextColor":"#172b4d","primaryBorderColor":"#3976b8","lineColor":"#64748b","fontFamily":"Arial","fontSize":"16px"},"flowchart":{"curve":"basis","nodeSpacing":35,"rankSpacing":70}}}%%
flowchart LR
 S["OJT Student<br/>Mobile app"]
 V["Supervisor<br/>Web / desktop"]
 C["OJT Coordinator<br/>Web / desktop"]
 A["Super Admin<br/>Web / desktop"]
 X["Public certificate verifier"]
 P(("0<br/>OJT Monitoring<br/>and Management<br/>System"))
 S -->|"Registration and credentials; placement requests;<br/>attendance evidence; reports and incidents;<br/>evaluation appeals; information requests"| P
 P -->|"Account status; placement and schedule decisions;<br/>attendance and progress; report feedback;<br/>evaluation and completion results; announcements"| S
 V -->|"Credentials; onboarding response; attendance decisions;<br/>accomplishment decisions; evaluations;<br/>messages; information requests"| P
 P -->|"Access and onboarding results; assigned-student records;<br/>review results; messages and notifications"| V
 C -->|"Credentials; account reviews; placement and schedule decisions;<br/>requirements and incident responses; attendance exceptions;<br/>appeal decisions; final grades and completion decisions;<br/>announcements; messages; report requests"| P
 P -->|"Access results; scoped student records and submissions;<br/>review and completion results; academic summaries;<br/>messages and notifications"| C
 A -->|"Credentials; account and permission changes;<br/>system settings; audit requests; announcements"| P
 P -->|"Access results; account and settings results;<br/>audit metadata; publication results"| A
 X -->|"Certificate verification code"| P
 P -->|"Certificate verification result"| X
 classDef entity fill:#f8fafc,stroke:#64748b,color:#172b4d;
 class S,V,C,A,X entity;
```

## DFD Level 1 — Main Processes

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#e8f2ff","primaryTextColor":"#172b4d","primaryBorderColor":"#3976b8","lineColor":"#64748b","fontFamily":"Arial","fontSize":"16px"},"flowchart":{"curve":"basis","nodeSpacing":35,"rankSpacing":70}}}%%
flowchart LR
 S["OJT Student"]
 V["Supervisor"]
 C["OJT Coordinator"]
 A["Super Admin"]
 X["Public certificate verifier"]
 subgraph SYS["OJT Monitoring and Management System"]
 P1("1.0<br/>Manage accounts<br/>and system access")
 P2("2.0<br/>Manage HTE placement<br/>and practicum schedules")
 P3("3.0<br/>Review attendance<br/>and compute progress")
 P4("4.0<br/>Manage requirements,<br/>reports and incidents")
 P5("5.0<br/>Evaluate and finalize<br/>OJT completion")
 P6("6.0<br/>Deliver announcements,<br/>notifications and chat")
 D1[("D1 Accounts, profiles,<br/>permissions and audit metadata")]
 D2[("D2 HTEs, branches, requests,<br/>assignments and schedules")]
 D3[("D3 Attendance evidence<br/>and internship progress")]
 D4[("D4 Requirements, reports<br/>and confidential incidents")]
 D5[("D5 Evaluations, appeals,<br/>final grades and certificates")]
 D6[("D6 Announcements,<br/>notifications and chat")]
 P1 -->|"Account, profile, permission and audit updates"| D1
 D1 -->|"Account, permission and audit records"| P1
 D1 -->|"Student and supervisor profiles"| P2
 P2 -->|"Placement and schedule updates"| D2
 D2 -->|"HTE, placement and schedule records"| P2
 D4 -->|"Pre-deployment clearance evidence"| P2
 D2 -->|"Placement, geofence, schedule and non-working days"| P3
 P3 -->|"Attendance decisions and credited hours"| D3
 D3 -->|"Attendance evidence and progress records"| P3
 P3 -->|"Exception audit entry"| D1
 P4 -->|"Submissions and review outcomes"| D4
 D4 -->|"Requirements, reports and incidents"| P4
 D2 -->|"Student assignment scope"| P4
 D3 -->|"Verified hours and progress"| P5
 D4 -->|"Requirement and report completion"| P5
 D2 -->|"Placement details"| P5
 P5 -->|"Evaluations, appeal decisions, grades and certificates"| D5
 D5 -->|"Evaluation and completion records"| P5
 P5 -->|"Finalized student status"| D1
 P5 -->|"Completed assignment status"| D2
 P6 -->|"Messages, publications and read status"| D6
 D6 -->|"Announcements, notifications and chat history"| P6
 D1 -->|"Recipients and department permissions"| P6
 D2 -->|"Eligible coordinator-supervisor pairs"| P6
 P1 -->|"Account events"| P6
 P2 -->|"Placement and schedule events"| P6
 P3 -->|"Attendance events"| P6
 P4 -->|"Report and incident events"| P6
 P5 -->|"Evaluation and completion events"| P6
 end
 S -->|"Registration, credentials and corrections"| P1
 P1 -->|"Account and access status"| S
 V -->|"Credentials and onboarding response"| P1
 P1 -->|"Access and onboarding results"| V
 C -->|"Credentials and student account reviews"| P1
 P1 -->|"Access results and registrations for review"| C
 A -->|"Credentials, account changes, settings and audit requests"| P1
 P1 -->|"Access, account, settings and audit results"| A
 S -->|"HTE requests and schedule proposals"| P2
 P2 -->|"Placement and schedule decisions"| S
 C -->|"HTE, branch, assignment and schedule decisions"| P2
 P2 -->|"Placement requests and scoped placement records"| C
 S -->|"Time events, GPS, selfies and progress requests"| P3
 P3 -->|"Attendance status and progress"| S
 V -->|"Attendance decisions and record requests"| P3
 P3 -->|"Assigned-student evidence and review results"| V
 C -->|"Exception decisions and progress requests"| P3
 P3 -->|"Scoped attendance, exceptions and progress"| C
 S -->|"Requirements, accomplishment reports and incidents"| P4
 P4 -->|"Submission status and review feedback"| S
 V -->|"Accomplishment decisions and report requests"| P4
 P4 -->|"Assigned-student accomplishment reports and results"| V
 C -->|"Requirements review and incident responses"| P4
 P4 -->|"Scoped requirements, incidents and review results"| C
 S -->|"Evaluation appeals and result requests"| P5
 P5 -->|"Evaluations, appeal outcomes and completion results"| S
 V -->|"Midterm and final evaluations"| P5
 P5 -->|"Assigned-student evaluation records"| V
 C -->|"Appeal decisions, final grades, completion and report requests"| P5
 P5 -->|"Scoped evaluations, completion results and academic summaries"| C
 X -->|"Certificate verification code"| P5
 P5 -->|"Certificate verification result"| X
 C -->|"Announcements, messages and information requests"| P6
 P6 -->|"Messages, notifications and publication results"| C
 V -->|"Messages and information requests"| P6
 P6 -->|"Messages, announcements and notifications"| V
 A -->|"Announcements"| P6
 P6 -->|"Publication results"| A
 S -->|"Feed and notification requests"| P6
 P6 -->|"Announcements and notifications"| S
 classDef entity fill:#f8fafc,stroke:#64748b,color:#172b4d;
 class S,V,C,A,X entity;
```

## ERD — Core OJT Records

```mermaid
erDiagram
 direction LR
 users ||--o| students : "has student profile"
 users ||--o| supervisors : "has supervisor profile"
 companies |o--o{ supervisors : "affiliates"
 companies ||--o{ company_branches : "has"
 students ||--o{ student_assignments : "receives"
 companies ||--o{ student_assignments : "hosts"
 company_branches ||--o{ student_assignments : "locates"
 supervisors ||--o{ student_assignments : "supervises"
 students ||--o{ company_requests : "requests HTE verification"
 companies |o--o{ company_requests : "approved HTE"
 company_branches |o--o{ company_requests : "approved branch"
 students ||--o{ practicum_schedules : "proposes"
 companies |o--o{ practicum_schedules : "selected HTE"
 company_branches |o--o{ practicum_schedules : "selected branch"
 students ||--o{ attendance : "logs"
 student_assignments ||--o{ attendance : "covers"
 students ||--o| internship_progress : "tracks"
 students ||--o{ reports : "submits"
 students ||--o{ incident_reports : "reports confidentially"
 students ||--o{ evaluations : "receives"
 supervisors ||--o{ evaluations : "writes"
 evaluations ||--o{ evaluation_appeals : "may be appealed"
 students ||--o{ evaluation_appeals : "files"
 students ||--o| ojt_final_grades : "receives final grade"
 users ||--o{ ojt_final_grades : "records"
 students ||--o{ certificates : "receives"
 users |o--o{ certificates : "issues"
 users {
  uuid user_id PK
  text full_name
  text email UK
  text role
  text account_status
 }
 students {
  uuid student_id PK
  uuid user_id FK,UK
  text student_number UK
  text course
  int year_level
  int required_hours
  text status
 }
 supervisors {
  uuid supervisor_id PK
  uuid user_id FK,UK
  uuid company_id FK
  text position
 }
 companies {
  uuid company_id PK
  text company_name
  text address
  text status
  int max_interns
  boolean accepting_students
 }
 company_branches {
  uuid branch_id PK
  uuid company_id FK
  text branch_name
  numeric latitude
  numeric longitude
  int geofence_radius_meters
  text status
 }
 student_assignments {
  uuid assignment_id PK
  uuid student_id FK
  uuid company_id FK
  uuid branch_id FK
  uuid supervisor_id FK
  date start_date
  date end_date
  text assignment_status
 }
 company_requests {
  uuid request_id PK
  uuid student_id FK
  uuid company_id FK
  uuid branch_id FK
  text requested_company_name
  text status
 }
 practicum_schedules {
  uuid schedule_id PK
  uuid student_id FK
  uuid company_id FK
  uuid branch_id FK
  text work_modality
  date start_date
  date end_date
  text status
 }
 attendance {
  uuid attendance_id PK
  uuid student_id FK
  uuid assignment_id FK
  date attendance_date
  timestamptz time_in
  timestamptz time_out
  text verification_status
  numeric credited_hours
 }
 internship_progress {
  uuid progress_id PK
  uuid student_id FK,UK
  numeric completed_hours
  numeric remaining_hours
  text progress_status
 }
 reports {
  uuid report_id PK
  uuid student_id FK
  text report_type
  text file_path
  text status
  text supervisor_decision
 }
 incident_reports {
  uuid incident_id PK
  uuid student_id FK
  text category
  text description
  text status
  text coordinator_response
 }
 evaluations {
  uuid evaluation_id PK
  uuid student_id FK
  uuid supervisor_id FK
  text evaluation_type
  numeric performance_score
  jsonb rubric_scores
 }
 evaluation_appeals {
  uuid appeal_id PK
  uuid evaluation_id FK
  uuid student_id FK
  text appeal_reason
  text status
  numeric resolved_score
 }
 ojt_final_grades {
  uuid student_id PK,FK
  numeric final_grade
  uuid recorded_by_user_id FK
 }
 certificates {
  uuid certificate_id PK
  uuid student_id FK
  uuid issued_by_user_id FK
  text verification_code UK
  numeric hours_rendered
  text status
  timestamptz finalized_at
 }
```

## ERD — Accounts and Communication

```mermaid
erDiagram
 direction LR
 users ||--o| coordinators : "has coordinator profile"
 users ||--o| admins : "has admin profile"
 users ||--o{ staff_capability_grants : "receives scoped grants"
 users |o--o{ announcements : "authors"
 users |o--o{ notifications : "sends"
 users ||--o{ notifications : "receives"
 users |o--o{ audit_logs : "acts"
 users ||--o{ chat_conversations : "coordinator participant"
 users ||--o{ chat_conversations : "supervisor participant"
 chat_conversations ||--o{ chat_messages : "contains"
 users ||--o{ chat_messages : "sends"
 students |o--o{ chat_messages : "optional student tag"
 chat_conversations |o--o{ notifications : "related conversation"
 companies ||--o{ work_schedules : "default work hours"
 companies |o--o{ non_working_days : "company scope"
 companies ||--o{ supervisor_invites : "invites supervisor"
 users {
  uuid user_id PK
  text role
 }
 students {
  uuid student_id PK
 }
 companies {
  uuid company_id PK
 }
 coordinators {
  uuid coordinator_id PK
  uuid user_id FK,UK
  text department
 }
 admins {
  uuid admin_id PK
  uuid user_id FK,UK
 }
 staff_capability_grants {
  uuid grant_id PK
  uuid user_id FK
  text capability
  text department_scope
 }
 announcements {
  uuid announcement_id PK
  uuid author_user_id FK
  text title
  text target_role
  text target_department
 }
 notifications {
  uuid notification_id PK
  uuid sender_user_id FK
  uuid receiver_user_id FK
  uuid related_conversation_id FK
  text message
  text status
 }
 audit_logs {
  uuid log_id PK
  uuid actor_user_id FK
  text action
  text entity_type
  text entity_id
 }
 chat_conversations {
  uuid conversation_id PK
  uuid coordinator_user_id FK
  uuid supervisor_user_id FK
 }
 chat_messages {
  uuid message_id PK
  uuid conversation_id FK
  uuid sender_user_id FK
  uuid tagged_student_id FK
  text content
  text attachment_path
 }
 work_schedules {
  uuid schedule_id PK
  uuid company_id FK
  int day_of_week
 }
 non_working_days {
  uuid day_id PK
  uuid company_id FK
 }
 supervisor_invites {
  uuid invite_id PK
  uuid company_id FK
 }
```

