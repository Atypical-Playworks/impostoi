# Hackathon Submission

This is the release checklist and 90-second recording script for issue 12. Do
not submit until the two external URLs are replaced with real public links.

## Submission fields

| Field | Value |
| --- | --- |
| Pitch | `impostoi: descubre a la IA y al impostor en una partida realtime de pistas, charla y votos privados.` |
| Deployed product | `REPLACE_WITH_NEXT_PUBLIC_APP_URL` |
| Recorded demo (max 01:30) | `REPLACE_WITH_PUBLIC_RECORDING_URL` |
| Public repository | <https://github.com/Atypical-Playworks/impostoi> |
| Required tag | `the-realtime-hackathon` |

The pitch is 107 characters. The deployed and recorded-demo URLs must be
public `http` or `https` URLs; do not use a local URL or an unlisted link that
the jury cannot access.

## 90-second recording script

Use the fixed room code `IMPOST` and the five prepared demo Participants. The
demo is deterministic: `Gato Ninja` is the local Player, the other four
Participants are `Luna Pixel`, `Sol Rebelde`, `Rio Turbo`, and `Nube`.

| Time | Action and narration |
| --- | --- |
| 00:00-00:08 | Open the product, create room `IMPOST`, and show the 4-5 Players plus one hidden Agent. |
| 00:08-00:18 | Start the Round. Point out random Aliases, Avatars, Presence, the public Category, and the private-word card. |
| 00:18-00:30 | Submit one Clue as `Gato Ninja`; show the immutable public Clue list and the other Participants' activity. |
| 00:30-00:40 | Explain that the production room uses a Portal snapshot for late joiners; do not present the local reproducible view as a live Portal connection. |
| 00:40-00:50 | Advance the reproducible Discussion and show the public conversation surface. Explain that the production room uses Portal for live state. |
| 00:50-01:04 | Submit the local demo's AI detection vote; the production room acknowledges private votes without exposing other votes. |
| 01:04-01:16 | Submit the local demo's Impostor vote. Explain that the two hidden roles are assigned independently in the production room. |
| 01:16-01:24 | Show the demo reveal surface and explain that production reveals roles and tallies only after voting closes. |
| 01:24-01:30 | Describe the persisted Replay contract; this local reproducible view does not open a Replay. |

If narration needs more time, cut between phase transitions rather than
waiting on timers. The Discussion control is intentionally advanceable in the
reproducible demo view; the server game contract still enforces its timeout.

## Portal explanation

Portal is the authority for each live Match room. Its standard channel carries
Presence, phase transitions, public Clues, private role delivery, private
votes, and the late-join snapshot. The browser renders that state and requests
actions; it does not decide outcomes. Supabase stores completed Match history,
Replays, and progression after the live session. The reproducible recording
view in this branch is local demo scaffolding and must not be described as a
live Portal room or as an opened Replay.

## Release validation

Before submitting, verify all of the following:

1. Replace both `REPLACE_WITH_*` values above with public links.
2. Confirm the repository is public and the deployed URL opens without
   credentials.
3. Create or verify the `the-realtime-hackathon` tag over the commits made
   between 2026-08-07 19:00 and 2026-08-09 10:00 UTC-05.
4. Run `bun run test`, `bun run lint`, `bun run typecheck`, and `bun run build`.
5. Confirm the recording is no longer than 01:30 and demonstrates every
   phase listed in the script.
