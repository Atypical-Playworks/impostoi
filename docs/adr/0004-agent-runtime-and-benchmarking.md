# Agent runtime and benchmarking

Status: Accepted

The Agent is called only from a server-side adapter. The MVP uses one OpenCode Zen model, `mimo-v2.5-free`, with the `cautious-imitator` strategy. The adapter accepts a model catalog entry so a second real model can be added without changing Match logic.

The Agent identity, model, provider, strategy, and version are hidden during a Match and revealed in the post-match Replay and public Agent rankings.

Fallback responses keep a Match moving when the model provider times out. Fallback Matches remain in history but are excluded from competitive Agent rankings.

The MVP uses direct metrics rather than Elo: Camouflage rate, AI detection rate, Impostor win rate, average suspicion votes, and response time. A future replay benchmark may feed identical human transcripts to multiple Agents.
