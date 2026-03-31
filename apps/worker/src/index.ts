import { AutoOpsDb } from "@autoops/db";

import { loadWorkerConfig } from "./config.js";
import { GitHubAppService } from "./github-app.js";
import { PipelineWorker } from "./pipeline-worker.js";
import { ShellExecutionInfrastructure } from "./shell-infrastructure.js";

async function main() {
  const config = loadWorkerConfig();
  const db = AutoOpsDb.fromConnectionString(config.DATABASE_URL);
  await db.migrate();

  const worker = new PipelineWorker(
    db,
    new GitHubAppService(config),
    new ShellExecutionInfrastructure(),
    config
  );

  console.log("AutoOps worker polling for queued runs.");
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
