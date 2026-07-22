# Local Ollama Setup (Fedora Workstation)

Runbook for running generation against a local Ollama instance instead of Hugging Face
Inference. See `lib/ai/model-router.ts`'s `MODEL_PROVIDER=ollama` switch and
`docs/06-Implementation-Plan.md`'s "Phase 2 (continued) — Local Model Execution (Ollama
Fallback)" section for the code side of this.

**These commands are a manual, user-consented step** — they download several gigabytes of
model weights and start a local system service. Nothing here runs automatically as part of
building or testing this repo.

## 1. Install Ollama

The official install script is distribution-agnostic and works on Fedora Workstation:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

There is no first-party Fedora/COPR RPM package as of this writing — the install script above
is the supported path. (You may find community COPR packages; they aren't maintained by the
Ollama project, so prefer the official script.)

## 2. Fetch the model

```bash
ollama pull qwen2.5:7b-instruct-q4_K_M
```

`ollama pull` only fetches the weights and returns to the shell. `ollama run
qwen2.5:7b-instruct-q4_K_M` would additionally drop into an interactive chat REPL — unnecessary
for verification, since all that matters here is that the OpenAI-compatible HTTP endpoint
responds correctly. `run` is still useful afterward as an optional manual sanity check.

## 3. Verify the OpenAI-compatible endpoint

```bash
curl http://localhost:11434/v1/models
```

Confirms the server is up and the pulled model is listed under the shape an OpenAI-compatible
client expects.

```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:7b-instruct-q4_K_M",
    "messages": [{"role": "user", "content": "Reply with the single word: ok"}]
  }'
```

Confirms a real chat-completion round-trip against the exact endpoint shape
`@ai-sdk/openai-compatible` will call.

## 4. Enable it in the app

Only after both curl checks above succeed, set in your local `.env`:

```
MODEL_PROVIDER=ollama
```

`OLLAMA_BASE_URL` and `OLLAMA_MODEL` are optional — they default to
`http://localhost:11434/v1` and `qwen2.5:7b-instruct-q4_K_M` respectively, matching the model
pulled in step 2.
