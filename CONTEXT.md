# impostoi

impostoi is a Spanish-first realtime social game where people try to identify an AI participant and an impostor during a timed clue game.

## Language

**Participant**: Any human or AI identity taking part in a match.

**Player**: A human participant. A Player may join as a guest or through a persistent Supabase account.

**Agent**: The AI participant configured with a real model, strategy, and version.

**Impostor**: The participant who receives the public category but not the secret word for a round.

**Civilian**: A participant who receives the secret word for a round.

**Match**: A complete session of three rounds with the same participants and Agent identity.

**Round**: One category, one secret word, one Impostor assignment, one sequential clue phase, and two voting phases.

**Clue**: A single-word, immutable public text submitted by a Participant during their 10-second sequential turn.

**Discussion**: (Removed) Clues are given sequentially and players review them live instead of a dedicated discussion phase.

**AI detection vote**: The private vote answering which visible alias belongs to the Agent.

**Impostor vote**: The private vote answering which visible alias did not receive the secret word.

**Alias**: The temporary visible name assigned to a Participant for one Match. It hides persistent identity.

**Guest session**: A temporary Supabase identity that can play without registration. Its eligible history may be migrated once to a persistent account.

**Agent profile**: The persistent record of a model, provider, strategy, and version used by the Agent.

**Camouflage rate**: The proportion of eligible rounds where the Agent was not detected.

**Impostor win rate**: The proportion of eligible rounds where the Agent avoided detection or otherwise satisfied the Impostor win condition while assigned the Impostor role.

**Replay**: A persisted, privacy-scoped record of public clues, votes, timing, structured Agent behavior, and outcomes.

**Portal room**: The standard Portal channel representing one live Match.

**Late joiner**: A Participant who connects after a Portal room has already progressed beyond its initial state and receives the current state through a snapshot.

**Seat reservation**: A temporary lobby admission held for one Guest session while Portal connection is being established.

**Pending Player**: A Player with a Seat reservation whose Portal connection has not yet been confirmed.

**Confirmed Player**: A Player whose Seat reservation has been confirmed after Portal reports a ready channel identity.

## Product rules

- Each Match has 4 or 5 human Players and exactly one Agent.
- Each Round has exactly one Impostor. The Agent may or may not be the Impostor.
- Everyone knows there is one Agent and one Impostor, but neither visible identity is known.
- The public category is visible. Civilians receive the secret word; the Impostor receives only the category.
- The Agent always tries to hide that it is an AI, whether it is Civilian or Impostor.
- The Agent uses the fixed `cautious-imitator` strategy and adapts within a Match, but does not learn persistently between Matches in the MVP.
- New participants may join only while a Match is in the lobby. Once the first Round starts, late join attempts are rejected and do not create presence.
- A lobby closes after 10 minutes empty or 30 minutes without starting; its room code is invalidated and not immediately reused.
- A reconnecting Player with the same Guest session keeps their lobby seat and Alias instead of creating a duplicate Participant.
- A Player confirms their Alias and avatar before joining; both remain fixed for the Match.
- A room code has six uppercase alphanumeric characters, excludes ambiguous characters, is server-generated and reserved, and is not immediately reused after closure.
- Server-side deadlines advance a Round when a Player does not act; missing clues, discussion completion, and votes become explicit absences or abstentions rather than blocking the Match.
- Client actions carry unique action IDs; the server processes each ID once, making retries safe and rejecting actions outside the current phase.
- A Player reconnecting after the 60-second grace period cannot reclaim a Match seat or role; they may only see the public final result when available.
- Room-code reservation is atomic and unique; collisions retry server-side and never overwrite an existing room.
- Room-entry attempts are rate-limited to five per IP and session per minute, with progressive backoff and temporary blocking after repeated failures.
- Room failures expose safe client messages and structured server error codes; logs never include tokens, secrets, words, roles, or votes.
- The Host may cancel a Match during the lobby; cancellation invalidates the room code and creates no replay or statistics. After the Match starts, Host departure uses transfer instead.
- The lobby provides copy actions for the room code and `/room/{CODE}` invite link; neither contains tokens or persistent identity data.
- The Host selects 4 or 5 human Players and confirms their Alias and avatar before server-side room reservation; these settings remain fixed for the Match.
- A room at its configured human capacity rejects additional join attempts as full without creating a session or presence.
- A lobby Seat reservation remains pending for 60 seconds and counts toward capacity; it becomes confirmed only after Portal reports a ready channel identity and the server confirms the same Guest session.
- An expired Seat reservation is released and the Player may retry with the same Alias and avatar; the lobby displays pending Players as connecting.
- The Host must be a Confirmed Player before additional Players may enter or the Match may start.
- A reconnecting Guest session reclaims its existing pending or confirmed Seat reservation instead of creating a duplicate.
- The Host may remove a Participant during the lobby; the server releases their seat and blocks that Guest session from rejoining the room. Removal is unavailable after the Match starts.
- The lobby shows the current human count, configured capacity, and Agent readiness; starting is disabled below four human Players and available only to the Host.
