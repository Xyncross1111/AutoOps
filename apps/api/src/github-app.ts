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

export interface GitHubInstallationRepository {
  repoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  htmlUrl: string;
  pushedAt: string | null;
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

  async fetchRepositoryFileOptional(args: FetchFileArgs): Promise<string | null> {
    try {
      return await this.fetchRepositoryFile(args);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        Number((error as { status?: unknown }).status) === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async listInstallationRepositories(
    installationId: number
  ): Promise<GitHubInstallationRepository[]> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }

    const octokit = await this.app.getInstallationOctokit(installationId);
    const repositories: GitHubInstallationRepository[] = [];
    let page = 1;

    while (true) {
      const response = await octokit.request("GET /installation/repositories", {
        per_page: 100,
        page
      });

      for (const repository of response.data.repositories) {
        repositories.push({
          repoId: repository.id,
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          isPrivate: repository.private,
          isArchived: repository.archived,
          htmlUrl: repository.html_url,
          pushedAt: repository.pushed_at
        });
      }

      if (response.data.repositories.length < 100) {
        break;
      }

      page += 1;
    }

    return repositories;
  }

  async getBranchHeadSha(args: {
    installationId: number;
    owner: string;
    repo: string;
    branch: string;
  }): Promise<string> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }

    const octokit = await this.app.getInstallationOctokit(args.installationId);
    const response = await octokit.request("GET /repos/{owner}/{repo}/branches/{branch}", {
      owner: args.owner,
      repo: args.repo,
      branch: args.branch
    });

    return response.data.commit.sha;
  }
}
