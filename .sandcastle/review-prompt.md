# TASK

Review the changes on branch `{{BRANCH}}` for clarity, correctness, security, test coverage, and compliance with `CONTEXT.md`, ADRs, and `.sandcastle/CODING_STANDARDS.md`.

# REVIEW

Inspect the diff and commits. Look especially for:

- Leaked secret words, roles, votes, tokens, or model credentials.
- Client-side authority over game outcomes.
- Incorrect Portal ownership or duplicated realtime state.
- Race conditions, duplicate actions, reconnect errors, and stale snapshots.
- Unsafe casts and missing behavior tests.
- Changes outside the assigned issue.

Preserve intended behavior. If improvements are necessary, apply them on the same branch, run tests, and commit them. Otherwise do nothing.

Output `<promise>COMPLETE</promise>` when complete.
