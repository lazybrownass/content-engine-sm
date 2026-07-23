import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { verifySignature } from "@/lib/publishing/signing";
import { getClientIp, isRateLimited } from "@/lib/security/rate-limit";

const callbackPayloadSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["success", "failure"]),
  linkedinUrl: z.string().url().optional(),
  errorMessage: z.string().optional(),
});

const TERMINAL_JOB_STATUSES = new Set(["PUBLISHED", "FAILED", "CANCELLED"]);

export async function handlePublishingCallback(
  request: NextRequest,
  providerType: "N8N" | "MAKE",
): Promise<NextResponse> {
  if (isRateLimited(`webhook:${getClientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Read raw bytes, not .json() — the signature is computed over the exact request body.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-signature");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = callbackPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const job = await prisma.publishingJob.findFirst({
    where: { id: parsed.data.jobId, automationProvider: { type: providerType } },
    include: { automationProvider: true, schedule: true },
  });
  // Generic 401 for both "job not found" and "bad signature" — never distinguish, never touch the row.
  if (!job) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = job.automationProvider.signingSecretRef
    ? process.env[job.automationProvider.signingSecretRef]
    : undefined;
  if (!secret || !verifySignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    return NextResponse.json({ ok: true }); // idempotent no-op, already terminal
  }

  if (parsed.data.status === "success") {
    await prisma.publishingJob.update({
      where: { id: job.id },
      data: { status: "PUBLISHED", confirmedAt: new Date(), linkedinUrl: parsed.data.linkedinUrl ?? null },
    });
    await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "PUBLISHED" } });
  } else {
    await prisma.publishingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: parsed.data.errorMessage ?? "Publish failed" },
    });
    await prisma.post.update({ where: { id: job.schedule.postId }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ ok: true });
}
