import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStatus,
  operationId,
  responseHeaders,
} from "../supabase/functions/_shared/operations.js";

test("A7 operational status taxonomy distinguishes auth, throttling and service failures", () => {
  assert.equal(classifyStatus(0), "network");
  assert.equal(classifyStatus(401), "authentication");
  assert.equal(classifyStatus(403), "authorization");
  assert.equal(classifyStatus(429), "rate_limit");
  assert.equal(classifyStatus(503), "service");
  assert.equal(classifyStatus(400), "request");
});

test("A7 accepts only bounded safe incoming correlation IDs", () => {
  const headers = new Headers({ "x-request-id": "req-a7_1234" });
  assert.equal(operationId(headers), "req-a7_1234");
  assert.notEqual(operationId(new Headers({ "x-request-id": "contains spaces" })), "contains spaces");
});

test("A7 response headers expose correlation without credentials", () => {
  const headers = responseHeaders({ "Access-Control-Allow-Origin": "https://thiepn.dev" }, "req-a7_1234");
  assert.equal(headers["X-Request-ID"], "req-a7_1234");
  assert.equal(headers["Cache-Control"], "no-store, max-age=0");
  const serialized = JSON.stringify(headers);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("token"), false);
});
