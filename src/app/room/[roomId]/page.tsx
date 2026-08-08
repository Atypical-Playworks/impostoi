"use client";

import { useParams, useRouter } from "next/navigation";

import { RoundRoom } from "@/app/round-room";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId?.toUpperCase() ?? "";

  return <RoundRoom roomId={roomId} onLeave={() => router.push("/")} />;
}
