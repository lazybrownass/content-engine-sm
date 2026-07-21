import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callHuggingFaceInference,
  HuggingFaceInferenceError,
} from "@/lib/ai/providers/huggingface";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

describe("callHuggingFaceInference", () => {
  const originalToken = process.env.HUGGINGFACE_API_TOKEN;

  beforeEach(() => {
    process.env.HUGGINGFACE_API_TOKEN = "test-token";
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.HUGGINGFACE_API_TOKEN = originalToken;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws without calling fetch when the token is unset", async () => {
    delete process.env.HUGGINGFACE_API_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callHuggingFaceInference({ model: "some/model", inputs: "hi" }),
    ).rejects.toThrow(HuggingFaceInferenceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the parsed response on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callHuggingFaceInference<{ ok: boolean }>({
      model: "some/model",
      inputs: "hi",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("rate limited", 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callHuggingFaceInference<{ ok: boolean }>({
      model: "some/model",
      inputs: "hi",
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx up to the max, then throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("server error", 503));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callHuggingFaceInference({ model: "some/model", inputs: "hi" });
    const assertion = expect(promise).rejects.toThrow(HuggingFaceInferenceError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("bad request", 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callHuggingFaceInference({ model: "some/model", inputs: "hi" }),
    ).rejects.toThrow(HuggingFaceInferenceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
