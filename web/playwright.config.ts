import { defineConfig, devices } from "@playwright/test";

// The binary boots fast; tests run sequentially against a single instance so
// fixtures can share state when convenient. Each spec resets via the API.
const PORT = Number(process.env.VM_E2E_PORT || 8190);
const DATA_DIR = process.env.VM_E2E_DATA_DIR || `${process.cwd()}/../.e2e-data`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The Go binary serves the embedded SPA + every /api/* endpoint. Tests run
    // against the production embed, not the Vite dev server, so we exercise
    // the binary the user actually ships.
    command: `bash -c 'rm -rf "${DATA_DIR}" && mkdir -p "${DATA_DIR}" && ../dist/volunteers --data-dir="${DATA_DIR}" --port=${PORT} --open=false --tile-base-url="http://127.0.0.1:${PORT}/_no_tiles_"'`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    timeout: 20_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
