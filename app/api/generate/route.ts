import { NextResponse } from "next/server";

import { AuthError, requireOwner } from "@/lib/auth/require-owner";
import { getModel } from "@/lib/ai/model-router";
import { generateRequestSchema } from "@/features/generation/schema";
import { buildGenerationPrompt } from "@/features/generation/prompt";
import { streamGeneration } from "@/features/generation/synthesize";
import { searchKnowledgeItems } from "@/features/knowledge/queries";
import { getBrandVoiceById, getDefaultBrandVoice } from "@/features/brand-voice/queries";

// AGENTS.md Rule 2 normally reserves Route Handlers for webhooks/cron/pipeline-tick,
// not general API endpoints. This is a narrow, explicitly-flagged exception:
// @ai-sdk/react's useObject hook needs a fetch-consumable streaming Response, which a
// Server Action cannot produce. See docs/06-Implementation-Plan.md's "Phase 2.5" note.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  const parsed = generateRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { prompt, brandVoiceId } = parsed.data;

  const [knowledgeChunks, brandVoice] = await Promise.all([
    searchKnowledgeItems(prompt, 5),
    brandVoiceId ? getBrandVoiceById(brandVoiceId) : getDefaultBrandVoice(),
  ]);

  const { system, prompt: userPrompt } = buildGenerationPrompt({
    userPrompt: prompt,
    knowledgeChunks,
    brandVoice,
  });

  const result = streamGeneration({
    model: getModel("brand-voice-generation"),
    system,
    prompt: userPrompt,
  });

  return result.toTextStreamResponse();
}
