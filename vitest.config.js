// vitest.config.js
//   Unit suite uses jsdom so DOMParser / window globals work natively
//   (sanitize.js needs them). Rules suite explicitly switches to "node"
//   per-file because @firebase/rules-unit-testing wants the Node env.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/unit/**/*.test.js", "tests/rules/**/*.test.js"],
  },
});
