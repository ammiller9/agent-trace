import type { ToolCallEvent, ToolResultEvent, TraceEvent } from './types.ts';

export interface ToolSpan {
  call: ToolCallEvent;
  result?: ToolResultEvent;
  durationMs?: number;
  ok?: boolean;
}

export interface PairResult {
  spans: ToolSpan[];
  orphans: ToolResultEvent[];
}

// Results are matched to calls by id. A result with no id is matched to the
// oldest still-open call, since that's what sequential (non-parallel) agents
// produce. A result whose id matches nothing open is an orphan rather than
// being guessed onto an unrelated call.
export function pairToolEvents(events: TraceEvent[]): PairResult {
  const spans: ToolSpan[] = [];
  const orphans: ToolResultEvent[] = [];
  const openById = new Map<string, ToolSpan>();
  const openInOrder: ToolSpan[] = [];

  for (const event of events) {
    if (event.type === 'tool_call') {
      const span: ToolSpan = { call: event };
      spans.push(span);
      openInOrder.push(span);
      if (event.id !== undefined) openById.set(event.id, span);
      continue;
    }

    if (event.type === 'tool_result') {
      let span: ToolSpan | undefined;
      if (event.id !== undefined) {
        span = openById.get(event.id);
      } else {
        span = openInOrder[0];
      }

      if (span === undefined) {
        orphans.push(event);
        continue;
      }

      span.result = event;
      span.ok = event.ok;
      span.durationMs = resolveDurationMs(span.call, event);

      if (span.call.id !== undefined) openById.delete(span.call.id);
      const index = openInOrder.indexOf(span);
      if (index !== -1) openInOrder.splice(index, 1);
    }
  }

  return { spans, orphans };
}

function resolveDurationMs(call: ToolCallEvent, result: ToolResultEvent): number | undefined {
  if (typeof result.durationMs === 'number') return result.durationMs;
  if (typeof call.ts === 'number' && typeof result.ts === 'number') return result.ts - call.ts;
  return undefined;
}
