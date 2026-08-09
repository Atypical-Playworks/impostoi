export const ROOM_CODE_LENGTH = 6;
export const ROOM_CAPACITIES = [4, 5] as const;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const roomCodePattern = /^[A-HJKMNPQRSTUVWXYZ23456789]{6}$/;

export type RoomCapacity = (typeof ROOM_CAPACITIES)[number];
export type RoomLifecycleStatus = "lobby" | "started" | "expired" | "cancelled";

export type PublicRoom = {
  code: string;
  capacity: RoomCapacity;
  humanCount: number;
  status: RoomLifecycleStatus;
  agentReady: boolean;
};

export type RoomErrorCode =
  | "invalid-room"
  | "room-unavailable"
  | "room-full"
  | "room-started"
  | "room-expired"
  | "room-cancelled"
  | "alias-invalid"
  | "avatar-invalid"
  | "capacity-invalid"
  | "session-expired";

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateRoomCode(value: string): boolean {
  return roomCodePattern.test(normalizeRoomCode(value));
}

export function generateRoomCode(random = Math.random): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const characterIndex = Math.min(
      ROOM_CODE_ALPHABET.length - 1,
      Math.floor(random() * ROOM_CODE_ALPHABET.length),
    );
    code += ROOM_CODE_ALPHABET[characterIndex];
  }
  return code;
}

export function validateRoomCapacity(value: unknown): value is RoomCapacity {
  return value === 4 || value === 5;
}

export function validateAlias(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 24
  );
}

export function validateAvatar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 64
  );
}

export function roomErrorStatus(code: RoomErrorCode): number {
  return code === "session-expired"
    ? 401
    : code === "room-unavailable"
      ? 503
      : 400;
}

export function roomError(code: RoomErrorCode): { error: RoomErrorCode } {
  return { error: code };
}
