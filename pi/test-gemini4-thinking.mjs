import assert from "node:assert/strict";
import test from "node:test";
import gemini4Thinking from "./extensions/gemini4-thinking.ts";

let handler;
let level = "high";
gemini4Thinking({
  on: (event, callback) => {
    assert.equal(event, "before_provider_request");
    handler = callback;
  },
  getThinkingLevel: () => level,
});
const map = { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null };
const model = { provider: "google-vertex", id: "gemini-4-argon", thinkingLevelMap: map };
const request = { model: model.id, contents: [], config: { temperature: 1, thinkingConfig: { includeThoughts: true, thinkingBudget: 24576 } } };
const rewrite = (payload, active = model) => handler({ payload }, { model: active });

test("a Gemini 4 thinking budget becomes the mapped thinking level", () => {
  for (const [selected, expected] of [["high", "HIGH"], ["medium", "MEDIUM"], ["low", "LOW"]]) {
    level = selected;
    assert.deepEqual(rewrite(request), { ...request, config: { temperature: 1, thinkingConfig: { includeThoughts: true, thinkingLevel: expected } } });
  }
  assert.equal(request.config.thinkingConfig.thinkingBudget, 24576);
  level = "high";
});

test("levels Gemini 4 does not map keep Pi's request", () => {
  level = "xhigh";
  assert.equal(rewrite(request), undefined);
  level = "high";
});

test("requests Pi already sends correctly are left alone", () => {
  assert.equal(rewrite({ ...request, config: { thinkingConfig: { thinkingLevel: "HIGH" } } }), undefined);
  assert.equal(rewrite({ ...request, config: {} }), undefined);
});

test("other models, providers and malformed payloads are untouched", () => {
  assert.equal(rewrite(request, { ...model, id: "gemini-3.8-flash" }), undefined);
  assert.equal(rewrite(request, { ...model, provider: "openai" }), undefined);
  assert.equal(handler({ payload: request }, { model: undefined }), undefined);
  for (const payload of [null, [], "text", {}, { config: null }, { config: { thinkingConfig: [] } }]) assert.equal(rewrite(payload), undefined);
});
