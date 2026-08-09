"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RoundRoom } from "@/app/round-room";

type PublicRoom = {
  code: string;
  capacity: 4 | 5;
  humanCount: number;
  status: "lobby" | "started" | "expired" | "cancelled";
  agentReady: boolean;
};

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId?.toUpperCase() ?? "";
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/rooms/${roomId}`)
      .then(async (response) => {
        const payload = (await response.json()) as
          | PublicRoom
          | { error?: string };
        if (!response.ok || !("code" in payload)) throw new Error("room");
        if (active) setRoom(payload);
      })
      .catch(() => active && setError("Esta sala no esta disponible."));
    return () => {
      active = false;
    };
  }, [roomId]);

  if (error)
    return (
      <main className="round-shell">
        <p role="alert">{error}</p>
      </main>
    );
  if (!confirmed) {
    async function confirmJoin() {
      setJoining(true);
      let profile = { alias: "Gato Ninja", avatar: "#21D4D4" };
      try {
        const stored = JSON.parse(
          sessionStorage.getItem("impostoi_join_profile") ?? "null",
        ) as Partial<typeof profile> | null;
        if (stored?.alias && stored.avatar) profile = stored as typeof profile;
      } catch {
        // The server validates the fallback profile and the submitted values.
      }
      try {
        const guest = await fetch("/api/auth/guest", { method: "POST" });
        const response =
          guest.ok && room?.status === "lobby"
            ? await fetch(`/api/rooms/${roomId}/join`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(profile),
              })
            : null;
        if (!guest.ok || (room?.status === "lobby" && !response?.ok)) {
          throw new Error("join");
        }
        setConfirmed(true);
      } catch {
        setJoining(false);
        setError("No se pudo entrar en la sala.");
      }
    }

    return (
      <main className="round-shell">
        <section className="round-card lobby-card">
          <p className="eyebrow">Confirmar entrada</p>
          <h1>{room?.code ?? roomId}</h1>
          <p>
            {room
              ? `${room.humanCount}/${room.capacity} jugadores · ${room.agentReady ? "IA lista" : "IA no disponible"}`
              : "Consultando la sala..."}
          </p>
          <button
            type="button"
            className="round-primary"
            disabled={
              !room ||
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

  return <RoundRoom roomId={roomId} onLeave={() => router.push("/")} />;
}
