import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { compiledFileName, compileScenario } from './src/lib/compiler.js';
import { ScenarioSchema } from './src/lib/scenario.js';
import { loadTargetConfig } from './src/lib/target-config.js';
import { assertRoleConfigured } from './src/lib/auth.js';

const { root, config } = loadTargetConfig('c:/Ranit/Temp/AstroInference/frontend');

for (const id of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(join(root, config.testing.scenariosDirectory, id + '.json'), 'utf8'));
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    console.log(`REJECTED ${id}:`, JSON.stringify(parsed.error.issues.slice(0, 3)));
    continue;
  }
  if (parsed.data.role) assertRoleConfigured(config, parsed.data.role);
  const file = compiledFileName(parsed.data);
  mkdirSync(join(root, config.testing.generatedDirectory), { recursive: true });
  writeFileSync(join(root, config.testing.generatedDirectory, file), compileScenario(parsed.data), 'utf8');
  console.log(`compiled ${id} -> ${file}`);
}
