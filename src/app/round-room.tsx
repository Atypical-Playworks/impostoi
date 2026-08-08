"use client";

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

import type { MatchPhase, VotingStage } from "@/lib/game-state";
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

export function RoundRoom({ onLeave }: { onLeave: () => void }) {
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
          <i /> Demo reproducible · Portal conectado
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
          <div className="snapshot-note">
            <Check size={17} />
            <span>Entrada tardia: snapshot actual recibido por Portal.</span>
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
  onChange,
  onSubmit,
  onContinue,
}: {
  clue: string;
  clues: { alias: string; text: string }[];
  submittedClue: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="phase-stack">
      <div className="word-card">
        <span>Categoria</span>
        <strong>Animales</strong>
        <div className="secret-word">
          <span>Palabra privada</span>
          <b>No disponible en la demo</b>
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
  selected,
  submitted,
  votes,
  onSelect,
  onSubmit,
  onContinue,
}: {
  stage: VotingStage;
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
          {participants.map((participant) => (
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
        <strong>Replay disponible</strong>
        <span>Claves publicas, tiempos, votos y resultado de esta ronda.</span>
      </div>
      <button type="button" className="round-primary">
        Ver Replay <Target size={19} />
      </button>
    </div>
  );
}
