# Coding standards

## Style

- Use TypeScript with strict checking.
- Prefer small named functions and explicit domain types.
- Use the canonical terms from `CONTEXT.md`.
- Keep user-facing product copy in Spanish for the MVP.
- Keep technical identifiers, environment variables, API routes, and database identifiers in English.
- Avoid `any`, unchecked casts, and client-side authority for game outcomes.

## Testing

- Test behavior at the domain boundary rather than React internals.
- Cover phase transitions, role privacy, duplicate actions, reconnects, fallback responses, and guest-history migration.
- Do not make live OpenCode Zen, Portal, or Supabase calls in deterministic tests.

## Architecture

- Portal owns live room state.
- Supabase owns durable history and identity.
- Server routes validate all state-changing actions.
- Keep provider-specific AI code behind an adapter.
- Never log secret words, private roles, tokens, or raw private model prompts.
