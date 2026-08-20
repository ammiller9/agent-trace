import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrace, parseTraceLine, parseTraceStrict } from '../src/parseTrace.ts';

test('parses a user event', () => {
  const result = parseTraceLine('{"type":"user","ts":100,"text":"hi"}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, { type: 'user', ts: 100, text: 'hi' });
});

test('parses an assistant event with usage', () => {
  const result = parseTraceLine(
    '{"type":"assistant","ts":200,"text":"ok","usage":{"input_tokens":10,"output_tokens":5}}',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok && result.event,
    { type: 'assistant', ts: 200, text: 'ok', usage: { input_tokens: 10, output_tokens: 5 } },
  );
});

test('drops an assistant usage object with no recognised fields', () => {
  const result = parseTraceLine('{"type":"assistant","ts":200,"text":"ok","usage":{"cost":1}}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event, { type: 'assistant', ts: 200, text: 'ok' });
});

test('parses a tool_call event', () => {
  const result = parseTraceLine(
    '{"type":"tool_call","ts":300,"id":"c1","name":"read_file","args":{"path":"a.ts"}}',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok && result.event,
    { type: 'tool_call', ts: 300, id: 'c1', name: 'read_file', args: { path: 'a.ts' } },
  );
});

test('parses a tool_result event', () => {
  const result = parseTraceLine(
    '{"type":"tool_result","ts":400,"id":"c1","ok":true,"durationMs":54,"output":"1.9 kB read"}',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok && result.event,
    { type: 'tool_result', ts: 400, id: 'c1', ok: true, durationMs: 54, output: '1.9 kB read', error: undefined },
  );
});

test('accepts alternate field names', () => {
  const result = parseTraceLine(
    '{"role":"tool_call","timestamp":500,"id":"c2","tool":"run_tests","arguments":{"n":1}}',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok && result.event,
    { type: 'tool_call', ts: 500, id: 'c2', name: 'run_tests', args: { n: 1 } },
  );
});

test('rejects invalid JSON with a line-numbered issue', () => {
  const result = parseTraceLine('{not json', 7);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.issue.line, 7);
  assert.match(!result.ok ? result.issue.message : '', /invalid JSON/);
});

test('rejects a JSON value that is not an object', () => {
  const result = parseTraceLine('[1,2,3]');
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.issue.message : '', /not a JSON object/);
});

test('rejects an object missing a type field', () => {
  const result = parseTraceLine('{"text":"no type"}');
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.issue.message : '', /missing "type"/);
});

test('rejects an unknown event type', () => {
  const result = parseTraceLine('{"type":"heartbeat"}');
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.issue.message : '', /unknown event type/);
});

test('parseTrace skips blank lines without reporting an issue', () => {
  const text = '{"type":"user","text":"a"}\n\n{"type":"user","text":"b"}\n';
  const { events, issues } = parseTrace(text);
  assert.equal(events.length, 2);
  assert.equal(issues.length, 0);
});

test('parseTrace reports the 1-based line number of a bad line', () => {
  const text = '{"type":"user","text":"a"}\n{broken\n{"type":"user","text":"b"}\n';
  const { events, issues } = parseTrace(text);
  assert.equal(events.length, 2);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 2);
});

test('parseTraceStrict returns events when the trace is clean', () => {
  const events = parseTraceStrict('{"type":"user","text":"a"}\n');
  assert.equal(events.length, 1);
});

test('parseTraceStrict throws on the first unusable line', () => {
  assert.throws(
    () => parseTraceStrict('{"type":"user","text":"a"}\n{broken\n'),
    /line 2/,
  );
});
