export type EventType = 'user' | 'assistant' | 'tool_call' | 'tool_result';

export interface UsageInfo {
  input_tokens?: number;
  output_tokens?: number;
}

interface BaseEvent {
  ts?: number;
}

export interface UserEvent extends BaseEvent {
  type: 'user';
  text?: string;
}

export interface AssistantEvent extends BaseEvent {
  type: 'assistant';
  text?: string;
  usage?: UsageInfo;
}

export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  id?: string;
  name?: string;
  args?: unknown;
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  id?: string;
  ok?: boolean;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

export type TraceEvent = UserEvent | AssistantEvent | ToolCallEvent | ToolResultEvent;

export interface ParseIssue {
  line: number;
  message: string;
  raw: string;
}

export type LineResult =
  | { ok: true; event: TraceEvent }
  | { ok: false; issue: ParseIssue };

export interface ParseResult {
  events: TraceEvent[];
  issues: ParseIssue[];
}
