# TASK

Implement issue {{TASK_ID}}: {{ISSUE_TITLE}}

Read the issue and comments with:

`gh issue view {{TASK_ID}} --repo Atypical-Playworks/impostoi --comments`

Only work on the specified issue and branch `{{BRANCH}}`.

# CONTEXT

Before domain work, read `CONTEXT.md` and relevant ADRs under `docs/adr/`. Use canonical terms and surface conflicts instead of silently overriding decisions.

# EXECUTION

Explore existing tests and patterns first. Prefer a red-green-refactor loop when behavior is testable:

1. Add one behavior-level failing test.
2. Implement the smallest change that passes it.
3. Repeat until the issue is complete.
4. Refactor without changing behavior.

Keep the change focused. Do not modify unrelated work.

# VERIFICATION

Before committing, run:

1. `bun run test`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run build`

Run focused tests for the changed area.

# COMMIT

Commit with a concise message. Do not close the issue; the merge phase handles issue state. If blocked, comment on the issue with the blocker and stop.

Output `<promise>COMPLETE</promise>` when complete.
