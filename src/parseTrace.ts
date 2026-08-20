import type {
  AssistantEvent,
  LineResult,
  ParseIssue,
  ParseResult,
  TraceEvent,
  UsageInfo,
} from './types.ts';

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function normalizeUsage(value: unknown): UsageInfo | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  const input_tokens = typeof obj.input_tokens === 'number' ? obj.input_tokens : undefined;
  const output_tokens = typeof obj.output_tokens === 'number' ? obj.output_tokens : undefined;
  if (input_tokens === undefined && output_tokens === undefined) return undefined;
  const usage: UsageInfo = {};
  if (input_tokens !== undefined) usage.input_tokens = input_tokens;
  if (output_tokens !== undefined) usage.output_tokens = output_tokens;
  return usage;
}

// Runtimes disagree on field names (ts/timestamp, name/tool, args/arguments,
// type/role). Rather than pick one schema and reject the rest, every known
// alias is accepted so a real trace file doesn't need pre-processing.
export function parseTraceLine(raw: string, line = 0): LineResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, issue: { line, message: 'empty line', raw } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, issue: { line, message: `invalid JSON: ${message}`, raw } };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, issue: { line, message: 'not a JSON object', raw } };
  }

  const obj = parsed as Record<string, unknown>;
  const type = firstString(obj.type, obj.role);
  if (type === undefined) {
    return { ok: false, issue: { line, message: 'missing "type" field', raw } };
  }

  const ts = typeof obj.ts === 'number' ? obj.ts : typeof obj.timestamp === 'number' ? obj.timestamp : undefined;

  switch (type) {
    case 'user': {
      const text = typeof obj.text === 'string' ? obj.text : undefined;
      return { ok: true, event: { type: 'user', ts, text } };
    }
    case 'assistant': {
      const text = typeof obj.text === 'string' ? obj.text : undefined;
      const usage = normalizeUsage(obj.usage);
      const event: AssistantEvent = { type: 'assistant', ts, text };
      if (usage !== undefined) event.usage = usage;
      return { ok: true, event };
    }
    case 'tool_call': {
      const id = typeof obj.id === 'string' ? obj.id : undefined;
      const name = firstString(obj.name, obj.tool);
      const args = 'args' in obj ? obj.args : obj.arguments;
      return { ok: true, event: { type: 'tool_call', ts, id, name, args } };
    }
    case 'tool_result': {
      const id = typeof obj.id === 'string' ? obj.id : undefined;
      const success = typeof obj.ok === 'boolean' ? obj.ok : undefined;
      const durationMs = typeof obj.durationMs === 'number' ? obj.durationMs : undefined;
      const output = obj.output;
      const error = typeof obj.error === 'string' ? obj.error : undefined;
      return { ok: true, event: { type: 'tool_result', ts, id, ok: success, durationMs, output, error } };
    }
    default:
      return { ok: false, issue: { line, message: `unknown event type "${type}"`, raw } };
  }
}

export function parseTrace(text: string): ParseResult {
  const events: TraceEvent[] = [];
  const issues: ParseIssue[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;
    const result = parseTraceLine(raw, i + 1);
    if (result.ok) {
      events.push(result.event);
    } else {
      issues.push(result.issue);
    }
  }

  return { events, issues };
}

export function parseTraceStrict(text: string): TraceEvent[] {
  const { events, issues } = parseTrace(text);
  if (issues.length > 0) {
    const first = issues[0];
    throw new Error(`line ${first.line}: ${first.message}`);
  }
  return events;
}
