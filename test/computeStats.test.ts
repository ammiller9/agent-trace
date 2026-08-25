import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/computeStats.ts';
import type { TraceEvent } from '../src/types.ts';

test('counts events by type', () => {
  const events: TraceEvent[] = [
    { type: 'user', ts: 0, text: 'hi' },
    { type: 'assistant', ts: 1, text: 'ok' },
    { type: 'tool_call', ts: 2, id: 'c1', name: 'read_file', args: {} },
    { type: 'tool_result', ts: 3, id: 'c1', ok: true, output: 'done' },
  ];
  const stats = computeStats(events);
  assert.equal(stats.totalEvents, 4);
  assert.deepEqual(stats.eventCounts, { user: 1, assistant: 1, tool_call: 1, tool_result: 1 });
});

test('sums input and output tokens across assistant events', () => {
  const events: TraceEvent[] = [
    { type: 'assistant', ts: 0, text: 'a', usage: { input_tokens: 100, output_tokens: 10 } },
    { type: 'assistant', ts: 1, text: 'b', usage: { input_tokens: 50 } },
  ];
  const stats = computeStats(events);
  assert.equal(stats.inputTokens, 150);
  assert.equal(stats.outputTokens, 10);
  assert.equal(stats.totalTokens, 160);
});

test('wall clock is the span between the earliest and latest timestamp', () => {
  const events: TraceEvent[] = [
    { type: 'user', ts: 1000, text: 'go' },
    { type: 'tool_call', ts: 1200, id: 'c1', name: 'run_tests', args: {} },
    { type: 'tool_result', ts: 1800, id: 'c1', ok: true, output: 'ok' },
  ];
  const stats = computeStats(events);
  assert.equal(stats.wallClockMs, 800);
});

test('wall clock is undefined when fewer than two events carry a timestamp', () => {
  const events: TraceEvent[] = [{ type: 'user', text: 'hi' }];
  const stats = computeStats(events);
  assert.equal(stats.wallClockMs, undefined);
  assert.equal(stats.toolTimeShare, undefined);
});

test('per-tool totals, failures and time share', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'run_tests', args: {} },
    { type: 'tool_result', ts: 1758, id: 'c1', ok: false, output: 'fail' },
    { type: 'tool_call', ts: 2000, id: 'c2', name: 'run_tests', args: {} },
    { type: 'tool_result', ts: 3757, id: 'c2', ok: true, output: 'pass' },
    { type: 'tool_call', ts: 4000, id: 'c3', name: 'read_file', args: {} },
    { type: 'tool_result', ts: 4048, id: 'c3', ok: true, output: 'text' },
  ];
  const stats = computeStats(events);

  assert.equal(stats.toolCalls, 3);
  assert.equal(stats.completedToolCalls, 3);
  assert.equal(stats.pendingToolCalls, 0);
  assert.equal(stats.failedToolCalls, 1);
  assert.equal(stats.failureRate, 1 / 3);

  assert.equal(stats.tools.length, 2);
  const runTests = stats.tools[0];
  assert.equal(runTests.name, 'run_tests');
  assert.equal(runTests.calls, 2);
  assert.equal(runTests.failures, 1);
  assert.equal(runTests.totalMs, 3515);
  assert.equal(runTests.avgMs, 1757.5);
  assert.equal(runTests.maxMs, 1758);

  const readFile = stats.tools[1];
  assert.equal(readFile.name, 'read_file');
  assert.equal(readFile.totalMs, 48);

  assert.equal(stats.toolTimeMs, 3563);
  assert.ok(Math.abs(runTests.timeShare - 3515 / 3563) < 1e-9);
  assert.ok(Math.abs(readFile.timeShare - 48 / 3563) < 1e-9);
});

test('a pending call has no duration and does not count as failed', () => {
  const events: TraceEvent[] = [{ type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: {} }];
  const stats = computeStats(events);
  assert.equal(stats.toolCalls, 1);
  assert.equal(stats.completedToolCalls, 0);
  assert.equal(stats.pendingToolCalls, 1);
  assert.equal(stats.failedToolCalls, 0);
  assert.equal(stats.failureRate, undefined);
  assert.equal(stats.tools[0].avgMs, 0);
  assert.equal(stats.tools[0].maxMs, 0);
});

test('counts orphan tool results', () => {
  const events: TraceEvent[] = [{ type: 'tool_result', ts: 0, id: 'ghost', ok: true, output: 'x' }];
  const stats = computeStats(events);
  assert.equal(stats.orphanResults, 1);
  assert.equal(stats.toolCalls, 0);
});

test('a call with no name is grouped under (unknown)', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', args: {} },
    { type: 'tool_result', ts: 10, id: 'c1', ok: true, output: 'x' },
  ];
  const stats = computeStats(events);
  assert.equal(stats.tools[0].name, '(unknown)');
});
