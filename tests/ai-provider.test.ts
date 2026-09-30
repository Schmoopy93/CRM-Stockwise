import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { requestChatCompletion, resolveAiProvider, type ChatRequest } from "../lib/ai-provider.ts";

/** Every request body the provider sent, in order. */
let sent: Array<Record<string, unknown>> = [];
/** Responses to hand back, one per request; the last one repeats. */
let queue: Array<{ status: number; body: unknown }> = [];
const originalFetch = globalThis.fetch;

function reply(content: string, finishReason = "stop") {
  return { status: 200, body: { choices: [{ finish_reason: finishReason, message: { content } }] } };
}

function ask(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    temperature: 0.4,
    maxAnswerTokens: 400,
    messages: [{ role: "user", content: "Kako da dodam novi artikal?" }],
    ...overrides,
  };
}

beforeEach(() => {
  sent = [];
  queue = [];
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODELS;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    const next = queue.length > 1 ? queue.shift()! : queue[0] ?? reply("fallback answer");
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
});

test("a thinking model is asked for an answer with thinking switched off", async () => {
  queue.push(reply("Gotovo."));
  const answer = await requestChatCompletion(resolveAiProvider(), ask());

  assert.equal(answer, "Gotovo.");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].model, "gemini-3-flash-preview");
  assert.equal(sent[0].reasoning_effort, "none");
  // The ceiling covers the answer only, because no tokens go to reasoning.
  assert.equal(sent[0].max_tokens, 400);
  assert.equal("max_completion_tokens" in sent[0], false);
});

test("a model that refuses the thinking switch is asked again without it", async () => {
  queue.push({ status: 400, body: { error: { message: "Request contains an invalid argument." } } });
  queue.push(reply("Odgovor bez prekida."));

  const answer = await requestChatCompletion(resolveAiProvider(), ask());

  assert.equal(answer, "Odgovor bez prekida.");
  assert.equal(sent.length, 2);
  assert.equal("reasoning_effort" in sent[1], false);
  // With thinking allowed the ceiling has to cover the reasoning too.
  assert.ok((sent[1].max_completion_tokens as number) > 400);
});

test("an answer cut off by the token ceiling is retried, never returned", async () => {
  queue.push(reply("Da biste dobili tačan odgovor, moram da", "length"));
  queue.push(reply("Otvorite Svi artikli, pa Novi artikal."));

  const answer = await requestChatCompletion(resolveAiProvider(), ask());

  assert.equal(answer, "Otvorite Svi artikli, pa Novi artikal.");
  assert.equal(sent.length, 2);
});

test("an unavailable model falls through to the next one in the chain", async () => {
  process.env.GEMINI_FALLBACK_MODELS = "gemini-3.1-flash-lite";
  queue.push({ status: 503, body: { error: { message: "This model is currently experiencing high demand." } } });
  queue.push(reply("Odgovor sa rezervnog modela."));

  const answer = await requestChatCompletion(resolveAiProvider(), ask());

  assert.equal(answer, "Odgovor sa rezervnog modela.");
  assert.deepEqual(sent.map((body) => body.model), ["gemini-3-flash-preview", "gemini-3.1-flash-lite"]);
  assert.equal(sent[1].reasoning_effort, "none");
});

test("rejected credentials stop the chain instead of walking every model", async () => {
  queue.push({ status: 401, body: { error: { message: "API key not valid" } } });

  await assert.rejects(() => requestChatCompletion(resolveAiProvider(), ask()), /credentials rejected/);
  assert.equal(sent.length, 1);
});

test("the field suggester asks for a JSON object", async () => {
  queue.push(reply('{"category":"Odeća","fields":[]}'));
  const content = await requestChatCompletion(resolveAiProvider(), ask({ temperature: 0.2, maxAnswerTokens: 1_200, json: true }));

  assert.equal(JSON.parse(content).category, "Odeća");
  assert.deepEqual(sent[0].response_format, { type: "json_object" });
  assert.equal(sent[0].max_tokens, 1_200);
});

test("an OpenAI provider is asked in its own shape, without Gemini parameters", async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  queue.push(reply("ok"));

  assert.equal(await requestChatCompletion(resolveAiProvider(), ask()), "ok");
  assert.equal(sent[0].model, "gpt-4o-mini");
  assert.equal(sent[0].max_tokens, 400);
  assert.equal("reasoning_effort" in sent[0], false);
  assert.equal("max_completion_tokens" in sent[0], false);
});

test("every model failing reports the last failure", async () => {
  queue.push({ status: 500, body: { error: { message: "boom" } } });

  await assert.rejects(() => requestChatCompletion(resolveAiProvider(), ask()), /AI service unavailable/);
  // The primary, then the two configured fallbacks.
  assert.equal(sent.length, 3);
});
