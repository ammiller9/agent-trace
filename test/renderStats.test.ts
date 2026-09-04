import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/computeStats.ts';
import { renderStats } from '../src/renderStats.ts';
import type { TraceEvent } from '../src/types.ts';

const SAMPLE_EVENTS: TraceEvent[] = [
  { type: 'user', ts: 0, text: 'go' },
  { type: 'assistant', ts: 1000, text: 'ok', usage: { input_tokens: 100, output_tokens: 20 } },
  { type: 'tool_call', ts: 2000, id: 'c1', name: 'foo', args: {} },
  { type: 'tool_result', ts: 4000, id: 'c1', ok: true, durationMs: 2000, output: 'done' },
  { type: 'tool_call', ts: 4000, id: 'c2', name: 'bar', args: {} },
  { type: 'tool_result', ts: 6000, id: 'c2', ok: false, durationMs: 2000, output: 'failed' },
  { type: 'assistant', ts: 7000, text: 'summary', usage: { input_tokens: 50, output_tokens: 10 } },
];

test('renders the summary lines with a fixed label column', () => {
  const lines = renderStats(computeStats(SAMPLE_EVENTS)).split('\n');
  assert.equal(lines[0], 'events        7  (user 1, assistant 2, tool_call 2, tool_result 2)');
  assert.equal(lines[1], 'wall clock    7.000s');
  assert.equal(lines[2], 'tool time     4.000s  (57.1% of wall clock)');
  assert.equal(lines[3], 'tool calls    2  (2 completed, 0 pending, 1 failed = 50.0% failure rate)');
  assert.equal(lines[4], 'tokens        150 in / 30 out = 180 total');
});

test('renders one row per tool, sorted by total time then name', () => {
  const lines = renderStats(computeStats(SAMPLE_EVENTS)).split('\n');
  assert.equal(lines[5], '');
  assert.match(lines[6], /^tool\s+calls\s+fail\s+total\s+avg\s+max\s+share$/);
  // equal totalMs (2000ms each) so tools break the tie alphabetically: bar before foo
  assert.match(lines[7], /^bar\s+1\s+1\s+2\.000s\s+2\.000s\s+2\.000s\s+50\.0%$/);
  assert.match(lines[8], /^foo\s+1\s+0\s+2\.000s\s+2\.000s\s+2\.000s\s+50\.0%$/);
});

test('omits the wall clock share and failure rate when there is no basis for them', () => {
  const events: TraceEvent[] = [{ type: 'tool_call', id: 'c1', name: 'read_file', args: {} }];
  const lines = renderStats(computeStats(events)).split('\n');
  assert.equal(lines[1], 'wall clock    n/a');
  assert.equal(lines[2], 'tool time     0ms');
  assert.equal(lines[3], 'tool calls    1  (0 completed, 1 pending, 0 failed)');
});

test('lists orphan tool results when present', () => {
  const events: TraceEvent[] = [{ type: 'tool_result', ts: 0, id: 'ghost', ok: true, output: 'x' }];
  const text = renderStats(computeStats(events));
  assert.match(text, /orphans\s+1 tool_result event\(s\) with no matching call/);
});

test('omits the tool table entirely when no tool calls occurred', () => {
  const events: TraceEvent[] = [{ type: 'user', ts: 0, text: 'hi' }];
  const text = renderStats(computeStats(events));
  assert.equal(text.split('\n').length, 5);
  assert.ok(!text.includes('\n\n'));
});

test('table columns widen to fit the longest value', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'a_very_long_tool_name', args: {} },
    { type: 'tool_result', ts: 100, id: 'c1', ok: true, durationMs: 100, output: 'x' },
  ];
  const lines = renderStats(computeStats(events)).split('\n');
  const nameWidth = 'a_very_long_tool_name'.length;
  assert.equal(lines[6].slice(0, nameWidth), 'tool'.padEnd(nameWidth));
  assert.equal(lines[7].slice(0, nameWidth), 'a_very_long_tool_name');
});
