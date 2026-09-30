/**
 * Shared chat client for the AI routes.
 *
 * Both routes talk to the same OpenAI-compatible provider, so provider
 * resolution, the model chain and the request shape live here instead of being
 * copied into each route: the copies drifted, and a drifted copy is how both
 * routes ended up asking a thinking model for a 350-token answer.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiProvider = {
  apiKey: string;
  baseURL: string;
  models: string[];
  /**
   * Gemini thinking models spend the token ceiling on hidden reasoning before
   * they write a single visible word, so a small ceiling returns a sentence cut
   * off mid-word. Where this is set, the answer is requested with thinking
   * switched off; if the model does not know the switch it is asked again with
   * thinking allowed and a ceiling big enough to cover the reasoning.
   */
  controlsThinking: boolean;
};

export type ChatRequest = {
  messages: ChatMessage[];
  temperature: number;
  /** Ceiling for the visible answer, not counting hidden reasoning. */
  maxAnswerTokens: number;
  /** Ask for a strict JSON object instead of prose. */
  json?: boolean;
};

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
/** Small, fast models that accept the thinking switch, so the fallback answers
 * like the primary instead of failing on the request shape. */
const DEFAULT_GEMINI_FALLBACK_MODELS = "gemini-3.1-flash-lite,gemini-3.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const REQUEST_TIMEOUT_MS = 20_000;
/** Budget for the whole chain, so a slow provider cannot hold a route open. */
const CHAIN_DEADLINE_MS = 40_000;
/** Room for the reasoning a thinking model does on top of the answer. */
const THINKING_ANSWER_FACTOR = 4;
const THINKING_ANSWER_FLOOR = 1_000;

function modelList(value: string | undefined, fallback: string): string[] {
  const models = (value ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  return models.length > 0 ? models : fallback.split(",");
}

export function resolveAiProvider(): AiProvider {
  if (process.env.GEMINI_API_KEY) {
    return {
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      models: [process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL],
      controlsThinking: true,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://api.openai.com/v1",
      models: modelList(process.env.OPENAI_MODEL, DEFAULT_OPENAI_MODEL),
      controlsThinking: false,
    };
  }
  throw new Error("AI key is not configured");
}

/** Models are tried in order, so the configured primary leads the chain. */
function modelChain(provider: AiProvider): string[] {
  const fallbacks = provider.controlsThinking
    ? modelList(process.env.GEMINI_FALLBACK_MODELS, DEFAULT_GEMINI_FALLBACK_MODELS)
    : [];
  return [...new Set([...provider.models, ...fallbacks])].filter((model) => model.length > 0);
}

function requestBody(provider: AiProvider, request: ChatRequest, model: string, thinkingOff: boolean) {
  const body: Record<string, unknown> = {
    model,
    temperature: request.temperature,
    messages: request.messages,
  };
  if (request.json) body.response_format = { type: "json_object" };
  if (!provider.controlsThinking) {
    body.max_tokens = request.maxAnswerTokens;
    return body;
  }
  if (thinkingOff) {
    body.reasoning_effort = "none";
    body.max_tokens = request.maxAnswerTokens;
    return body;
  }
  body.max_completion_tokens = request.maxAnswerTokens * THINKING_ANSWER_FACTOR + THINKING_ANSWER_FLOOR;
  return body;
}

type Completion = { content: string; truncated: boolean };

function readCompletion(payload: unknown): Completion {
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) {
    throw new Error("Invalid AI response");
  }
  const choice: unknown = payload.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice)) throw new Error("Invalid AI response");
  const message: unknown = choice.message;
  if (!message || typeof message !== "object" || !("content" in message) || typeof message.content !== "string") {
    throw new Error("Invalid AI response");
  }
  const content = message.content.trim();
  if (!content) throw new Error("Empty AI answer");
  const finishReason = "finish_reason" in choice ? choice.finish_reason : undefined;
  return { content, truncated: finishReason === "length" };
}

async function post(
  provider: AiProvider,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ status: number; payload: Completion | null; detail: string }> {
  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    return { status: response.status, payload: null, detail: (await response.text()).slice(0, 300) };
  }
  return { status: response.status, payload: readCompletion(await response.json()), detail: "" };
}

/**
 * Returns the assistant text for `request`, or throws with the last failure.
 *
 * Walks the model chain and, inside each model, first the cheapest request
 * shape (thinking off) and then the plain one. A refused request shape, an
 * unavailable model and an answer cut off by the ceiling are all treated the
 * same way: not an answer, so the next attempt is worth trying.
 */
export async function requestChatCompletion(provider: AiProvider, request: ChatRequest): Promise<string> {
  const deadline = Date.now() + CHAIN_DEADLINE_MS;
  let lastFailure = "no model configured";

  for (const model of modelChain(provider)) {
    for (const thinkingOff of provider.controlsThinking ? [true, false] : [false]) {
      const remaining = deadline - Date.now();
      const attemptStarted = Date.now();
      if (remaining < 1_000) throw new Error(`AI service unavailable (chain timed out): ${lastFailure}`);

      let result: Awaited<ReturnType<typeof post>>;
      try {
        result = await post(provider, requestBody(provider, request, model, thinkingOff), Math.min(REQUEST_TIMEOUT_MS, remaining));
      } catch (cause) {
        lastFailure = `${model}: ${cause instanceof Error ? cause.message : String(cause)}`;
        continue;
      }

      if (result.payload && !result.payload.truncated) return result.payload.content;
      lastFailure = result.payload
        ? `${model}: answer cut off at the token ceiling`
        : `${model}: status ${result.status} ${result.detail}`;

      // A run that retried is worth seeing: a slow or noisy provider shows up
      // here before it shows up as a failed request.
      console.warn("AI attempt failed after " + (Date.now() - attemptStarted) + "ms (" + model + ", thinking " + (thinkingOff ? "off" : "on") + "): " + lastFailure);

      // Bad credentials fail for every model and every shape: stop early.
      if (result.status === 401 || result.status === 403) throw new Error(`AI credentials rejected (${lastFailure})`);
      // Only a refused request shape is worth retrying against the same model.
      if (result.status !== 400 && !result.payload) break;
    }
  }

  throw new Error(`AI service unavailable (${lastFailure})`);
}
