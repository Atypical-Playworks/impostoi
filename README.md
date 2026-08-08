# impostoi

Hoy alguien finge ser humano. Descubre a la IA. Encuentra al impostoi.

`impostoi` is a realtime social game where four or five human Players and one AI Agent play three rounds of clues, discussion, and private voting. Each Round has one Impostor. The Agent may be the Impostor or a Civilian, but its identity is always hidden behind a temporary Alias.

The product is built for The Realtime Hackathon by Portal and Crafter Station. The live Match is powered by Portal; Supabase stores identity, completed Matches, Replays, and persistent statistics; OpenCode Zen supplies the server-side Agent.

## Local setup

Requirements:

- Bun 1.3.14 or newer.
- A Supabase project with anonymous sign-ins enabled.
- A Portal project and server secret.
- An OpenCode Zen API key.

```bash
bun install
cp .env.example .env.local
bun run dev
```

Do not commit `.env.local`. Public keys may be exposed through the browser; server secrets must remain server-only.

## Verify

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Architecture

- Portal owns live room state, presence, private roles, clues, votes, and late-join snapshots.
- Supabase Auth owns guest and persistent identities.
- Supabase Postgres owns completed Matches, Replays, Agent statistics, and Player progression.
- OpenCode Zen is called only from a server-side Agent adapter.
- Cloud Run hosts the standalone Next.js application.

See `CONTEXT.md` and `docs/adr/` for the product vocabulary and accepted architecture decisions.
