import "server-only";

import { Portal } from "@portalsdk/core";

import { roomChannelId } from "@/lib/portal-room";
import { publicRuntimeConfig } from "@/lib/public-env";
import { readServerRuntimeConfig } from "@/lib/server-env-config";

export async function publishPrivateViews(
  roomCode: string,
  views: readonly { userId: string; content: unknown }[],
) {
  const config = readServerRuntimeConfig();
  const tokenResponse = await fetch(`${config.portalApiUrl}/v1/tokens`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.portalSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      userId: views[0]?.userId,
      channelId: roomChannelId(roomCode),
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("portal-token");
  const payload = (await tokenResponse.json()) as { token?: string };
  if (!payload.token) throw new Error("portal-token");

  const client = new Portal({
    apiKey: publicRuntimeConfig.portalKey,
    token: payload.token,
  });
  const channel = client.channel(roomChannelId(roomCode), { history: "none" });
  channel.acquire();
  try {
    await Promise.all(
      views.map(({ userId, content }) =>
        channel
          .send({
            to: userId,
            type: "match_state",
            content,
          })
          .catch((err) => {
            console.error(`Failed to publish private view to ${userId}:`, err);
          }),
      ),
    );
  } finally {
    channel.release();
  }
}
