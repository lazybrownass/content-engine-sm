import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getModel } from "@/lib/ai/model-router";

// getModel() returns the ai package's LanguageModel type (LanguageModelV2 | string), but
// in practice it always constructs a real LanguageModelV2 object (never a bare model-id
// string) — narrow here so tests can introspect .modelId/.provider/.config directly.
function asLanguageModelV2(model: ReturnType<typeof getModel>) {
  if (typeof model === "string") {
    throw new Error("Expected a LanguageModelV2 object, got a bare string");
  }
  return model;
}

describe("getModel", () => {
  const originalEnv = {
    E2E_MOCK_LLM: process.env.E2E_MOCK_LLM,
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  };

  beforeEach(() => {
    delete process.env.E2E_MOCK_LLM;
    delete process.env.MODEL_PROVIDER;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("defaults to the Hugging Face-backed model for all purposes when no new env vars are set", () => {
    for (const purpose of ["brand-voice-generation", "outline", "draft", "grill_review"] as const) {
      const model = asLanguageModelV2(getModel(purpose));
      expect(model.provider).not.toBe("ollama.chat");
    }
  });

  it("E2E_MOCK_LLM takes precedence over MODEL_PROVIDER=ollama when both are set", () => {
    process.env.E2E_MOCK_LLM = "1";
    process.env.MODEL_PROVIDER = "ollama";

    const model = asLanguageModelV2(getModel("draft"));

    expect(model.modelId).toBe("mock-generation-model");
  });

  it("MODEL_PROVIDER=ollama with no OLLAMA_BASE_URL/OLLAMA_MODEL set uses the documented defaults", () => {
    process.env.MODEL_PROVIDER = "ollama";

    const model = asLanguageModelV2(getModel("draft"));

    expect(model.provider).toBe("ollama.chat");
    expect(model.modelId).toBe("qwen2.5:7b-instruct-q4_K_M");

    const config = (model as unknown as { config: { url: (o: { modelId: string; path: string }) => string } })
      .config;
    const url = config.url({ modelId: model.modelId, path: "/chat/completions" });
    expect(url.startsWith("http://localhost:11434/v1")).toBe(true);
  });

  it("respects custom OLLAMA_BASE_URL and OLLAMA_MODEL when set", () => {
    process.env.MODEL_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://localhost:9999/v1";
    process.env.OLLAMA_MODEL = "custom-model:latest";

    const model = asLanguageModelV2(getModel("outline"));

    expect(model.modelId).toBe("custom-model:latest");

    const config = (model as unknown as { config: { url: (o: { modelId: string; path: string }) => string } })
      .config;
    const url = config.url({ modelId: model.modelId, path: "/chat/completions" });
    expect(url.startsWith("http://localhost:9999/v1")).toBe(true);
  });
});
