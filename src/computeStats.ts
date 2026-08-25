import { pairToolEvents } from './pairToolEvents.ts';
import type { ToolSpan } from './pairToolEvents.ts';
import type { EventCounts, ToolStat, TraceEvent, TraceStats } from './types.ts';

export function computeStats(events: TraceEvent[]): TraceStats {
  const eventCounts: EventCounts = { user: 0, assistant: 0, tool_call: 0, tool_result: 0 };
  let inputTokens = 0;
  let outputTokens = 0;
  let minTs: number | undefined;
  let maxTs: number | undefined;

  for (const event of events) {
    eventCounts[event.type]++;
    if (typeof event.ts === 'number') {
      minTs = minTs === undefined ? event.ts : Math.min(minTs, event.ts);
      maxTs = maxTs === undefined ? event.ts : Math.max(maxTs, event.ts);
    }
    if (event.type === 'assistant' && event.usage !== undefined) {
      inputTokens += event.usage.input_tokens ?? 0;
      outputTokens += event.usage.output_tokens ?? 0;
    }
  }

  const { spans, orphans } = pairToolEvents(events);
  const tools = summarizeTools(spans);
  const toolTimeMs = tools.reduce((sum, tool) => sum + tool.totalMs, 0);
  for (const tool of tools) {
    tool.timeShare = toolTimeMs > 0 ? tool.totalMs / toolTimeMs : 0;
  }

  const completedToolCalls = spans.filter((span) => span.result !== undefined).length;
  const failedToolCalls = spans.filter((span) => span.ok === false).length;
  const wallClockMs = minTs !== undefined && maxTs !== undefined ? maxTs - minTs : undefined;

  return {
    totalEvents: events.length,
    eventCounts,
    wallClockMs,
    toolTimeMs,
    toolTimeShare: wallClockMs !== undefined && wallClockMs > 0 ? toolTimeMs / wallClockMs : undefined,
    toolCalls: spans.length,
    completedToolCalls,
    pendingToolCalls: spans.length - completedToolCalls,
    failedToolCalls,
    failureRate: completedToolCalls > 0 ? failedToolCalls / completedToolCalls : undefined,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    tools,
    orphanResults: orphans.length,
  };
}

function summarizeTools(spans: ToolSpan[]): ToolStat[] {
  const byName = new Map<string, { calls: number; failures: number; durations: number[] }>();

  for (const span of spans) {
    const name = span.call.name ?? '(unknown)';
    let entry = byName.get(name);
    if (entry === undefined) {
      entry = { calls: 0, failures: 0, durations: [] };
      byName.set(name, entry);
    }
    entry.calls++;
    if (span.ok === false) entry.failures++;
    if (typeof span.durationMs === 'number') entry.durations.push(span.durationMs);
  }

  const tools: ToolStat[] = [];
  for (const [name, entry] of byName) {
    const totalMs = entry.durations.reduce((sum, ms) => sum + ms, 0);
    tools.push({
      name,
      calls: entry.calls,
      failures: entry.failures,
      totalMs,
      avgMs: entry.durations.length > 0 ? totalMs / entry.durations.length : 0,
      maxMs: entry.durations.length > 0 ? Math.max(...entry.durations) : 0,
      timeShare: 0,
    });
  }

  tools.sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name));
  return tools;
}
