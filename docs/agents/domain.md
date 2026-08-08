# Domain docs

The repository uses a single-context domain layout:

- `CONTEXT.md`: canonical product language and rules.
- `docs/adr/`: accepted architectural decisions.
- `src/`: implementation.

Before proposing or implementing domain behavior, read `CONTEXT.md` and the relevant ADRs. Use terms exactly as defined there. If a needed concept is absent, record the vocabulary decision before spreading a new term through code.
