"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Crosshair,
  Drama,
  Globe2,
  LogIn,
  MessageCircle,
  MessagesSquare,
  Play,
  RefreshCw,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";

type AuthMode = "anonymous" | "authenticated";

const palette = ["#21D4D4", "#F43FA7", "#FFD43B", "#7C3AED", "#10B981"];

const steps: Array<{
  icon: LucideIcon;
  title: string;
  subtitle: string;
  color: string;
  shadow: string;
}> = [
  {
    icon: MessageCircle,
    title: "Pistas por turnos",
    subtitle: "20 segundos",
    color: "#F43FA7",
    shadow: "#9E1060",
  },
  {
    icon: MessagesSquare,
    title: "Discusion libre",
    subtitle: "60 segundos",
    color: "#7C3AED",
    shadow: "#4C1D95",
  },
  {
    icon: Crosshair,
    title: "Vota",
    subtitle: "IA e impostor",
    color: "#21D4D4",
    shadow: "#0D7B7B",
  },
  {
    icon: Drama,
    title: "Revelacion",
    subtitle: "Descubre la verdad",
    color: "#FFD43B",
    shadow: "#B89518",
  },
  {
    icon: Trophy,
    title: "3 rondas",
    subtitle: "Mejora tu deteccion",
    color: "#7C3AED",
    shadow: "#4C1D95",
  },
];

function Doodles() {
  return (
    <div className="doodles" aria-hidden="true">
      <span className="halftone halftone-top" />
      <span className="halftone halftone-bottom" />
      <span className="doodle doodle-ring doodle-one" />
      <span className="doodle doodle-zigzag doodle-two" />
      <span className="doodle doodle-wave doodle-three" />
      <span className="doodle doodle-cross doodle-four">+</span>
      <span className="doodle doodle-ring doodle-five" />
      <span className="doodle doodle-zigzag doodle-six" />
      <span className="doodle doodle-wave doodle-seven" />
      <span className="doodle doodle-diamond doodle-eight" />
      <span className="doodle doodle-cross doodle-nine">+</span>
      <span className="doodle doodle-ring doodle-ten" />
    </div>
  );
}

function Avatar({
  color,
  label = "?",
  className = "",
}: {
  color: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`avatar-dot ${className}`}
      style={{
        backgroundColor: color,
        color: color === "#FFD43B" ? "#21074D" : "white",
      }}
    >
      {label}
    </span>
  );
}

function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [created, setCreated] = useState(false);
  const [code] = useState("IMPOST");
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Modal
      onClose={onClose}
      title="Crear sala"
      icon={<Sparkles />}
      accent="#F43FA7"
    >
      {!created ? (
        <div className="modal-stack">
          <div className="room-code-box">
            <div>
              <span className="modal-label">Codigo de sala</span>
              <strong>{code}</strong>
            </div>
            <button type="button" className="small-button" onClick={copyCode}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <div className="modal-choice-row">
            <span className="modal-label">Jugadores humanos</span>
            <div className="choice-group">
              <button type="button" className="choice active">
                4
              </button>
              <button type="button" className="choice">
                5
              </button>
            </div>
          </div>
          <div className="modal-note">
            <Users size={18} color="var(--cyan)" />
            <span>Se uniran 4 o 5 jugadores y una IA oculta.</span>
          </div>
          <button
            type="button"
            className="modal-primary"
            onClick={() => setCreated(true)}
          >
            <Play size={20} fill="currentColor" />
            Crear sala ahora
          </button>
        </div>
      ) : (
        <div className="modal-success">
          <div className="success-avatar">
            <Avatar color="#21D4D4" label="?" />
          </div>
          <h3>Sala lista</h3>
          <p>Comparte el codigo para que tus amigos se unan.</p>
          <strong className="success-code">{code}</strong>
          <button type="button" className="modal-primary" onClick={onClose}>
            Ir a la sala de espera
          </button>
        </div>
      )}
    </Modal>
  );
}

function JoinRoomModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("IMPOST");
  const [joined, setJoined] = useState(false);
  const [avatar, setAvatar] = useState(palette[0]);
  const roomCodeId = useId();

  return (
    <Modal
      onClose={onClose}
      title="Unirse a una sala"
      icon={<Users />}
      accent="#21D4D4"
    >
      {!joined ? (
        <div className="modal-stack">
          <label className="modal-label" htmlFor={roomCodeId}>
            Codigo de sala
          </label>
          <input
            id={roomCodeId}
            className="room-input"
            value={code}
            maxLength={6}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <div className="alias-box">
            <div>
              <span className="modal-label">Tu alias para esta partida</span>
              <strong>Gato Ninja</strong>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Generar otro alias"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div>
            <span className="modal-label">Color de avatar</span>
            <div className="color-row">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-choice ${avatar === color ? "selected" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Elegir color ${color}`}
                  onClick={() => setAvatar(color)}
                >
                  {avatar === color ? <Check size={17} /> : null}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="modal-primary cyan"
            onClick={() => setJoined(true)}
          >
            <LogIn size={20} />
            Entrar a la sala
          </button>
        </div>
      ) : (
        <div className="modal-success">
          <div className="success-avatar">
            <Avatar color={avatar} label="?" className="success-avatar-dot" />
          </div>
          <h3>Te has unido</h3>
          <p>
            Estas dentro como <strong>Gato Ninja</strong>.
          </p>
          <button
            type="button"
            className="modal-primary cyan"
            onClick={onClose}
          >
            Ir a la sala de espera
          </button>
        </div>
      )}
    </Modal>
  );
}

function Modal({
  children,
  onClose,
  title,
  icon,
  accent,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="modal-heading">
          <span className="modal-icon" style={{ backgroundColor: accent }}>
            {icon}
          </span>
          <div>
            <h2>{title}</h2>
            <p>Una partida de pistas, mentiras y deduccion.</p>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function HomePage() {
  const [authMode, setAuthMode] = useState<AuthMode>("anonymous");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const howId = useId();

  return (
    <main className="game-shell">
      <Doodles />
      <div className="game-content">
        <header className="site-header">
          <div className="language-menu">
            <button
              type="button"
              className="language-button"
              onClick={() => setLanguageOpen((open) => !open)}
              aria-expanded={languageOpen}
            >
              <Globe2 size={18} /> ES{" "}
              <ChevronDown size={16} className={languageOpen ? "rotate" : ""} />
            </button>
            {languageOpen ? (
              <div className="language-dropdown">
                <button type="button" className="selected">
                  Espanol <Check size={15} />
                </button>
                <button type="button">English</button>
              </div>
            ) : null}
          </div>

          <div className="auth-area">
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Modo de acceso"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "anonymous"}
                className={authMode === "anonymous" ? "active anonymous" : ""}
                onClick={() => setAuthMode("anonymous")}
              >
                <span className="auth-avatar">
                  <Avatar color="#21D4D4" label="?" />
                </span>{" "}
                Anonimo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "authenticated"}
                className={
                  authMode === "authenticated" ? "active authenticated" : ""
                }
                onClick={() => setAuthMode("authenticated")}
              >
                <UserRound size={20} /> Autenticado
              </button>
            </div>
            <div className="online-pill">
              <span className="online-dot" />
              <strong>12</strong> jugando ahora
              <span className="mini-avatars">
                <Avatar color="#F43FA7" />
                <Avatar color="#FFD43B" />
              </span>
            </div>
          </div>

          <div className="brand-lockup">
            <div className="logo-frame">
              <Image
                src="/impostoi-logo.png"
                alt="impostoi"
                className="brand-logo"
                width={1536}
                height={1024}
                priority
              />
            </div>
            <p className="tagline-main">Hoy alguien finge ser humano.</p>
            <p className="tagline-secondary">
              Descubre a la <strong className="cyan-label">IA</strong>.
              Encuentra al <strong className="pink-label">impostoi</strong>.
            </p>
          </div>
        </header>

        <section className="hero-actions" aria-label="Acciones principales">
          <button
            type="button"
            className="hero-button pink"
            onClick={() => setModal("create")}
          >
            <span className="hero-icon yellow">
              <span className="smile-face">• •</span>
            </span>
            <span className="hero-copy">
              <strong>Crear sala</strong>
              <small>Se el anfitrion</small>
            </span>
            <span className="arrow-box">
              <ArrowRight size={28} />
            </span>
          </button>
          <button
            type="button"
            className="hero-button cyan"
            onClick={() => setModal("join")}
          >
            <span className="hero-icon cyan-icon">
              <Users size={34} />
            </span>
            <span className="hero-copy">
              <strong>Unirse a una sala</strong>
              <small>Con codigo de sala</small>
            </span>
            <span className="arrow-box">
              <ArrowRight size={28} />
            </span>
          </button>
        </section>

        <div className="info-bar">
          <span>
            <Users size={20} /> 4-5 jugadores + 1 IA oculta
          </span>
          <i />
          <span>
            <Clock3 size={20} /> Partidas de 3 rondas
          </span>
          <i />
          <span>
            <Zap size={20} /> Diversion asegurada
          </span>
        </div>

        <section className="how-section" aria-labelledby={howId}>
          <div className="section-title">
            <b /> <h2 id={howId}>Como se juega?</h2> <b />
          </div>
          <div className="steps-row">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div className="step-wrap" key={step.title}>
                  <div className="step-item">
                    <div
                      className="step-circle"
                      style={{
                        backgroundColor: step.color,
                        boxShadow: `0 5px 0 ${step.shadow}`,
                      }}
                    >
                      <span
                        className="step-number"
                        style={{ backgroundColor: step.color }}
                      >
                        {index + 1}
                      </span>
                      <Icon size={30} />
                    </div>
                    <strong>{step.title}</strong>
                    <small>{step.subtitle}</small>
                  </div>
                  {index < steps.length - 1 ? (
                    <ChevronRight className="step-arrow" size={23} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="footer-panel">
          <div className="footer-message">
            <span className="star-badge">
              <Star size={20} fill="currentColor" />
            </span>
            <p>
              Cada partida es unica.
              <br />
              <em>Cada mente es un misterio.</em>
            </p>
          </div>
          <div className="footer-avatars">
            <div>
              <strong>Avatares divertidos</strong>
              <small>Todos juegan con alias aleatorios.</small>
            </div>
            <div className="avatar-row">
              {palette.map((color) => (
                <Avatar key={color} color={color} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="footer-cta"
            onClick={() => setModal("create")}
          >
            <span>
              Listo para descubrir
              <br />
              <strong>al impostoi?</strong>
            </span>
            <ArrowUpRight size={23} color="var(--cyan)" />
          </button>
        </footer>
      </div>

      {modal === "create" ? (
        <CreateRoomModal onClose={() => setModal(null)} />
      ) : null}
      {modal === "join" ? (
        <JoinRoomModal onClose={() => setModal(null)} />
      ) : null}
    </main>
  );
}
