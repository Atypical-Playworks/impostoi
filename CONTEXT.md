# impostoi

impostoi is a Spanish-first realtime social game where people try to identify an AI participant and an impostor during a timed clue game.

## Language

**Participant**: Any human or AI identity taking part in a match.

**Player**: A human participant. A Player may join as a guest or through a persistent Supabase account.

**Agent**: The AI participant configured with a real model, strategy, and version.

**Impostor**: The participant who receives the public category but not the secret word for a round.

**Civilian**: A participant who receives the secret word for a round.

**Match**: A complete session of three rounds with the same participants and Agent identity.

**Round**: One category, one secret word, one Impostor assignment, one clue phase, one discussion phase, and two voting phases.

**Clue**: An immutable public text submitted by a Participant during their timed turn.

**Discussion**: The public timed conversation after all Clues are submitted and before voting closes.

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

## Product rules

- Each Match has 4 or 5 human Players and exactly one Agent.
- Each Round has exactly one Impostor. The Agent may or may not be the Impostor.
- Everyone knows there is one Agent and one Impostor, but neither visible identity is known.
- The public category is visible. Civilians receive the secret word; the Impostor receives only the category.
- The Agent always tries to hide that it is an AI, whether it is Civilian or Impostor.
- The Agent uses the fixed `cautious-imitator` strategy and adapts within a Match, but does not learn persistently between Matches in the MVP.
