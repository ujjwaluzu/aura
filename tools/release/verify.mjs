import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runPnpm, sourceState } from './common.mjs';

const directory = join(root, 'artifacts/release-checks');
mkdirSync(directory, { recursive: true });
const startedAt = new Date().toISOString();
runPnpm(['licenses:generate']);
const source = sourceState();
const steps = [];
try {
  for (const args of [
    ['format:check'],
    ['lint'],
    ['build'],
    ['native:format'],
    ['native:lint'],
    ['native:test'],
    ['audit', '--audit-level', 'moderate'],
    ['audit:native'],
    ['exec', 'playwright', 'test', '--workers=1', '--reporter=list,json'],
  ]) {
    console.log(`\nChecking: pnpm ${args.join(' ')}`);
    runPnpm(args, {
      AURA_NATIVE_CDP: '',
      AURA_TEST_OUTPUT: join(directory, 'browser'),
      PLAYWRIGHT_JSON_OUTPUT_NAME: join(directory, 'browser-results.json'),
    });
    steps.push({ command: `pnpm ${args.join(' ')}`, passed: true });
  }
  if (sourceState().fingerprint !== source.fingerprint)
    throw new Error(
      'Build inputs changed during verification. Run verification again.',
    );
  writeFileSync(
    join(directory, 'verification.json'),
    JSON.stringify(
      {
        passed: true,
        startedAt,
        completedAt: new Date().toISOString(),
        source,
        steps,
      },
      null,
      2,
    ),
  );
} catch (error) {
  writeFileSync(
    join(directory, 'verification.json'),
    JSON.stringify(
      {
        passed: false,
        startedAt,
        completedAt: new Date().toISOString(),
        source,
        steps,
      },
      null,
      2,
    ),
  );
  throw error;
}
