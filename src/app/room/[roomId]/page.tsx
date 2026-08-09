"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { RoundRoom } from "@/app/round-room";

type PublicRoom = {
  code: string;
  capacity: 3 | 4 | 5;
  humanCount: number;
  confirmedCount: number;
  pendingCount: number;
  participants: {
    id: string;
    alias: string;
    avatar: string;
    status: "pending" | "confirmed";
    isHost: boolean;
  }[];
  status: "lobby" | "started" | "expired" | "cancelled";
  agentReady: boolean;
  isHost: boolean;
};
type JoinProfile = { alias: string; avatar: string };
const avatarOptions = ["#21D4D4", "#F43FA7", "#FFD43B", "#7C3AED", "#10B981"];

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function readStoredProfile(): JoinProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(
      sessionStorage.getItem("impostoi_join_profile") ?? "null",
    ) as Partial<JoinProfile> | null;
    return stored?.alias && stored.avatar
      ? { alias: stored.alias, avatar: stored.avatar }
      : null;
  } catch {
    return null;
  }
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId?.toUpperCase() ?? "";
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [profile, setProfile] = useState<JoinProfile | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliasId = useId();

  useEffect(() => {
    setProfile(readStoredProfile());
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let active = true;
    setError(null);
    void fetch(`/api/rooms/${roomId}`)
      .then(async (response) => {
        const payload = (await response.json()) as
          | PublicRoom
          | { error?: string };
        if (!response.ok || !("code" in payload)) throw new Error("room");
        if (active) {
          setRoom(payload);
          if (payload.isHost) setConfirmed(true);
          setError(null);
        }
      })
      .catch(() => active && setError("Esta sala no esta disponible."));
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!confirmed || room?.status !== "lobby") return;
    let active = true;
    const refresh = () => {
      void fetch(`/api/rooms/${roomId}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const next = (await response.json()) as PublicRoom;
          if (active) setRoom(next);
        })
        .catch(() => undefined);
    };
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [confirmed, room?.status, roomId]);

  if (error)
    return (
      <main className="round-shell">
        <p role="alert">{error}</p>
      </main>
    );
  if (!confirmed) {
    async function confirmJoin() {
      setJoining(true);
      try {
        const selectedProfile = profile;
        if (!selectedProfile) throw new Error("profile-required");
        const guest = await fetchWithTimeout("/api/auth/guest", {
          method: "POST",
        });
        const response =
          guest.ok && room?.status === "lobby"
            ? await fetchWithTimeout(`/api/rooms/${roomId}/join`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(selectedProfile),
              })
            : null;
        if (!guest.ok || (room?.status === "lobby" && !response?.ok)) {
          throw new Error("join");
        }
        setConfirmed(true);
      } catch {
        setJoining(false);
        setError(
          "La conexion tardo demasiado. Revisa tu red y vuelve a intentar.",
        );
      }
    }

    return (
      <main className="round-shell">
        <section className="round-card lobby-card">
          <p className="eyebrow">Confirmar entrada</p>
          <h1 aria-busy={!room}>
            {room ? (
              room.code
            ) : (
              <span className="skeleton-line room-code-heading-skeleton" />
            )}
          </h1>
          <p>
            {room ? (
              `${room.humanCount}/${room.capacity} jugadores · ${room.agentReady ? "IA lista" : "IA no disponible"}`
            ) : (
              <span className="skeleton-line room-meta-skeleton" />
            )}
          </p>
          <label className="modal-label" htmlFor={aliasId}>
            Tu alias para esta partida
          </label>
          <input
            id={aliasId}
            className="room-input"
            value={profile?.alias ?? ""}
            maxLength={24}
            onChange={(event) => {
              const next = {
                alias: event.target.value,
                avatar: profile?.avatar ?? avatarOptions[0],
              };
              setProfile(next);
              sessionStorage.setItem(
                "impostoi_join_profile",
                JSON.stringify(next),
              );
            }}
            placeholder="Escribe tu alias"
          />
          <div>
            <span className="modal-label">Color de avatar</span>
            <div className="color-row">
              {avatarOptions.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  className={`color-choice ${profile?.avatar === avatar ? "selected" : ""}`}
                  style={{ backgroundColor: avatar }}
                  aria-label={`Elegir color ${avatar}`}
                  onClick={() => {
                    const next = {
                      alias: profile?.alias ?? "",
                      avatar,
                    };
                    setProfile(next);
                    sessionStorage.setItem(
                      "impostoi_join_profile",
                      JSON.stringify(next),
                    );
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="round-primary"
            disabled={
              !room ||
              !profile?.alias.trim() ||
              (room.status !== "lobby" && room.status !== "started") ||
              (room.status === "lobby" && room.humanCount >= room.capacity) ||
              joining
            }
            onClick={() => void confirmJoin()}
          >
            {joining ? "Entrando..." : "Confirmar alias y entrar"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <RoundRoom
      roomId={roomId}
      lobbyConfig={{
        capacity: room?.capacity ?? 4,
        agentReady: room?.agentReady ?? false,
        isHost: room?.isHost ?? false,
        confirmedCount: room?.confirmedCount ?? 0,
        pendingCount: room?.pendingCount ?? 0,
        pendingParticipants:
          room?.participants
            .filter((participant) => participant.status === "pending")
            .map((participant) => ({
              id: participant.id,
              alias: participant.alias,
              avatar: participant.avatar,
              isHost: participant.isHost,
            })) ?? [],
        serverParticipants:
          room?.participants.map((participant) => ({
            id: participant.id,
            alias: participant.alias,
            avatar: participant.avatar,
            status: participant.status,
            isHost: participant.isHost,
          })) ?? [],
      }}
      onLeave={() => router.push("/")}
    />
  );
}
