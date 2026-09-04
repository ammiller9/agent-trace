import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTimeline } from '../src/renderTimeline.ts';
import type { TraceEvent } from '../src/types.ts';

const SESSION: TraceEvent[] = [
  { type: 'user', ts: 0, text: 'the parse test fails on windows' },
  { type: 'assistant', ts: 900, text: 'let me look', usage: { input_tokens: 1180, output_tokens: 96 } },
  { type: 'tool_call', ts: 950, id: 'c1', name: 'read_file', args: { path: 'src/parse.ts' } },
  { type: 'tool_result', ts: 1004, id: 'c1', ok: true, durationMs: 54, output: '1.9 kB read' },
];

test('one line per event, in order, with timestamps relative to the first event', () => {
  const lines = renderTimeline(SESSION).split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^\+0\.000s.*\buser\b.*the parse test fails on windows/);
  assert.match(lines[1], /^\+0\.900s.*\bassistant\b.*let me look.*\[1180 in \/ 96 out\]/);
  assert.match(lines[2], /^\+0\.950s.*\btool_call\b.*read_file.*"path":"src\/parse\.ts"/);
  assert.match(lines[3], /^\+1\.004s.*\btool_result\b.*read_file.*\bok\b.*54ms.*1\.9 kB read/);
});

test('a failed result reports its status and a result with no matching call is (unknown)', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'run_tests', args: {} },
    { type: 'tool_result', ts: 500, id: 'c1', ok: false, durationMs: 500, error: 'assertion failed' },
    { type: 'tool_result', ts: 600, id: 'ghost', ok: true, output: 'x' },
  ];
  const lines = renderTimeline(events).split('\n');
  assert.match(lines[1], /run_tests.*\bfailed\b.*error: assertion failed/);
  assert.match(lines[2], /\(unknown\).*\bok\b/);
});

test('--tool filters out every other tool and all text events', () => {
  const events: TraceEvent[] = [
    ...SESSION,
    { type: 'tool_call', ts: 1100, id: 'c2', name: 'write_file', args: {} },
    { type: 'tool_result', ts: 1150, id: 'c2', ok: true, output: 'written' },
  ];
  const lines = renderTimeline(events, { tool: 'read_file' }).split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.includes('read_file')));
});

test('includeText: false hides user and assistant lines but keeps tool events', () => {
  const lines = renderTimeline(SESSION, { includeText: false }).split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => /tool_call|tool_result/.test(line)));
});

test('maxArgLength truncates long args and output with an ellipsis', () => {
  const events: TraceEvent[] = [
    { type: 'tool_call', ts: 0, id: 'c1', name: 'read_file', args: { path: 'a very long path name that goes on' } },
    { type: 'tool_result', ts: 1, id: 'c1', ok: true, output: 'a very long output string that goes on and on' },
  ];
  const lines = renderTimeline(events, { maxArgLength: 10 }).split('\n');
  assert.match(lines[0], /…$/);
  assert.match(lines[1], /…$/);
  for (const line of lines) {
    const lastField = line.split('  ').pop() as string;
    assert.ok(lastField.length <= 10);
  }
});

test('an event with no timestamp gets a placeholder instead of a relative offset', () => {
  const events: TraceEvent[] = [{ type: 'user', text: 'no timestamp here' }];
  const lines = renderTimeline(events).split('\n');
  assert.match(lines[0], /^\+\?/);
});
