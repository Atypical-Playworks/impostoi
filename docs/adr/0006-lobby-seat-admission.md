# Lobby seat admission

Status: Accepted

## Context

Room entry currently writes a participant before the Portal channel is ready. A failed or delayed Portal connection can therefore consume the final seat while the live roster still shows fewer players.

## Decision

Lobby admission uses a two-state seat lifecycle:

- `pending`: the server has reserved the seat for 60 seconds while Portal connects.
- `confirmed`: the same Guest session has a ready Portal identity and has confirmed the seat server-side.

Both states count toward capacity to prevent concurrent overbooking. Expired pending seats are released. The Host must be confirmed before additional entry or match start. Lobby clients poll the server admission view while also rendering Portal presence.

## Consequences

The server remains authoritative for capacity and admission, while Portal remains authoritative for live connection state. The UI must distinguish confirmed players from pending Players instead of treating every Portal connection as a confirmed seat.
