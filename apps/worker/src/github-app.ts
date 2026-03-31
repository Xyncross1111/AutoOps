import { App } from "@octokit/app";

import type { WorkerConfig } from "./config.js";

export class GitHubAppService {
  private app: App | null;

  constructor(config: WorkerConfig) {
    this.app =
      config.GITHUB_APP_ID > 0 && config.GITHUB_PRIVATE_KEY
        ? new App({
            appId: config.GITHUB_APP_ID,
            privateKey: config.GITHUB_PRIVATE_KEY
          })
        : null;
  }

  async createInstallationToken(installationId: number): Promise<string> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }
    const octokit = await this.app.getInstallationOctokit(installationId);
    const authResult = await octokit.auth({
      type: "installation"
    });
    if (
      !authResult ||
      typeof authResult !== "object" ||
      !("token" in authResult) ||
      typeof authResult.token !== "string"
    ) {
      throw new Error("Unable to create installation token.");
    }
    return authResult.token;
  }
}
