#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { computeStats } from './computeStats.ts';
import { parseTrace } from './parseTrace.ts';
import { renderStats } from './renderStats.ts';
import { renderTimeline } from './renderTimeline.ts';

const USAGE = `agent-trace -- summarise or replay a JSONL agent trace

Usage:
  agent-trace stats <file> [--json] [--strict]
  agent-trace show <file> [--tool=<name>] [--max-arg=<n>] [--no-text] [--strict]
  agent-trace -h | --help
  agent-trace --version

Pass "-" as <file> to read the trace from stdin.

Options:
  --json          print stats as JSON instead of a table (stats only)
  --tool=<name>   restrict show to a single tool
  --max-arg=<n>   truncate tool arguments to n characters (default 80)
  --no-text       hide user and assistant messages
  --strict        exit 1 if any line failed to parse
`;

type Flags = Record<string, string | boolean>;

function getVersion(): string {
  const url = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

function parseFlags(args: string[]): { file?: string; flags: Flags; error?: string } {
  const flags: Flags = {};
  let file: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      }
    } else if (file === undefined) {
      file = arg;
    } else {
      return { flags, error: `unexpected argument: ${arg}` };
    }
  }

  return { file, flags };
}

function readInput(file: string): string {
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(USAGE);
    return argv.length === 0 ? 2 : 0;
  }

  if (argv[0] === '--version') {
    process.stdout.write(`agent-trace ${getVersion()}\n`);
    return 0;
  }

  const command = argv[0];
  if (command !== 'stats' && command !== 'show') {
    process.stderr.write(`unknown command "${command}"\n\n${USAGE}`);
    return 2;
  }

  const rest = argv.slice(1);
  if (rest.includes('-h') || rest.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const { file, flags, error } = parseFlags(rest);
  if (error !== undefined) {
    process.stderr.write(`${error}\n`);
    return 2;
  }
  if (file === undefined) {
    process.stderr.write('missing <file> argument\n');
    return 2;
  }

  const knownFlags = command === 'stats' ? ['json', 'strict'] : ['tool', 'max-arg', 'no-text', 'strict'];
  for (const key of Object.keys(flags)) {
    if (!knownFlags.includes(key)) {
      process.stderr.write(`unknown option --${key}\n`);
      return 2;
    }
  }

  let text: string;
  try {
    text = readInput(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`cannot read ${file === '-' ? 'stdin' : file}: ${message}\n`);
    return 2;
  }

  const { events, issues } = parseTrace(text);

  if (flags.strict && issues.length > 0) {
    for (const issue of issues) process.stderr.write(`line ${issue.line}: ${issue.message}\n`);
    return 1;
  }

  if (events.length === 0) {
    process.stderr.write('no usable events in trace\n');
    return 1;
  }

  if (issues.length > 0) {
    process.stderr.write(`skipped ${issues.length} unusable line(s)\n`);
  }

  if (command === 'stats') {
    const stats = computeStats(events);
    process.stdout.write(flags.json ? `${JSON.stringify(stats, null, 2)}\n` : `${renderStats(stats)}\n`);
    return 0;
  }

  let maxArgLength: number | undefined;
  if (typeof flags['max-arg'] === 'string') {
    maxArgLength = Number(flags['max-arg']);
    if (!Number.isFinite(maxArgLength) || maxArgLength < 0) {
      process.stderr.write(`invalid --max-arg value: ${flags['max-arg']}\n`);
      return 2;
    }
  }

  const output = renderTimeline(events, {
    tool: typeof flags.tool === 'string' ? flags.tool : undefined,
    maxArgLength,
    includeText: !flags['no-text'],
  });
  process.stdout.write(`${output}\n`);
  return 0;
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
