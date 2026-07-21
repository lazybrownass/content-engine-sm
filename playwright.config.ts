import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Must match GoTrue's SITE_URL (docker/.env: http://localhost:3000), not 127.0.0.1 — the
    // PKCE code_verifier cookie set during signInWithOtp() is scoped to whatever host the page
    // was on, and a 127.0.0.1/localhost mismatch across the auth redirect chain silently breaks
    // exchangeCodeForSession() (cookie never sent), bouncing back to /login with no error shown.
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
