import { AutoOpsDb } from "@autoops/db";

import { createApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { GitHubAppService } from "./github-app.js";

async function main() {
  const config = loadApiConfig();
  const db = AutoOpsDb.fromConnectionString(config.DATABASE_URL);
  await db.migrate();

  const app = createApp({
    config,
    db,
    github: new GitHubAppService(config)
  });

  app.listen(config.PORT, () => {
    console.log(`AutoOps API listening on http://localhost:${config.PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
