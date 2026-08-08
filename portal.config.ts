import { defineConfig } from "@portalsdk/config";

export default defineConfig({
  channels: {
    "room-*": {
      mode: "standard",
      anonymous: false,
    },
  },
});
