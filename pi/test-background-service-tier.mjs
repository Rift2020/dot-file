import assert from "node:assert/strict";
import test from "node:test";
import backgroundServiceTier from "./extensions/background-service-tier.ts";

let handler;
backgroundServiceTier({ on: (event, callback) => {
  assert.equal(event, "before_provider_request");
  handler = callback;
} });
const model = { provider: "openai", api: "openai-responses", id: "gpt-6.1-sol" };
const request = { model: model.id, input: "Synthetic prompt", reasoning: { effort: "xhigh" }, tools: [] };
const standard = (payload, mode = "print", active = model) => handler({ payload }, { mode, model: active });
const fast = payload => "service_tier" in payload ? undefined : { ...payload, service_tier: "priority" };

test("interactive Fast and reasoning settings are left to the community plugin", () => {
  assert.equal(standard(request, "tui"), undefined);
  assert.equal(standard({ ...request, service_tier: "priority" }, "tui"), undefined);
});

test("print and RPC requests stay Standard in either extension load order", () => {
  for (const mode of ["print", "rpc"]) {
    for (const order of [[fast, payload => standard(payload, mode)], [payload => standard(payload, mode), fast]]) {
      let payload = request;
      for (const hook of order) payload = hook(payload) ?? payload;
      assert.deepEqual(payload, { ...request, service_tier: "default" });
    }
  }
  assert.equal("service_tier" in request, false);
});

test("background work overrides even an existing premium tier on both OpenAI APIs", () => {
  for (const active of [model, { ...model, provider: "openai-codex", api: "openai-codex-responses" }]) {
    assert.deepEqual(standard({ ...request, service_tier: "ultrafast" }, "print", active),
      { ...request, service_tier: "default" });
  }
});

test("other providers, mismatched models and invalid payloads are untouched", () => {
  assert.equal(standard(request, "print", { ...model, provider: "google-vertex", api: "google-generative-ai" }), undefined);
  assert.equal(standard(request, "print", { ...model, api: "anthropic-messages" }), undefined);
  assert.equal(standard(request, "print", { ...model, id: "other" }), undefined);
  for (const payload of [null, [], "text", {}, undefined]) assert.equal(standard(payload), undefined);
});
