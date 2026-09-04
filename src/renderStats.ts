import { formatDuration, formatPercent } from './format.ts';
import type { ToolStat, TraceStats } from './types.ts';

const LABEL_WIDTH = 14;

export function renderStats(stats: TraceStats): string {
  const lines: string[] = [];
  const counts = stats.eventCounts;

  lines.push(
    'events'.padEnd(LABEL_WIDTH) +
      `${stats.totalEvents}  (user ${counts.user}, assistant ${counts.assistant}, ` +
      `tool_call ${counts.tool_call}, tool_result ${counts.tool_result})`,
  );

  lines.push(
    'wall clock'.padEnd(LABEL_WIDTH) +
      (stats.wallClockMs !== undefined ? formatDuration(stats.wallClockMs) : 'n/a'),
  );

  const toolTimeShare =
    stats.toolTimeShare !== undefined ? `  (${formatPercent(stats.toolTimeShare)} of wall clock)` : '';
  lines.push('tool time'.padEnd(LABEL_WIDTH) + formatDuration(stats.toolTimeMs) + toolTimeShare);

  const failureRate =
    stats.failureRate !== undefined ? ` = ${formatPercent(stats.failureRate)} failure rate` : '';
  lines.push(
    'tool calls'.padEnd(LABEL_WIDTH) +
      `${stats.toolCalls}  (${stats.completedToolCalls} completed, ${stats.pendingToolCalls} pending, ` +
      `${stats.failedToolCalls} failed${failureRate})`,
  );

  lines.push(
    'tokens'.padEnd(LABEL_WIDTH) +
      `${stats.inputTokens} in / ${stats.outputTokens} out = ${stats.totalTokens} total`,
  );

  if (stats.orphanResults > 0) {
    lines.push('orphans'.padEnd(LABEL_WIDTH) + `${stats.orphanResults} tool_result event(s) with no matching call`);
  }

  if (stats.tools.length > 0) {
    lines.push('');
    lines.push(renderToolTable(stats.tools));
  }

  return lines.join('\n');
}

function renderToolTable(tools: ToolStat[]): string {
  const headers = ['tool', 'calls', 'fail', 'total', 'avg', 'max', 'share'];
  const rows = tools.map((tool) => [
    tool.name,
    String(tool.calls),
    String(tool.failures),
    formatDuration(tool.totalMs),
    formatDuration(tool.avgMs),
    formatDuration(tool.maxMs),
    formatPercent(tool.timeShare),
  ]);

  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => row[i].length)));
  const formatRow = (cells: string[]): string =>
    cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ');

  return [formatRow(headers), ...rows.map(formatRow)].join('\n');
}
