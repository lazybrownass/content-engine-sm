// In-memory fixed-window rate limiter for the webhook/cron Route Handlers. Per-instance
// only — not shared across serverless replicas — which is an accepted tradeoff for this
// single-owner, low-traffic app rather than adding a distributed store (Upstash/Redis) as
// a new piece of infrastructure. Revisit if the traffic profile changes.

const buckets = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
