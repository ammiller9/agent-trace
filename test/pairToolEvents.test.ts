import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairToolEvents } from '../src/pairToolEvents.ts';
import type { TraceEvent } from '../src/types.ts';

test('matches a result to its call by id', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: { path: 'a.ts' } },
    { type: 'tool_result', ts: 50, id: 'c1', ok: true, durationMs: 50, output: 'done' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 1);
  assert.equal(orphans.length, 0);
  assert.equal(spans[0].ok, true);
  assert.equal(spans[0].durationMs, 50);
});

test('falls back to timestamp delta when durationMs is missing', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 100, id: 'c1', name: 'run_tests', args: {} },
    { type: 'tool_result', ts: 175, id: 'c1', ok: true, output: 'ok' },
  ];
  const { spans } = pairToolEvents(events);
  assert.equal(spans[0].durationMs, 75);
});

test('matches an id-less result to the oldest still-open call', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: {} },
    { type: 'tool_call', ts: 1, id: 'c2', name: 'write_file', args: {} },
    { type: 'tool_result', ts: 10, ok: true, output: 'first' },
    { type: 'tool_result', ts: 20, ok: true, output: 'second' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(orphans.length, 0);
  assert.equal(spans[0].call.id, 'c1');
  assert.equal(spans[0].result?.output, 'first');
  assert.equal(spans[1].call.id, 'c2');
  assert.equal(spans[1].result?.output, 'second');
});

test('reports a result whose id matches nothing as an orphan', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: {} },
    { type: 'tool_result', ts: 10, id: 'c1', ok: true, output: 'done' },
    { type: 'tool_result', ts: 20, id: 'c1', ok: true, output: 'late duplicate' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 1);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].output, 'late duplicate');
});

test('a call with no matching result is left pending', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: {} },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].result, undefined);
  assert.equal(spans[0].durationMs, undefined);
  assert.equal(orphans.length, 0);
});

test('non-tool events are ignored', () => {
  const events: TraceEvent[] = [
    { type: 'user', ts: 0, text: 'hi' },
    { type: 'tool_call', ts: 1, id: 'c1', name: 'read_file', args: {} },
    { type: 'assistant', ts: 2, text: 'ok' },
    { type: 'tool_result', ts: 3, id: 'c1', ok: true, output: 'done' },
  ];
  const { spans, orphans } = pairToolEvents(events);
  assert.equal(spans.length, 1);
  assert.equal(orphans.length, 0);
});
