/**
 * Vercel's build command (vercel.json): runs buildSteps(VERCEL_ENV) in order and stops at the
 * first failure. Preview builds first check they aren't pointed at the production database.
 */
import { spawnSync } from "node:child_process";

import { buildSteps, previewGuardError } from "./vercel-build-steps";

const vercelEnv = process.env.VERCEL_ENV;
const steps = buildSteps(vercelEnv);
console.log(`VERCEL_ENV=${vercelEnv ?? "(unset)"}; steps: ${steps.join(", ")}`);

if (vercelEnv === "preview") {
  const error = previewGuardError({ databaseUrl: process.env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST });
  if (error) {
    console.error(`Build stopped: ${error}`);
    process.exit(1);
  }
}

for (const step of steps) {
  console.log(`\n> npm run ${step}`);
  const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (result.status !== 0) {
    if (result.error) console.error(`npm run ${step} could not start: ${result.error.message}`);
    else if (result.signal) console.error(`npm run ${step} was killed by ${result.signal}`);
    process.exit(result.status ?? 1);
  }
}
