import { App } from "@octokit/app";

import { buildGitHubAppInstallUrl } from "@autoops/core";

import type { ApiConfig } from "./config.js";

interface FetchFileArgs {
  installationId: number;
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export class GitHubAppService {
  private app: App | null;

  constructor(private readonly config: ApiConfig) {
    this.app =
      config.GITHUB_APP_ID > 0 && config.GITHUB_PRIVATE_KEY
        ? new App({
            appId: config.GITHUB_APP_ID,
            privateKey: config.GITHUB_PRIVATE_KEY
          })
        : null;
  }

  isConfigured(): boolean {
    return Boolean(this.app);
  }

  getInstallUrl(): string {
    if (!this.config.GITHUB_APP_SLUG) {
      throw new Error("GITHUB_APP_SLUG is not configured.");
    }
    return buildGitHubAppInstallUrl(this.config.GITHUB_APP_SLUG);
  }

  async createInstallationToken(installationId: number): Promise<string> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }
    const installationOctokit = await this.app.getInstallationOctokit(installationId);
    const authResult = await installationOctokit.auth({
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

  async fetchRepositoryFile(args: FetchFileArgs): Promise<string> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }
    const octokit = await this.app.getInstallationOctokit(args.installationId);
    const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: args.owner,
      repo: args.repo,
      path: args.path,
      ref: args.ref,
      headers: {
        accept: "application/vnd.github.raw"
      }
    });
    return typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  }
}
