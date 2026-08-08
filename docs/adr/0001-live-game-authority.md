# Live game authority

Status: Accepted

Portal is the authority for the current live Match and Round state. It owns the Portal room, presence, phase, turn order, public Clues, private role delivery, votes, and Late joiner snapshots.

Supabase Postgres stores completed Match history, Replays, Agent statistics, and persistent Player progression. Supabase Realtime is not used as a second game-state transport.

The server validates transitions and permissions. Clients render Portal state and request actions; they do not decide outcomes locally.
