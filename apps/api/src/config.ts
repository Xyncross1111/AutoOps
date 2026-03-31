import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(6),
  SECRET_MASTER_KEY: z.string().min(8),
  GITHUB_APP_ID: z.string().default("0"),
  GITHUB_APP_SLUG: z.string().default(""),
  GITHUB_PRIVATE_KEY: z.string().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().min(1)
});

export type ApiConfig = ReturnType<typeof loadApiConfig>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = configSchema.parse(env);
  return {
    ...parsed,
    GITHUB_APP_ID: Number(parsed.GITHUB_APP_ID),
    GITHUB_PRIVATE_KEY: parsed.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n")
  };
}

