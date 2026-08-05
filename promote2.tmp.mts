import { promoteTest } from './src/lib/promote.js';
import { loadTargetConfig } from './src/lib/target-config.js';
const { root, config } = loadTargetConfig('c:/Ranit/Temp/AstroInference/frontend');
const evidence = {
  auditPassed: true, typeCheckPassed: true, repeatedRunsPassed: true,
  negativeValidationPerformed: true, negativeValidationFailedAsExpected: true,
  visualBaselinesApproved: false, usesPersonalCredentials: false,
  requirementSourceResolved: true,
};
for (const f of ['verified-models-pool-surface.spec.ts', 'api-keys-console.spec.ts']) {
  const r = promoteTest(root, config, f, evidence);
  console.log(`${r.promoted ? 'PROMOTED' : 'REFUSED '} ${r.file}`);
  for (const g of r.gates.filter(g => !g.passed)) console.log('   blocked by:', g.name);
}
