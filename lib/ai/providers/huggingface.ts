const HF_ROUTER_BASE_URL = "https://router.huggingface.co/hf-inference/models";

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const DEFAULT_TIMEOUT_MS = 15_000;

export class HuggingFaceInferenceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HuggingFaceInferenceError";
    this.status = status;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callHuggingFaceInference<TResponse>(params: {
  model: string;
  inputs: unknown;
  parameters?: Record<string, unknown>;
  // Some tasks (e.g. feature-extraction) require an explicit pipeline path after the model id;
  // others (e.g. text-classification-style pair scoring) are called directly on the model id.
  path?: string;
  timeoutMs?: number;
}): Promise<TResponse> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new HuggingFaceInferenceError("HUGGINGFACE_API_TOKEN is not set");
  }

  const url = `${HF_ROUTER_BASE_URL}/${params.model}${params.path ? `/${params.path}` : ""}`;
  const body = JSON.stringify({
    inputs: params.inputs,
    ...(params.parameters && { parameters: params.parameters }),
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as TResponse;
      }

      const responseText = await response.text();
      const error = new HuggingFaceInferenceError(
        `HuggingFace inference request failed for model "${params.model}": ${response.status} ${responseText}`,
        response.status,
      );

      if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (error instanceof HuggingFaceInferenceError) throw error;
      if (attempt === MAX_RETRIES) {
        throw new HuggingFaceInferenceError(
          `HuggingFace inference request failed for model "${params.model}"`,
          undefined,
          { cause: error },
        );
      }
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 100);
  }

  // Unreachable in practice (every branch above returns or throws by the final attempt),
  // kept only to satisfy the compiler's control-flow analysis.
  throw lastError instanceof Error
    ? lastError
    : new HuggingFaceInferenceError(`HuggingFace inference request failed for model "${params.model}"`);
}
