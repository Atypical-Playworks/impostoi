import "server-only";

import { roomChannelId } from "@/lib/portal-room";
import { readServerRuntimeConfig } from "@/lib/server-env-config";

export async function publishPrivateViews(
  roomCode: string,
  views: readonly { userId: string; content: unknown }[],
) {
  const config = readServerRuntimeConfig();
  const channelId = roomChannelId(roomCode);

  await Promise.all(
    views.map(async ({ userId, content }) => {
      try {
        const response = await fetch(
          `${config.portalApiUrl}/v1/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.portalSecret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              to: userId,
              type: "match_state",
              content,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(
            `Failed to publish private view to ${userId}: ${response.status} ${body}`,
          );
        }
      } catch (err) {
        console.error(`Failed to publish private view to ${userId}:`, err);
      }
    }),
  );
}
