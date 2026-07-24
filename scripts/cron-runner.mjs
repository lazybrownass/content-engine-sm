// Self-hosted equivalent of vercel.json's Cron schedules — Vercel Cron has no
// Docker-native counterpart, so this replaces it for the docker-compose `cron`
// service. Plain Node (fetch + setInterval), no new dependency: this is a
// background sidecar, not app logic, so it doesn't need Next.js or the
// TypeScript build. Intervals below match vercel.json exactly.

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://app:3000";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("[cron-runner] CRON_SECRET is not set — refusing to start.");
  process.exit(1);
}

const JOBS = [
  { path: "/api/cron/process-embeddings", intervalMs: 60_000 },
  { path: "/api/cron/dispatch-publishing", intervalMs: 300_000 },
];

async function runJob(path) {
  const url = `${APP_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    if (!response.ok) {
      console.error(`[cron-runner] ${path} responded ${response.status}`);
      return;
    }
    console.log(`[cron-runner] ${path} ok`);
  } catch (error) {
    // Never let one failed tick crash the loop — the next interval retries.
    console.error(`[cron-runner] ${path} failed:`, error instanceof Error ? error.message : error);
  }
}

for (const job of JOBS) {
  runJob(job.path);
  setInterval(() => runJob(job.path), job.intervalMs);
}

console.log(`[cron-runner] started, targeting ${APP_BASE_URL}`);
