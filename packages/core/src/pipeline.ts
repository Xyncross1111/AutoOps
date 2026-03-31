import { minimatch } from "minimatch";
import YAML from "yaml";
import { z } from "zod";

import type { PipelineConfig } from "./types.js";

const pipelineSchema = z.object({
  version: z.literal(1),
  triggers: z.object({
    push: z.object({
      branches: z.array(z.string().min(1)).min(1)
    })
  }),
  build: z.object({
    context: z.string().min(1),
    dockerfile: z.string().min(1),
    image: z.string().min(1)
  }),
  test: z.object({
    commands: z.array(z.string().min(1)).min(1)
  }),
  deploy: z.object({
    targets: z
      .array(
        z.object({
          name: z.string().min(1),
          hostRef: z.string().min(1),
          composeFile: z.string().min(1),
          service: z.string().min(1),
          healthcheck: z.object({
            url: z.string().url(),
            timeoutSeconds: z.number().int().positive().optional()
          })
        })
      )
      .min(1)
  })
});

export function parsePipelineConfig(raw: string): PipelineConfig {
  const parsed = YAML.parse(raw);
  return pipelineSchema.parse(parsed);
}

export function normalizeGitRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

export function matchesPushTrigger(config: PipelineConfig, ref: string): boolean {
  const branch = normalizeGitRef(ref);
  return config.triggers.push.branches.some((pattern) =>
    minimatch(branch, pattern, { dot: true })
  );
}

