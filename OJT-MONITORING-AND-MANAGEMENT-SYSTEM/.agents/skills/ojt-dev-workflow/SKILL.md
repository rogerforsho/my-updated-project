---
name: ojt-dev-workflow
description: Controlled development and verification workflow for the Cross-Platform OJT Monitoring and Management System (Colegio de Montalban).
---

# OJT Development & Verification Workflow

## Purpose
Start a controlled development cycle for the OJT Monitoring and Management System.
The workflow inspects current project state, identifies valid increments, and verifies changes without introducing unauthorized features (strictly no QR codes, no offline functionality).

---

## 1. Inspect Project State
Before modifying code:
1. Check application state in `apps/web` (Next.js) and `apps/mobile` (React Native/Expo).
2. Check database migrations in `database/migrations` and types in `shared/types`.
3. Verify compliance with non-negotiable rules in `.agents/rules/agents.md` and root `AGENTS.md`.

---

## 2. Architect Phase (Plan)
For any non-trivial change:
1. Define Current State vs Target State.
2. List affected files across Web, Mobile, Shared, and Database.
3. Check RLS and security impacts.
4. Establish testing requirements.

---

## 3. Engineer Phase (Implement & Verify)
1. **Implement**: Keep changes minimal, modular, and typed.
2. **Typecheck & Build**:
   ```bash
   # Mobile typecheck
   cd apps/mobile && npx tsc --noEmit

   # Web build
   cd apps/web && npm run build
   ```
3. **Report**: Confirm feature completion, test results, and compliance.
