import { createHuggingFace } from "@ai-sdk/huggingface";
import type { LanguageModel } from "ai";

import { createMockGenerationModel } from "./mock-generation-model";

// AGENTS.md Rule 4: the single AI model-SDK boundary. Feature code never
// imports a provider SDK directly — it calls getModel(purpose) instead.
// Phase 2's per-stage/prompt_templates routing will extend this map further
// rather than replacing it; today every purpose still resolves to the same
// GENERATION_MODEL env var.

const huggingface = createHuggingFace({ apiKey: process.env.HUGGINGFACE_API_TOKEN });

export type ModelPurpose = "brand-voice-generation" | "outline" | "draft" | "grill_review";

const MODEL_IDS: Record<ModelPurpose, string> = {
  "brand-voice-generation": process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  outline: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  draft: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  grill_review: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
};

export function getModel(purpose: ModelPurpose): LanguageModel {
  // E2E_MOCK_LLM keeps Playwright's production-build run hermetic and fast — a real
  // HF call would be slow/flaky/costly, and ai/AGENTS.md 9.3 forbids asserting on real
  // model output in CI anyway.
  if (process.env.E2E_MOCK_LLM) {
    return createMockGenerationModel();
  }
  return huggingface(MODEL_IDS[purpose]);
}
