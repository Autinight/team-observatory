// Smoke tests for session utilities.
import assert from "node:assert/strict";
import {
  textOrNull,
  pathKey,
  inferAgentIdFromSessionPath,
} from "../lib/sessions.js";

// textOrNull
assert.equal(textOrNull(null), null);
assert.equal(textOrNull(undefined), null);
assert.equal(textOrNull("hello"), "hello");
assert.equal(textOrNull("x".repeat(600)), "x".repeat(500));  // 500 char limit
assert.equal(textOrNull(42), "42");  // number → JSON.stringify
assert.equal(textOrNull({ key: "val" }), '{"key":"val"}');

// pathKey
assert.ok(pathKey("/foo/bar") !== pathKey("/foo/baz"));
assert.ok(pathKey("C:\\Users\\Test") === pathKey("c:\\users\\test"));  // case-insensitive on Windows

// inferAgentIdFromSessionPath
assert.equal(inferAgentIdFromSessionPath("/path/to/agents/shiraha/sessions/x.jsonl"), "shiraha");
assert.equal(inferAgentIdFromSessionPath("C:\\Users\\Test\\.hanako\\agents\\rihane\\sessions\\x.jsonl"), "rihane");
assert.equal(inferAgentIdFromSessionPath("/random/path.jsonl"), null);

console.log("sessions passed");
