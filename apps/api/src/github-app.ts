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
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  htmlUrl: string;
  pushedAt: string | null;
}

export interface GitHubInstallationSummary {
  installationId: number;
  accountLogin: string;
  accountType: string;
}

export interface GitHubOAuthUser {
  githubUserId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  profileUrl: string;
  scope: string | null;
  accessToken: string;
}

export interface GitHubOAuthRepository {
  repoId: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  visibility: string;
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

  isOAuthConfigured(): boolean {
    return Boolean(
      this.config.GITHUB_OAUTH_CLIENT_ID && this.config.GITHUB_OAUTH_CLIENT_SECRET
    );
  }

  async getInstallUrl(options: { state?: string } = {}): Promise<string> {
    if (this.app && options.state) {
      return await this.app.getInstallationUrl({
        state: options.state
      });
    }
    if (!this.config.GITHUB_APP_SLUG) {
      throw new Error("GITHUB_APP_SLUG is not configured.");
    }
    return buildGitHubAppInstallUrl(this.config.GITHUB_APP_SLUG, options);
  }

  getOAuthRedirectUrl(): string {
    return `${this.config.WEB_BASE_URL.replace(/\/+$/, "")}/github/connect/callback`;
  }

  getOAuthAuthorizeUrl(state: string): string {
    if (!this.isOAuthConfigured()) {
      throw new Error("GitHub OAuth credentials are not configured.");
    }

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.config.GITHUB_OAUTH_CLIENT_ID);
    url.searchParams.set("redirect_uri", this.getOAuthRedirectUrl());
    url.searchParams.set("scope", "read:user repo");
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "true");
    return url.toString();
  }

  async exchangeOAuthCode(args: {
    code: string;
    state?: string;
  }): Promise<GitHubOAuthUser> {
    if (!this.isOAuthConfigured()) {
      throw new Error("GitHub OAuth credentials are not configured.");
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: this.config.GITHUB_OAUTH_CLIENT_ID,
        client_secret: this.config.GITHUB_OAUTH_CLIENT_SECRET,
        code: args.code,
        state: args.state,
        redirect_uri: this.getOAuthRedirectUrl()
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`GitHub OAuth token exchange failed with status ${tokenResponse.status}.`);
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenPayload.access_token) {
      throw new Error(tokenPayload.error_description ?? tokenPayload.error ?? "GitHub did not return an access token.");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenPayload.access_token}`,
        "User-Agent": "AutoOps",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (!userResponse.ok) {
      throw new Error(`GitHub user lookup failed with status ${userResponse.status}.`);
    }

    const userPayload = (await userResponse.json()) as {
      id: number;
      login: string;
      name?: string | null;
      avatar_url?: string | null;
      html_url: string;
    };

    return {
      githubUserId: userPayload.id,
      login: userPayload.login,
      name: userPayload.name ?? null,
      avatarUrl: userPayload.avatar_url ?? null,
      profileUrl: userPayload.html_url,
      scope: tokenPayload.scope ?? null,
      accessToken: tokenPayload.access_token
    };
  }

  async listUserRepositories(accessToken: string): Promise<GitHubOAuthRepository[]> {
    const repositories: GitHubOAuthRepository[] = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "AutoOps",
            "X-GitHub-Api-Version": "2022-11-28"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub repository listing failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as Array<{
        id: number;
        owner: { login: string };
        name: string;
        full_name: string;
        description?: string | null;
        default_branch: string;
        private: boolean;
        archived: boolean;
        visibility?: string;
        html_url: string;
        pushed_at?: string | null;
      }>;

      repositories.push(
        ...payload.map((repository) => ({
          repoId: repository.id,
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          description: repository.description ?? null,
          defaultBranch: repository.default_branch,
          isPrivate: repository.private,
          isArchived: repository.archived,
          visibility: repository.visibility ?? (repository.private ? "private" : "public"),
          htmlUrl: repository.html_url,
          pushedAt: repository.pushed_at ?? null
        }))
      );

      if (payload.length < 100) {
        break;
      }

      page += 1;
    }

    return repositories;
  }

  async fetchRepositoryFileWithOAuth(args: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
    accessToken: string;
  }): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${args.path}?ref=${encodeURIComponent(args.ref)}`,
      {
        headers: {
          accept: "application/vnd.github.raw",
          authorization: `Bearer ${args.accessToken}`,
          "user-agent": "AutoOps"
        }
      }
    );

    if (!response.ok) {
      throw Object.assign(
        new Error(`Unable to fetch ${args.path} from ${args.owner}/${args.repo}.`),
        { status: response.status }
      );
    }

    return response.text();
  }

  async fetchRepositoryFileOptionalWithOAuth(args: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
    accessToken: string;
  }): Promise<string | null> {
    try {
      return await this.fetchRepositoryFileWithOAuth(args);
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

  async getInstallation(
    installationId: number
  ): Promise<GitHubInstallationSummary> {
    if (!this.app) {
      throw new Error("GitHub App credentials are not configured.");
    }

    const response = await this.app.octokit.request(
      "GET /app/installations/{installation_id}",
      {
        installation_id: installationId
      }
    );
    const account = response.data.account;
    const accountLogin =
      account && typeof account === "object" && "login" in account && typeof account.login === "string"
        ? account.login
        : account && typeof account === "object" && "slug" in account && typeof account.slug === "string"
          ? account.slug
          : account && typeof account === "object" && "name" in account && typeof account.name === "string"
            ? account.name
            : "unknown";
    const accountType =
      account && typeof account === "object" && "type" in account && typeof account.type === "string"
        ? account.type
        : "Organization";

    return {
      installationId: response.data.id,
      accountLogin,
      accountType
    };
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
          description: repository.description ?? null,
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

  async getBranchHeadShaWithOAuth(args: {
    owner: string;
    repo: string;
    branch: string;
    accessToken: string;
  }): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/branches/${encodeURIComponent(args.branch)}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${args.accessToken}`,
          "user-agent": "AutoOps"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Unable to resolve ${args.owner}/${args.repo}#${args.branch}.`);
    }

    const payload = (await response.json()) as {
      commit?: {
        sha?: string;
      };
    };
    const sha = payload.commit?.sha;
    if (!sha) {
      throw new Error(`GitHub did not return a commit SHA for ${args.owner}/${args.repo}#${args.branch}.`);
    }
    return sha;
  }
}
