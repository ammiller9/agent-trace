import { formatDuration } from './format.ts';
import { pairToolEvents } from './pairToolEvents.ts';
import type { AssistantEvent, ToolCallEvent, ToolResultEvent, TraceEvent, UserEvent } from './types.ts';

export interface RenderTimelineOptions {
  tool?: string;
  maxArgLength?: number;
  includeText?: boolean;
}

const DEFAULT_MAX_ARG_LENGTH = 80;
const TYPE_WIDTH = 'tool_result'.length;

interface ResultInfo {
  name: string;
  durationMs?: number;
  ok?: boolean;
}

// A tool_result carries no tool name of its own -- only its matching
// tool_call does -- so results are named by looking up the pairing that
// pairToolEvents already worked out, keyed by event identity rather than by
// id (ids can be missing or, for orphans, match nothing).
export function renderTimeline(events: TraceEvent[], options: RenderTimelineOptions = {}): string {
  const maxArgLength = options.maxArgLength ?? DEFAULT_MAX_ARG_LENGTH;
  const includeText = options.includeText ?? true;
  const firstTs = events.find((event) => typeof event.ts === 'number')?.ts;

  const nameByCall = new Map<ToolCallEvent, string>();
  const infoByResult = new Map<ToolResultEvent, ResultInfo>();
  const { spans } = pairToolEvents(events);
  for (const span of spans) {
    const name = span.call.name ?? '(unknown)';
    nameByCall.set(span.call, name);
    if (span.result !== undefined) {
      infoByResult.set(span.result, { name, durationMs: span.durationMs, ok: span.ok });
    }
  }

  const lines: string[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'user':
      case 'assistant':
        if (includeText && options.tool === undefined) lines.push(formatTextLine(event, firstTs));
        break;
      case 'tool_call': {
        const name = nameByCall.get(event) ?? '(unknown)';
        if (options.tool === undefined || options.tool === name) {
          lines.push(formatCallLine(event, name, firstTs, maxArgLength));
        }
        break;
      }
      case 'tool_result': {
        const info = infoByResult.get(event);
        const name = info?.name ?? '(unknown)';
        if (options.tool === undefined || options.tool === name) {
          lines.push(formatResultLine(event, name, info, firstTs, maxArgLength));
        }
        break;
      }
    }
  }

  return lines.join('\n');
}

function formatTs(ts: number | undefined, firstTs: number | undefined): string {
  if (ts === undefined || firstTs === undefined) return '+?'.padEnd(9);
  return `+${((ts - firstTs) / 1000).toFixed(3)}s`.padEnd(9);
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  if (maxLength === 1) return text.slice(0, 1);
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatTextLine(event: UserEvent | AssistantEvent, firstTs: number | undefined): string {
  const parts = [formatTs(event.ts, firstTs), event.type.padEnd(TYPE_WIDTH), event.text ?? '(no text)'];
  if (event.type === 'assistant' && event.usage !== undefined) {
    const { input_tokens, output_tokens } = event.usage;
    if (input_tokens !== undefined || output_tokens !== undefined) {
      parts.push(`[${input_tokens ?? 0} in / ${output_tokens ?? 0} out]`);
    }
  }
  return parts.join('  ');
}

function formatCallLine(
  event: ToolCallEvent,
  name: string,
  firstTs: number | undefined,
  maxArgLength: number,
): string {
  const parts = [formatTs(event.ts, firstTs), 'tool_call'.padEnd(TYPE_WIDTH), name];
  if (event.args !== undefined) parts.push(truncate(safeStringify(event.args), maxArgLength));
  return parts.join('  ');
}

function formatResultLine(
  event: ToolResultEvent,
  name: string,
  info: ResultInfo | undefined,
  firstTs: number | undefined,
  maxArgLength: number,
): string {
  const ok = info?.ok ?? event.ok;
  const durationMs = info?.durationMs ?? event.durationMs;
  const status = ok === undefined ? '?' : ok ? 'ok' : 'failed';

  const parts = [formatTs(event.ts, firstTs), 'tool_result'.padEnd(TYPE_WIDTH), name, status];
  if (durationMs !== undefined) parts.push(formatDuration(durationMs));

  const detail = event.error !== undefined ? `error: ${event.error}` : stringifyOutput(event.output);
  if (detail !== '') parts.push(truncate(detail, maxArgLength));

  return parts.join('  ');
}

function stringifyOutput(output: unknown): string {
  if (output === undefined) return '';
  if (typeof output === 'string') return output;
  return safeStringify(output);
}

// Events don't have to come from parseTrace -- callers may build them by
// hand -- so args/output aren't guaranteed to be JSON-safe (e.g. circular
// references).
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
