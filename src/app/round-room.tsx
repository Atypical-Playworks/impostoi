"use client";

import { Portal } from "@portalsdk/core";
import { PortalProvider, useChannel } from "@portalsdk/react";
import {
  Check,
  ChevronLeft,
  Clock3,
  MessageCircle,
  MessagesSquare,
  Send,
  Shield,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  MatchPhase,
  PrivateGameView,
  VotingStage,
} from "@/lib/game-state";
import { canStartLobby, liveAction, readLiveMatchView } from "@/lib/live-match";
import {
  canSubmitClue,
  formatTimer,
  phaseTitle,
  votingTitle,
} from "@/lib/round-ui";

type RoundParticipant = {
  id: string;
  alias: string;
  avatar: string;
  activity: "idle" | "clue" | "discussion" | "voting";
  isYou?: boolean;
  isHost?: boolean;
};

type PlayerProfile = { alias: string; avatar: string };

function readPlayerProfile(): PlayerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem("impostoi_join_profile") ?? "null",
    ) as Partial<PlayerProfile> | null;
    return value?.alias && value.avatar
      ? { alias: value.alias, avatar: value.avatar }
      : null;
  } catch {
    return null;
  }
}

type LiveSetup =
  | { status: "loading" }
  | { status: "fallback" }
  | { status: "error" }
  | { status: "ready"; client: Portal; token: string };

type LobbyConfig = {
  capacity: 4 | 5;
  agentReady: boolean;
  isHost: boolean;
};

type PublicRuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  portalKey: string;
};

export function RoundRoom({
  onLeave,
  roomId,
  lobbyConfig = { capacity: 4, agentReady: false, isHost: false },
}: {
  onLeave: () => void;
  roomId: string;
  lobbyConfig?: LobbyConfig;
}) {
  const [setup, setSetup] = useState<LiveSetup>({ status: "loading" });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (retryNonce > 0) setSetup({ status: "loading" });

    let active = true;
    async function connect() {
      try {
        if (!readPlayerProfile()) {
          if (active) setSetup({ status: "error" });
          return;
        }
        const configResponse = await fetch("/api/config", {
          cache: "no-store",
        });
        if (!configResponse.ok) throw new Error("public-config");
        const config = (await configResponse.json()) as PublicRuntimeConfig;
        if (
          !config.portalKey ||
          !config.supabaseUrl ||
          !config.supabasePublishableKey
        ) {
          if (active) setSetup({ status: "fallback" });
          return;
        }
        const guest = await fetch("/api/auth/guest", { method: "POST" });
        if (!guest.ok) throw new Error("guest-session");
        const tokenResponse = await fetch("/api/portal/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        if (!tokenResponse.ok) throw new Error("portal-token");
        const payload = (await tokenResponse.json()) as { token?: string };
        if (!payload.token) throw new Error("portal-token");
        if (active) {
          setSetup({
            status: "ready",
            client: new Portal({
              apiKey: config.portalKey,
              token: payload.token,
            }),
            token: payload.token,
          });
        }
      } catch {
        if (active) setSetup({ status: "error" });
      }
    }
    void connect();
    return () => {
      active = false;
    };
  }, [roomId, retryNonce]);

  if (setup.status === "fallback") {
    return (
      <RoundConnection
        onLeave={onLeave}
        roomId={roomId}
        label="Configura las variables publicas para conectar la sala"
      />
    );
  }
  if (setup.status === "loading") {
    return (
      <LiveLobby
        loading
        onLeave={onLeave}
        onRetry={() => setRetryNonce((current) => current + 1)}
        onStart={() => undefined}
        participants={[]}
        roomCode={null}
        roomId={roomId}
        {...lobbyConfig}
      />
    );
  }
  if (setup.status === "error") {
    return (
      <RoundConnection
        onLeave={onLeave}
        roomId={roomId}
        label="No se pudo conectar con la sala"
      />
    );
  }
  return (
    <PortalProvider client={setup.client} token={setup.token}>
      <LiveRoundRoom
        key={`${roomId}-${retryNonce}`}
        channelId={`room-${roomId}`}
        lobbyConfig={lobbyConfig}
        onLeave={onLeave}
        onRetry={() => setRetryNonce((current) => current + 1)}
      />
    </PortalProvider>
  );
}

function RoundConnection({
  onLeave,
  roomId,
  label,
}: {
  onLeave: () => void;
  roomId: string;
  label: string;
}) {
  return (
    <main className="round-shell">
      <header className="round-header">
        <button type="button" className="back-button" onClick={onLeave}>
          <ChevronLeft size={18} /> Salir de la sala
        </button>
        <div className="round-brand">
          impostoi <span>ROOM {roomId}</span>
        </div>
        <div className="connection-status">
          <i /> {label}
        </div>
      </header>
    </main>
  );
}

function LiveLobby({
  onLeave,
  onStart,
  onRetry,
  participants,
  roomCode,
  roomId,
  portalStatus = "connecting",
  transferHost,
  capacity = 4,
  agentReady = false,
  isHost = false,
  loading = false,
  timedOut = false,
  actionError = null,
}: {
  onLeave: () => void;
  onStart: () => void;
  onRetry?: () => void;
  participants: RoundParticipant[];
  roomCode: string | null;
  roomId: string;
  portalStatus?: string;
  transferHost?: ReactNode;
  capacity?: 4 | 5;
  agentReady?: boolean;
  isHost?: boolean;
  loading?: boolean;
  timedOut?: boolean;
  actionError?: string | null;
}) {
  const isPending = loading;
  const canStart = canStartLobby({
    participantCount: participants.length,
    agentReady,
    isHost,
  });
  const startDisabled = isPending || !canStart;
  const lobbyMessage = loading
    ? null
    : timedOut
      ? portalStatus === "blocked"
        ? "Portal rechazo la conexion. Revisa la API key y los permisos del canal."
        : portalStatus === "ready"
          ? "Portal conecto, pero aun no entrego la lista de participantes."
          : `Portal esta en estado ${portalStatus}.`
      : !isHost
        ? "Solo el anfitrion puede comenzar la ronda."
        : !agentReady
          ? "La IA aun no esta lista."
          : participants.length < 4
            ? `Faltan ${4 - participants.length} jugadores para comenzar.`
            : "Comparte el codigo para que tus amigos se unan.";
  return (
    <main className="round-shell">
      {transferHost}
      <header className="round-header">
        <button type="button" className="back-button" onClick={onLeave}>
          <ChevronLeft size={18} /> Salir de la sala
        </button>
        <div className="round-brand">
          impostoi <span>ROOM {roomId}</span>
        </div>
        <div className="connection-status">
          <i /> Portal: {portalStatus} · Esperando jugadores
        </div>
      </header>
      <div className="round-layout">
        <section className="round-main">
          <div className="round-heading">
            <div>
              <p className="eyebrow">Sala de espera</p>
              <h1>Tu sala esta lista</h1>
            </div>
            <output
              className={`room-code-badge${isPending ? " skeleton-block" : " lobby-reveal"}`}
              aria-label={isPending ? "Codigo de sala cargando" : undefined}
            >
              {isPending ? <span className="sr-only">Cargando</span> : roomCode}
            </output>
          </div>
          <div className="round-card lobby-card">
            <span
              className={`big-round-icon${isPending ? " skeleton-icon" : ""}`}
            >
              {!isPending && <Sparkles size={32} />}
            </span>
            <p className="eyebrow">
              {isHost ? "Eres el anfitrion" : "Sala de espera"}
            </p>
            {timedOut ? (
              <>
                <h2>No pudimos cargar la sala</h2>
                <p>{lobbyMessage}</p>
                <button
                  type="button"
                  className="round-primary"
                  onClick={onRetry}
                >
                  Reintentar
                </button>
              </>
            ) : (
              <>
                <h2>{loading ? "" : "Esperando jugadores"}</h2>
                {loading ? (
                  <span className="skeleton-line lobby-title-skeleton" />
                ) : (
                  <>
                    <p>{actionError ?? lobbyMessage}</p>
                    {actionError ? (
                      <p role="alert">Revisa la conexion e intenta de nuevo.</p>
                    ) : null}
                  </>
                )}
                <button
                  type="button"
                  className="round-primary"
                  disabled={startDisabled}
                  onClick={onStart}
                >
                  {loading ? "Cargando sala..." : "Comenzar ronda"}
                  {!loading && <Target size={19} />}
                </button>
              </>
            )}
          </div>
        </section>
        <aside className="round-sidebar">
          <div className="sidebar-heading">
            <Users size={19} />
            <strong>Participantes</strong>
            {loading ? (
              <span className="skeleton-line participant-count-skeleton" />
            ) : (
              <span>
                {participants.length}/{capacity}
              </span>
            )}
          </div>
          <div className="participant-list">
            {loading
              ? ["skeleton-1", "skeleton-2"].map((id) => (
                  <div className="participant-card" key={id}>
                    <span className="round-avatar skeleton-avatar" />
                    <div className="participant-skeleton-copy">
                      <span className="skeleton-line" />
                      <span className="skeleton-line" />
                    </div>
                  </div>
                ))
              : participants.map((participant) => (
                  <div
                    className="participant-card lobby-reveal"
                    key={participant.id}
                  >
                    <span
                      className="round-avatar"
                      style={{ backgroundColor: participant.avatar }}
                    >
                      {participant.alias[0]}
                    </span>
                    <div>
                      <strong>
                        {participant.alias}
                        {participant.isYou ? " (tu)" : ""}
                      </strong>
                      <small>
                        <i className={`activity-dot ${participant.activity}`} />
                        {participant.isHost
                          ? " Anfitrion"
                          : participant.isYou
                            ? " Tu"
                            : " Conectado"}
                      </small>
                    </div>
                  </div>
                ))}
          </div>
          <div className="privacy-note">
            <Shield size={17} />
            <span>Los roles y votos son privados hasta la revelacion.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

type LiveMessage = {
  [key: string]: unknown;
};

function LobbyHostTransfer({
  roomCode,
  shouldTransfer,
  onTransferred,
}: {
  roomCode: string;
  shouldTransfer: boolean;
  onTransferred: () => void;
}) {
  const transferStarted = useRef(false);
  useEffect(() => {
    if (!shouldTransfer) {
      transferStarted.current = false;
      return;
    }
    if (transferStarted.current) return;
    transferStarted.current = true;
    void fetch(`/api/rooms/${roomCode}/host`, {
      method: "POST",
    }).then((response) => {
      if (response.ok) onTransferred();
    });
  }, [onTransferred, roomCode, shouldTransfer]);
  return null;
}

function LiveRoundRoom({
  channelId,
  lobbyConfig,
  onLeave,
  onRetry,
}: {
  channelId: string;
  lobbyConfig: LobbyConfig;
  onLeave: () => void;
  onRetry: () => void;
}) {
  const [draftClue, setDraftClue] = useState("");
  const [draftDiscussion, setDraftDiscussion] = useState("");
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [sentClue, setSentClue] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sentVotes, setSentVotes] = useState<
    Partial<Record<VotingStage, boolean>>
  >({});
  const [isHost, setIsHost] = useState(lobbyConfig.isHost);
  const [profile] = useState<PlayerProfile | null>(() => readPlayerProfile());
  const { messages, ext, me, presence, setMetadata, status } =
    useChannel<LiveMessage>({
      channelId,
      metadata: profile ? { ...profile, activity: "idle", isHost } : {},
    });

  let view: PrivateGameView | null = readLiveMatchView(ext?.match);
  for (const message of messages) {
    const next = readLiveMatchView(message.content);
    if (next) view = next;
  }

  const hasMatchView = view !== null;
  const hasPresenceSnapshot = presence?.kind === "detailed";
  const [actionError, setActionError] = useState<string | null>(null);
  const localParticipant: RoundParticipant | null =
    me && profile
      ? {
          id: me.id,
          alias: profile.alias,
          avatar: profile.avatar,
          activity: "idle",
          isYou: true,
          isHost,
        }
      : null;
  const hasPortalIdentity = localParticipant !== null;
  const [lobbyTimedOut, setLobbyTimedOut] = useState(false);

  useEffect(() => {
    if (hasMatchView || hasPresenceSnapshot || hasPortalIdentity) {
      setLobbyTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setLobbyTimedOut(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [hasMatchView, hasPortalIdentity, hasPresenceSnapshot]);

  useEffect(() => {
    const heartbeat = () => {
      void fetch(`/api/rooms/${channelId.replace(/^room-/, "")}/heartbeat`, {
        method: "POST",
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 10_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [channelId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (me && profile)
      setMetadata({
        alias: profile.alias,
        avatar: profile.avatar,
        isHost,
        activity:
          view?.phase === "clue_phase"
            ? "clue"
            : view?.phase === "discussion"
              ? "discussion"
              : view?.phase === "voting"
                ? "voting"
                : "idle",
      });
  }, [isHost, me, profile, setMetadata, view?.phase]);

  const submitAction = async (
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    setActionError(null);
    const response = await fetch(
      `/api/rooms/${channelId.replace(/^room-/, "")}/action`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      },
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setActionError(result?.error ?? "No se pudo procesar la accion.");
      return;
    }
  };

  if (!view) {
    const connectedParticipants: RoundParticipant[] =
      presence?.kind === "detailed"
        ? presence.participants.map((participant) => {
            const metadata = participant.metadata ?? {};
            const alias =
              typeof metadata.alias === "string"
                ? metadata.alias
                : (participant.username ?? "Participante");
            const avatar =
              typeof metadata.avatar === "string" ? metadata.avatar : "#888888";
            const activity =
              metadata.activity === "clue" ||
              metadata.activity === "discussion" ||
              metadata.activity === "voting"
                ? metadata.activity
                : "idle";
            const isHost = metadata.isHost === true;
            return {
              id: participant.id,
              alias,
              avatar,
              activity,
              isYou: participant.id === me?.id,
              isHost,
            };
          })
        : localParticipant
          ? [localParticipant]
          : [];
    const currentHost = connectedParticipants.find(
      (participant) => participant.isHost,
    );
    const nextHost = connectedParticipants[0];
    if (!hasPresenceSnapshot && !hasPortalIdentity && !lobbyTimedOut) {
      return (
        <LiveLobby
          loading
          onLeave={onLeave}
          onRetry={onRetry}
          onStart={() => undefined}
          participants={[]}
          roomCode={channelId.replace(/^room-/, "")}
          roomId={channelId.replace(/^room-/, "")}
          {...lobbyConfig}
          portalStatus={status}
          actionError={actionError}
        />
      );
    }
    if (!hasPresenceSnapshot && !hasPortalIdentity && lobbyTimedOut) {
      return (
        <LiveLobby
          onLeave={onLeave}
          onRetry={onRetry}
          onStart={() => undefined}
          participants={localParticipant ? [localParticipant] : []}
          roomCode={channelId.replace(/^room-/, "")}
          roomId={channelId.replace(/^room-/, "")}
          timedOut
          {...lobbyConfig}
          portalStatus={status}
          actionError={actionError}
        />
      );
    }
    const canStart = canStartLobby({
      participantCount: connectedParticipants.length,
      agentReady: lobbyConfig.agentReady,
      isHost,
    });
    return (
      <LiveLobby
        transferHost={
          <LobbyHostTransfer
            roomCode={channelId.replace(/^room-/, "")}
            shouldTransfer={
              hasPresenceSnapshot && !currentHost && nextHost?.id === me?.id
            }
            onTransferred={() => setIsHost(true)}
          />
        }
        onLeave={onLeave}
        onStart={() => canStart && void submitAction("start_clue_phase")}
        participants={connectedParticipants}
        roomCode={channelId.replace(/^room-/, "")}
        roomId={channelId.replace(/^room-/, "")}
        portalStatus={status}
        {...lobbyConfig}
        isHost={isHost}
        actionError={actionError}
      />
    );
  }

  const participants = view.participants.map((participant) => ({
    ...participant,
    activity: "idle" as const,
    isYou: participant.id === me?.id,
  }));
  const stage = view.votingStage ?? "ai_detection";
  const submit = async (content: Record<string, unknown>) => {
    const action = typeof content.action === "string" ? content.action : "";
    await submitAction(action, content);
  };
  const submitClue = async () => {
    const text = draftClue.trim();
    if (!text || sentClue !== null) return;
    await submit(liveAction("submit_clue", { text }));
    setSentClue(text);
    setDraftClue("");
  };
  const submitVote = async () => {
    if (!selectedVote || sentVotes[stage]) return;
    await submit(liveAction("submit_vote", { stage, targetId: selectedVote }));
    setSentVotes((current) => ({ ...current, [stage]: true }));
    setSelectedVote(null);
  };

  return (
    <main className="round-shell">
      <header className="round-header">
        <button type="button" className="back-button" onClick={onLeave}>
          <ChevronLeft size={18} /> Salir de la sala
        </button>
        <div className="round-brand">
          impostoi <span>ROOM {channelId.replace(/^room-/, "")}</span>
        </div>
        <div className="connection-status">
          <i /> {status === "ready" ? "Portal conectado" : status}
        </div>
      </header>
      <div className="round-layout">
        <section className="round-main">
          <div className="round-heading">
            <div>
              <p className="eyebrow">Ronda {view.roundNumber} de 3</p>
              <h1>{phaseTitle(view.phase)}</h1>
            </div>
            <div className="round-timer">
              <Clock3 size={19} />{" "}
              {formatTimer(
                view.phaseDeadlineAt
                  ? Math.max(0, Math.ceil((view.phaseDeadlineAt - now) / 1000))
                  : 0,
              )}
            </div>
          </div>
          {view.phase === "lobby" ? (
            <LiveLobby
              onLeave={onLeave}
              onStart={() =>
                canStartLobby({
                  participantCount: participants.length,
                  agentReady: lobbyConfig.agentReady,
                  isHost,
                })
                  ? void submit(liveAction("start_clue_phase"))
                  : undefined
              }
              participants={participants}
              roomCode={channelId.replace(/^room-/, "")}
              roomId={channelId.replace(/^room-/, "")}
              portalStatus={status}
              capacity={lobbyConfig.capacity}
              agentReady={lobbyConfig.agentReady}
              isHost={isHost}
              actionError={actionError}
            />
          ) : null}
          {view.phase === "clue_phase" ? (
            <CluePhase
              clue={draftClue}
              clues={view.clues}
              submittedClue={sentClue}
              category={view.category}
              secretWord={view.secretWord}
              onChange={setDraftClue}
              onSubmit={() => void submitClue()}
              onContinue={() => void submit(liveAction("start_discussion"))}
            />
          ) : null}
          {view.phase === "discussion" ? (
            <Discussion
              value={draftDiscussion}
              onChange={setDraftDiscussion}
              onContinue={() =>
                void submit(
                  liveAction("start_voting", { discussion: draftDiscussion }),
                )
              }
            />
          ) : null}
          {view.phase === "voting" ? (
            <Voting
              stage={stage}
              participantList={participants}
              selected={selectedVote}
              submitted={Boolean(sentVotes[stage] || view.ownVotes[stage])}
              votes={{}}
              onSelect={setSelectedVote}
              onSubmit={() => void submitVote()}
              onContinue={() => undefined}
            />
          ) : null}
          {view.phase === "reveal" ? (
            <Reveal onResults={() => void submit(liveAction("show_results"))} />
          ) : null}
          {view.phase === "results" ? <Results /> : null}
        </section>
        <aside className="round-sidebar">
          <div className="sidebar-heading">
            <Users size={19} />
            <strong>Participantes</strong>
            <span>
              {participants.length}/{lobbyConfig.capacity}
            </span>
          </div>
          <div className="participant-list">
            {participants.map((participant) => (
              <div className="participant-card" key={participant.id}>
                <span
                  className="round-avatar"
                  style={{ backgroundColor: participant.avatar }}
                >
                  {participant.alias[0]}
                </span>
                <div>
                  <strong>
                    {participant.alias}
                    {participant.isYou ? " (tu)" : ""}
                  </strong>
                  <small>
                    <i className="activity-dot idle" /> Listo
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="privacy-note">
            <Shield size={17} />
            <span>Los roles y votos son privados hasta la revelacion.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

function _DemoRoundRoom({ onLeave }: { onLeave: () => void }) {
  const [phase, setPhase] = useState<MatchPhase>("lobby");
  const [votingStage, setVotingStage] = useState<VotingStage>("ai_detection");
  const [clue, setClue] = useState("");
  const [submittedClue, setSubmittedClue] = useState<string | null>(null);
  const [clues, setClues] = useState<Array<{ alias: string; text: string }>>(
    [],
  );
  const [discussion, setDiscussion] = useState("");
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [votes, setVotes] = useState<Partial<Record<VotingStage, string>>>({});

  const voteSubmitted = Boolean(votes[votingStage]);
  const submitClue = () => {
    if (!canSubmitClue(clue, submittedClue !== null)) return;
    setSubmittedClue(clue.trim());
    setClues((current) => [
      ...current,
      { alias: "Participante", text: clue.trim() },
    ]);
    setClue("");
  };
  const submitVote = () => {
    if (!selectedVote || voteSubmitted) return;
    setVotes((current) => ({ ...current, [votingStage]: selectedVote }));
    setSelectedVote(null);
  };

  return (
    <main className="round-shell">
      <header className="round-header">
        <button type="button" className="back-button" onClick={onLeave}>
          <ChevronLeft size={18} /> Salir de la sala
        </button>
        <div className="round-brand">
          impostoi <span>Partida local</span>
        </div>
        <div className="connection-status">
          <i /> Estado local no conectado
        </div>
      </header>

      <div className="round-layout">
        <section className="round-main">
          <div className="round-heading">
            <div>
              <p className="eyebrow">Ronda 1 de 3</p>
              <h1>{phaseTitle(phase)}</h1>
            </div>
            <div className="round-timer">
              <Clock3 size={19} />{" "}
              {formatTimer(phase === "discussion" ? 60 : 20)}
            </div>
          </div>

          {phase === "lobby" ? (
            <Lobby onStart={() => setPhase("clue_phase")} />
          ) : null}
          {phase === "clue_phase" ? (
            <CluePhase
              clue={clue}
              clues={clues}
              submittedClue={submittedClue}
              category=""
              onChange={setClue}
              onSubmit={submitClue}
              onContinue={() => setPhase("discussion")}
            />
          ) : null}
          {phase === "discussion" ? (
            <Discussion
              value={discussion}
              onChange={setDiscussion}
              onContinue={() => setPhase("voting")}
            />
          ) : null}
          {phase === "voting" ? (
            <Voting
              stage={votingStage}
              participantList={[]}
              selected={selectedVote}
              submitted={voteSubmitted}
              votes={votes}
              onSelect={setSelectedVote}
              onSubmit={submitVote}
              onContinue={() => {
                if (votingStage === "ai_detection") setVotingStage("impostor");
                else setPhase("reveal");
              }}
            />
          ) : null}
          {phase === "reveal" ? (
            <Reveal onResults={() => setPhase("results")} />
          ) : null}
          {phase === "results" ? <Results /> : null}
        </section>

        <aside className="round-sidebar">
          <div className="sidebar-heading">
            <Users size={19} />
            <strong>Participantes</strong>
            <span>0/0</span>
          </div>
          <div className="participant-list">
            <p>No hay una partida local.</p>
          </div>
          <div className="privacy-note">
            <Shield size={17} />
            <span>Los roles y votos son privados hasta la revelacion.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Lobby({ onStart }: { onStart: () => void }) {
  return (
    <div className="round-card lobby-card">
      <span className="big-round-icon">
        <Sparkles size={32} />
      </span>
      <p className="eyebrow">Sala lista</p>
      <h2>Todo el mundo esta dentro</h2>
      <p>Una IA esta jugando con vosotros. Nadie sabe quien es.</p>
      <button type="button" className="round-primary" onClick={onStart}>
        Comenzar ronda <Target size={19} />
      </button>
    </div>
  );
}

function CluePhase({
  clue,
  clues,
  submittedClue,
  category,
  secretWord,
  onChange,
  onSubmit,
  onContinue,
}: {
  clue: string;
  clues: readonly { alias: string; text: string }[];
  submittedClue: string | null;
  category?: string;
  secretWord?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="phase-stack">
      <div className="word-card">
        <span>Categoria</span>
        <strong>{category || "Categoria no disponible"}</strong>
        <div className="secret-word">
          <span>Palabra privada</span>
          <b>{secretWord ?? "Palabra privada protegida"}</b>
        </div>
      </div>
      <div className="round-card clue-card">
        <div className="card-title">
          <MessageCircle size={21} />
          <h2>Da una pista sin regalarla</h2>
        </div>
        <p>Tu pista queda fijada para siempre. Se breve, se astuto.</p>
        <textarea
          value={clue}
          disabled={submittedClue !== null}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escribe una palabra o frase corta..."
          maxLength={100}
        />
        <div className="card-actions">
          {submittedClue ? (
            <span className="submitted-label">
              <Check size={17} /> Pista enviada
            </span>
          ) : (
            <button
              type="button"
              className="round-primary"
              disabled={!canSubmitClue(clue, false)}
              onClick={onSubmit}
            >
              <Send size={17} /> Enviar pista
            </button>
          )}
          {clues.length >= 5 || submittedClue ? (
            <button type="button" className="text-button" onClick={onContinue}>
              Ir a la discusion <Target size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="clue-list">
        <h3>Pistas en la mesa</h3>
        {clues.map((item) => (
          <div className="clue-row" key={`${item.alias}-${item.text}`}>
            <strong>{item.alias}</strong>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Discussion({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="phase-stack">
      <div className="discussion-banner">
        <MessagesSquare size={31} />
        <div>
          <strong>{formatTimer(secondsLeft)} para discutir</strong>
          <span>
            {secondsLeft > 0
              ? "Comparad las pistas. La charla se cerrara al votar."
              : "La charla esta cerrada. Ya podeis votar."}
          </span>
        </div>
      </div>
      <div className="round-card discussion-card">
        <h2>Que te llama la atencion?</h2>
        <p>
          Este mensaje es una demostracion de la conversacion publica de la
          sala.
        </p>
        <textarea
          value={value}
          disabled={secondsLeft === 0}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escribe al grupo..."
          maxLength={280}
        />
        <button type="button" className="round-primary" onClick={onContinue}>
          {secondsLeft > 0
            ? "Avanzar en la demo y votar"
            : "Cerrar discusion y votar"}{" "}
          <Target size={18} />
        </button>
      </div>
    </div>
  );
}

function Voting({
  stage,
  participantList,
  selected,
  submitted,
  votes,
  onSelect,
  onSubmit,
  onContinue,
}: {
  stage: VotingStage;
  participantList: readonly RoundParticipant[];
  selected: string | null;
  submitted: boolean;
  votes: Partial<Record<VotingStage, string>>;
  onSelect: (id: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="phase-stack">
      <div className="vote-stepper">
        <span className="done">
          1 <small>IA</small>
        </span>
        <i />
        <span className={stage === "impostor" ? "active" : ""}>
          2 <small>Impostor</small>
        </span>
      </div>
      <div className="round-card vote-card">
        <p className="eyebrow">
          Votacion {stage === "ai_detection" ? "1 de 2" : "2 de 2"}
        </p>
        <h2>{votingTitle(stage)}</h2>
        <p>Tu voto es privado y no se puede cambiar.</p>
        <div className="vote-options">
          {participantList.map((participant) => (
            <button
              type="button"
              className={
                selected === participant.id || votes[stage] === participant.id
                  ? "vote-option selected"
                  : "vote-option"
              }
              disabled={submitted}
              onClick={() => onSelect(participant.id)}
              key={participant.id}
            >
              <span
                className="round-avatar"
                style={{ backgroundColor: participant.avatar }}
              >
                {participant.alias[0]}
              </span>
              <strong>{participant.alias}</strong>
              {votes[stage] === participant.id ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="round-primary"
          disabled={!selected || submitted}
          onClick={onSubmit}
        >
          {submitted ? "Voto enviado" : "Confirmar voto"}
        </button>
        {submitted ? (
          <button type="button" className="text-button" onClick={onContinue}>
            {stage === "ai_detection" ? "Siguiente votacion" : "Ver resultado"}{" "}
            <Target size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Reveal({ onResults }: { onResults: () => void }) {
  return (
    <div className="round-card reveal-card">
      <span className="big-round-icon pink-icon">
        <Target size={32} />
      </span>
      <p className="eyebrow">Votacion cerrada</p>
      <h2>Roles revelados</h2>
      <p>La sala ya puede mostrar el resultado de la ronda.</p>
      <div className="reveal-roles">
        <span>
          <b>IA</b>
          <small>Resultado privado</small>
        </span>
        <span>
          <b>IMPOSTOR</b>
          <small>Resultado privado</small>
        </span>
      </div>
      <button type="button" className="round-primary" onClick={onResults}>
        Ver resultados <Target size={19} />
      </button>
    </div>
  );
}

function Results() {
  return (
    <div className="round-card reveal-card">
      <span className="big-round-icon yellow-icon">
        <Check size={32} />
      </span>
      <p className="eyebrow">Ronda completada</p>
      <h2>Buen ojo, equipo</h2>
      <p>La siguiente ronda cambiara la palabra y los roles.</p>
      <div className="replay-summary">
        <strong>Replay pendiente</strong>
        <span>
          Esta vista reproducible no carga todavía el Replay persistido.
        </span>
      </div>
      <button type="button" className="round-primary" disabled>
        Replay no disponible en esta vista <Target size={19} />
      </button>
    </div>
  );
}
