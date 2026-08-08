export const RECONNECT_WINDOW_MS = 30_000;

export type RoomStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "degraded"
  | "degraded-http"
  | "blocked";

export type PresenceMetadata = {
  alias: string;
  avatar: string;
  activity?: "idle" | "clue" | "discussion" | "voting";
};

export type RoomSnapshot = {
  roomId: string;
  channelId: string;
  status: RoomStatus;
  phase: string;
  participants: Array<PresenceMetadata & { id: string }>;
  receivedAt: number;
};

export type RoomErrorState =
  | "room-unavailable"
  | "session-expired"
  | "room-full"
  | "access-denied"
  | "connection-lost";

const roomIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;

export function validateRoomId(roomId: string): boolean {
  return roomIdPattern.test(roomId);
}

export function roomChannelId(roomId: string): string {
  if (!validateRoomId(roomId)) throw new Error("Invalid room id");
  return `room-${roomId}`;
}

export function safePresence(
  id: string,
  metadata: Partial<PresenceMetadata>,
): PresenceMetadata & { id: string } {
  const activity =
    metadata.activity === "idle" ||
    metadata.activity === "clue" ||
    metadata.activity === "discussion" ||
    metadata.activity === "voting"
      ? metadata.activity
      : undefined;

  return {
    id,
    alias:
      typeof metadata.alias === "string"
        ? metadata.alias.slice(0, 24) || "Jugador"
        : "Jugador",
    avatar:
      typeof metadata.avatar === "string"
        ? metadata.avatar.slice(0, 64) || "default"
        : "default",
    ...(activity ? { activity } : {}),
  };
}

export function canReconnect(
  disconnectedAt: number,
  now = Date.now(),
): boolean {
  return now >= disconnectedAt && now - disconnectedAt <= RECONNECT_WINDOW_MS;
}

export function createRoomSnapshot(input: RoomSnapshot): RoomSnapshot {
  if (
    !input.channelId.startsWith("room-") ||
    input.roomId !== input.channelId.slice("room-".length)
  ) {
    throw new Error("Room snapshot channel mismatch");
  }

  return {
    ...input,
    participants: input.participants.map((participant) =>
      safePresence(participant.id, participant),
    ),
  };
}

export function joinRoom(
  snapshot: RoomSnapshot,
  participant: { id: string } & Partial<PresenceMetadata>,
): RoomSnapshot {
  const normalizedSnapshot = createRoomSnapshot(snapshot);
  const normalizedParticipant = safePresence(participant.id, participant);

  return {
    ...normalizedSnapshot,
    participants: [
      ...normalizedSnapshot.participants.filter(
        ({ id }) => id !== normalizedParticipant.id,
      ),
      normalizedParticipant,
    ],
  };
}

export function leaveRoom(
  snapshot: RoomSnapshot,
  participantId: string,
): RoomSnapshot {
  const normalizedSnapshot = createRoomSnapshot(snapshot);

  return {
    ...normalizedSnapshot,
    participants: normalizedSnapshot.participants.filter(
      ({ id }) => id !== participantId,
    ),
  };
}

export function reconnectRoom(
  snapshot: RoomSnapshot,
  participant: { id: string } & Partial<PresenceMetadata>,
  disconnectedAt: number,
  now = Date.now(),
): RoomSnapshot | null {
  return canReconnect(disconnectedAt, now)
    ? joinRoom(snapshot, participant)
    : null;
}

export function mapPortalError(code: string): RoomErrorState {
  switch (code) {
    case "token_expired":
    case "invalid_token":
      return "session-expired";
    case "channel_at_capacity":
      return "room-full";
    case "not_member":
    case "anonymous_not_allowed":
    case "blocked":
      return "access-denied";
    case "degraded":
    case "network":
      return "connection-lost";
    default:
      return "room-unavailable";
  }
}
