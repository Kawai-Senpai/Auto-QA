import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { compileScenario } from './lib/compiler.js';
import { ScenarioSchema } from './lib/scenario.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: npm run compile -- specs/scenarios/example.json');
  process.exit(1);
}

const absoluteInputPath = resolve(inputPath);

let rawInput: unknown;

try {
  rawInput = JSON.parse(readFileSync(absoluteInputPath, 'utf8'));
} catch (error) {
  console.error(`Could not read scenario ${basename(inputPath)}:`, error);
  process.exit(1);
}

const parsed = ScenarioSchema.safeParse(rawInput);

if (!parsed.success) {
  console.error(JSON.stringify(z_format(parsed.error), null, 2));
  process.exit(1);
}

const outputPath = resolve(
  'tests',
  'generated',
  `${parsed.data.id}.spec.ts`,
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, compileScenario(parsed.data), 'utf8');

console.log(outputPath);

function z_format(error: unknown): unknown {
  // Zod 4 exposes issues directly; keep the raw list rather than a formatted
  // tree so the output stays machine-readable for the agent loop.
  return { issues: (error as { issues?: unknown }).issues ?? String(error) };
}
