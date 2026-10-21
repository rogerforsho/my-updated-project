# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI for issue operations; infer the repository from its Git remote.

## Conventions

- Create issues with `gh issue create`.
- Read issues with `gh issue view <number>`.
- List issues with `gh issue list`.
- Comment, label, or close issues with the corresponding `gh issue` commands.
- When a skill says to publish a spec or ticket, create a GitHub issue.
- When a skill says to fetch a ticket, read it from GitHub Issues.

## Pull requests as a triage surface

No. External pull requests are not request items for triage.

## Wayfinding

Use one GitHub issue as the map and child issues as tickets. Link child issues with GitHub sub-issues when available; otherwise use `Part of #<parent>` in the child body. Track blockers with GitHub issue dependencies when available, falling back to a `Blocked by: #<n>` line.
