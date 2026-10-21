## Purpose

Start a controlled development cycle for the OJT Monitoring and Management System.

The workflow must inspect the current project state, identify the next valid work, and verify changes without introducing unauthorized features.

---

## 1. Inspect Project Root

Scan the project root and identify:

- Application structure
- Web application
- Mobile application
- Shared code
- Configuration files
- Database/migration files
- Tests
- Documentation
- `.agents/` instructions
- Existing unfinished or broken work

Do not modify anything during the initial inspection.

---

## 2. Load Agent Rules

Read all relevant instructions under:

```text
.agents/
.agents/agents.md
.agents/skills/
.agents/workflows/
