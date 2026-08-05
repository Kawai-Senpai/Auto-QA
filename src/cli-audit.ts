import { auditGeneratedTests, runPlaywrightTests } from './lib/audit.js';

const target = process.argv[2] ?? 'tests/generated';

const repeatEach = Number.parseInt(process.env.REPEAT_EACH ?? '3', 10);

const issues = auditGeneratedTests(target);

if (issues.length > 0) {
  console.error(JSON.stringify({ status: 'rejected', issues }, null, 2));
  process.exit(1);
}

const result = runPlaywrightTests({
  target,
  repeatEach,
  project: process.env.PLAYWRIGHT_PROJECT ?? 'chromium',
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.exitCode !== 0) {
  process.exit(result.exitCode);
}

console.log(
  JSON.stringify({ status: 'accepted', repeatEach, target }, null, 2),
);
