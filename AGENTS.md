# impostoi

impostoi is a Spanish-first realtime social game. Players use temporary aliases and avatars, one participant is an AI agent, and one participant is the impostor. The AI and impostor roles are assigned independently and may belong to the same participant.

## Toolchain

- Use Bun; `bun.lock` is the only lockfile.
- Run the app with `bun run dev`.
- Verification commands are `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`.
- Use the `@/*` alias for imports from `src/`.

## Architecture

- Next.js App Router owns the web application and server routes.
- Portal is the authority for live room state, presence, private role delivery, clues, votes, and late-join snapshots.
- Supabase Auth owns persistent and anonymous identities.
- Supabase Postgres owns completed matches, replays, agent statistics, and player progression.
- Supabase Realtime is not used for game state.
- OpenCode Zen supplies the game agent through a server-only adapter.
- Secrets must never be sent to the browser, logged, or included in Docker build arguments.

## Domain

Before domain work, read `CONTEXT.md` and relevant ADRs under `docs/adr/`. Use the canonical terms defined there. If proposed work contradicts an ADR, surface the conflict explicitly.

## Process

- Issues and PRDs live in GitHub Issues; follow `docs/agents/issue-tracker.md`.
- Triage uses the labels documented in `docs/agents/triage-labels.md`.
- Work only on the assigned issue.
- Keep changes focused and update tests and documentation with contract changes.
- Do not mention external reference projects in public product documentation, issues, PRs, commits, or UI copy.

## Security

- Treat roles, secret words, AI identity, and individual votes as private state.
- Validate phase transitions and player permissions on the server.
- The client may render state but must not be the authority for game outcomes.
- Anonymous sessions may become persistent accounts exactly once; prevent duplicate migration of guest history.
