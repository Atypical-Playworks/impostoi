# TASK

Merge the completed branches below into the current branch:

{{BRANCHES}}

Issues:

{{ISSUES}}

# PROCESS

Read `CONTEXT.md`, relevant ADRs, and each issue before merging. Resolve conflicts conservatively and preserve unrelated work. Run:

1. `bun run test`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run build`

Only merge branches whose implementation and review completed successfully. Do not push or close issues automatically unless the caller explicitly requests it.
