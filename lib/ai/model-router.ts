import { createHuggingFace } from "@ai-sdk/huggingface";
import type { LanguageModel } from "ai";

// AGENTS.md Rule 4: the single AI model-SDK boundary. Feature code never
// imports a provider SDK directly — it calls getModel(purpose) instead.
// Minimal today (one purpose key); Phase 2's per-stage/prompt_templates
// routing extends this rather than replacing it.

const huggingface = createHuggingFace({ apiKey: process.env.HUGGINGFACE_API_TOKEN });

type ModelPurpose = "brand-voice-generation";

const MODEL_IDS: Record<ModelPurpose, string> = {
  "brand-voice-generation": process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
};

export function getModel(purpose: ModelPurpose): LanguageModel {
  return huggingface(MODEL_IDS[purpose]);
}
