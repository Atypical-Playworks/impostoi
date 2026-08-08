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
import { useEffect, useState } from "react";
import type {
  MatchPhase,
  PrivateGameView,
  VotingStage,
} from "@/lib/game-state";
import { liveAction, readLiveMatchView } from "@/lib/live-match";
import { publicRuntimeConfig } from "@/lib/public-env";
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
};

const participants: RoundParticipant[] = [
  {
    id: "p1",
    alias: "Gato Ninja",
    avatar: "#21D4D4",
    activity: "clue",
    isYou: true,
  },
  { id: "p2", alias: "Luna Pixel", avatar: "#F43FA7", activity: "clue" },
  { id: "p3", alias: "Sol Rebelde", avatar: "#FFD43B", activity: "idle" },
  { id: "p4", alias: "Rio Turbo", avatar: "#7C3AED", activity: "idle" },
  { id: "p5", alias: "Nube", avatar: "#10B981", activity: "clue" },
];

const starterClues = [
  { alias: "Luna Pixel", text: "Tiene una cola muy inquieta." },
  { alias: "Nube", text: "Le gusta explorar de noche." },
];

const activityLabels = {
  idle: "Listo",
  clue: "Escribiendo pista",
  discussion: "En la charla",
  voting: "Votando",
};

type LiveSetup =
  | { status: "loading" }
  | { status: "fallback" }
  | { status: "error" }
  | { status: "ready"; client: Portal; token: string };

export function RoundRoom({
  onLeave,
  roomId = "IMPOST",
}: {
  onLeave: () => void;
  roomId?: string;
}) {
  const [setup, setSetup] = useState<LiveSetup>({ status: "loading" });

  useEffect(() => {
    if (
      !publicRuntimeConfig.portalKey ||
      !publicRuntimeConfig.supabaseUrl ||
      !publicRuntimeConfig.supabasePublishableKey
    ) {
      setSetup({ status: "fallback" });
      return;
    }

    let active = true;
    async function connect() {
      try {
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
            client: new Portal({ apiKey: publicRuntimeConfig.portalKey }),
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
  }, [roomId]);

  if (setup.status === "fallback") {
    return (
      <RoundConnection
        onLeave={onLeave}
        label="Configura las variables publicas para conectar la sala"
      />
    );
  }
  if (setup.status === "loading") {
    return (
      <RoundConnection onLeave={onLeave} label="Conectando con la sala..." />
    );
  }
  if (setup.status === "error") {
    return (
      <RoundConnection
        onLeave={onLeave}
        label="No se pudo conectar con la sala"
      />
    );
  }
  return (
    <PortalProvider client={setup.client} token={setup.token}>
      <LiveRoundRoom channelId={`room-${roomId}`} onLeave={onLeave} />
    </PortalProvider>
  );
}

function RoundConnection({
  onLeave,
  label,
}: {
  onLeave: () => void;
  label: string;
}) {
  return (
    <main className="round-shell">
      <header className="round-header">
        <button type="button" className="back-button" onClick={onLeave}>
          <ChevronLeft size={18} /> Salir de la sala
        </button>
        <div className="round-brand">
          impostoi <span>ROOM IMPOST</span>
        </div>
        <div className="connection-status">
          <i /> {label}
        </div>
      </header>
    </main>
  );
}

type LiveMessage = {
  [key: string]: unknown;
};

function LiveRoundRoom({
  channelId,
  onLeave,
}: {
  channelId: string;
  onLeave: () => void;
}) {
  const [draftClue, setDraftClue] = useState("");
  const [draftDiscussion, setDraftDiscussion] = useState("");
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [sentClue, setSentClue] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sentVotes, setSentVotes] = useState<
    Partial<Record<VotingStage, boolean>>
  >({});
  const { messages, ext, me, send, setMetadata, status } =
    useChannel<LiveMessage>({
      channelId,
      metadata: { alias: "Gato Ninja", avatar: "#21D4D4", activity: "idle" },
    });

  let view: PrivateGameView | null = readLiveMatchView(ext?.match);
  for (const message of messages) {
    const next = readLiveMatchView(message.content);
    if (next) view = next;
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (me)
      setMetadata({
        alias: "Gato Ninja",
        avatar: "#21D4D4",
        activity:
          view?.phase === "clue_phase"
            ? "clue"
            : view?.phase === "discussion"
              ? "discussion"
              : view?.phase === "voting"
                ? "voting"
                : "idle",
      });
  }, [me, setMetadata, view?.phase]);

  if (!view) {
    return (
      <RoundConnection
        onLeave={onLeave}
        label={
          status === "blocked"
            ? "Sala no disponible"
            : "Esperando el estado de la partida..."
        }
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
    await send({ content, type: "match_action" });
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
          impostoi <span>ROOM IMPOST</span>
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
            <Lobby
              onStart={() => void submit(liveAction("start_clue_phase"))}
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
            <span>{participants.length}/6</span>
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
  const [clues, setClues] = useState(starterClues);
  const [discussion, setDiscussion] = useState("");
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [votes, setVotes] = useState<Partial<Record<VotingStage, string>>>({});

  const voteSubmitted = Boolean(votes[votingStage]);
  const submitClue = () => {
    if (!canSubmitClue(clue, submittedClue !== null)) return;
    setSubmittedClue(clue.trim());
    setClues((current) => [
      ...current,
      { alias: "Gato Ninja", text: clue.trim() },
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
          impostoi <span>ROOM IMPOST</span>
        </div>
        <div className="connection-status">
          <i /> Demo reproducible · Estado local
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
            <span>{participants.length}/6</span>
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
                    <i className={`activity-dot ${participant.activity}`} />{" "}
                    {activityLabels[participant.activity]}
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
  category = "Animales",
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
        <strong>{category}</strong>
        <div className="secret-word">
          <span>Palabra privada</span>
          <b>{secretWord ?? "No disponible en la demo"}</b>
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
  participantList = participants,
  selected,
  submitted,
  votes,
  onSelect,
  onSubmit,
  onContinue,
}: {
  stage: VotingStage;
  participantList?: readonly RoundParticipant[];
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
