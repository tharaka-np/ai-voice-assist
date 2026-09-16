import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `.tsx` too, so a component can be server-rendered and its markup asserted.
    // No jsdom: `renderToStaticMarkup` is enough to check what a given state emits.
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // Mirrors the `@/*` path alias from tsconfig.json.
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
});
