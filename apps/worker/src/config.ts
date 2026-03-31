import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SECRET_MASTER_KEY: z.string().min(8),
  GITHUB_APP_ID: z.string().default("0"),
  GITHUB_PRIVATE_KEY: z.string().default(""),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  RUNNER_TEMP_DIR: z.string().default("./tmp"),
  MANAGED_APPS_DIR: z.string().default("/opt/autoops-managed"),
  MANAGED_BASE_DOMAIN: z.string().default(""),
  MANAGED_EDGE_CONTAINER_NAME: z.string().default("autoops-caddy"),
  MANAGED_NETWORK_NAME: z.string().default("autoops-managed")
});

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = configSchema.parse(env);
  return {
    ...parsed,
    GITHUB_APP_ID: Number(parsed.GITHUB_APP_ID),
    GITHUB_PRIVATE_KEY: parsed.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n")
  };
}
