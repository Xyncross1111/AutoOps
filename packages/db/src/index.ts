import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import type {
  ActivityEvent,
  DashboardOverview,
  DeploymentRevisionSummary,
  DeploymentTargetDetail,
  DeploymentTargetType,
  DeploymentTargetSummary,
  GitHubConnectedAccount,
  GitHubRepositoryFilters,
  GitHubRepositorySummary,
  ManagedAppPackageManager,
  ManagedNextjsConfig,
  PipelineConfig,
  PipelineRunSummary,
  ProjectDetail,
  ProjectMode,
  ProjectInstallationSummary,
  ProjectSummary,
  ProjectUpdateInput,
  QueuedRunMetadata,
  RollbackRequest,
  RunLogEntry,
  RunListFilters,
  RunSource,
  RunStatus,
  StageRun,
  StageStatus
} from "@autoops/core";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS github_installations (
  installation_id BIGINT PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  repo_count INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  installation_id BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE RESTRICT,
  mode TEXT NOT NULL DEFAULT 'custom_pipeline',
  github_repo_id BIGINT,
  default_branch TEXT NOT NULL,
  config_path TEXT NOT NULL DEFAULT '.autoops/pipeline.yml',
  app_slug TEXT,
  primary_url TEXT,
  generated_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_owner, repo_name)
);

CREATE TABLE IF NOT EXISTS project_secrets (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, name)
);

CREATE TABLE IF NOT EXISTS github_repositories (
  installation_id BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  is_private BOOLEAN NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  html_url TEXT NOT NULL,
  pushed_at TIMESTAMPTZ,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  deployability_status TEXT NOT NULL DEFAULT 'unsupported',
  deployability_reason TEXT,
  detected_framework TEXT,
  package_manager TEXT,
  linked_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (installation_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_github_repositories_owner_name
  ON github_repositories (owner, name);

CREATE TABLE IF NOT EXISTS github_oauth_connections (
  actor_email TEXT PRIMARY KEY,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  github_name TEXT,
  avatar_url TEXT,
  profile_url TEXT NOT NULL,
  scope TEXT,
  encrypted_access_token TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  run_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  delivery_id TEXT REFERENCES webhook_deliveries(delivery_id),
  source TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  triggered_by TEXT NOT NULL,
  pipeline_config JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  superseded_by_run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status_queue
  ON pipeline_runs (status, queued_at);

CREATE TABLE IF NOT EXISTS stage_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (run_id, stage_name)
);

CREATE TABLE IF NOT EXISTS run_logs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_logs_by_run
  ON run_logs (run_id, id);

CREATE TABLE IF NOT EXISTS deployment_targets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'ssh_compose',
  host_ref TEXT NOT NULL,
  compose_file TEXT NOT NULL,
  service TEXT NOT NULL,
  healthcheck_url TEXT NOT NULL,
  managed_port INTEGER,
  managed_runtime_dir TEXT,
  managed_domain TEXT,
  last_status TEXT,
  last_deployed_image TEXT,
  last_deployed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS deployment_revisions (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES deployment_targets(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES pipeline_runs(id),
  image_ref TEXT NOT NULL,
  image_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollback_of_revision_id TEXT REFERENCES deployment_revisions(id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_revisions_target
  ON deployment_revisions (target_id, deployed_at DESC);

CREATE TABLE IF NOT EXISTS rollback_events (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES deployment_targets(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES pipeline_runs(id),
  from_revision_id TEXT REFERENCES deployment_revisions(id),
  to_revision_id TEXT REFERENCES deployment_revisions(id),
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS repo_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'custom_pipeline';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_slug TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS primary_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS generated_config JSONB;

ALTER TABLE deployment_targets ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'ssh_compose';
ALTER TABLE deployment_targets ADD COLUMN IF NOT EXISTS managed_port INTEGER;
ALTER TABLE deployment_targets ADD COLUMN IF NOT EXISTS managed_runtime_dir TEXT;
ALTER TABLE deployment_targets ADD COLUMN IF NOT EXISTS managed_domain TEXT;
`;

type JsonRecord = Record<string, unknown>;

interface ProjectRow {
  id: string;
  name: string;
  repo_owner: string;
  repo_name: string;
  installation_id: number;
  mode: ProjectMode;
  github_repo_id: string | number | null;
  default_branch: string;
  config_path: string;
  app_slug: string | null;
  primary_url: string | null;
  generated_config: ManagedNextjsConfig | null;
  created_at: string;
  updated_at: string;
  target_count?: number;
  latest_run_status?: RunStatus | null;
}

interface RunRow {
  id: string;
  project_id: string;
  project_name: string;
  source: RunSource;
  branch: string;
  commit_sha: string;
  status: RunStatus;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  triggered_by: string;
  error_message: string | null;
  pipeline_config: PipelineConfig | null;
  metadata: QueuedRunMetadata | null;
}

interface DeploymentTargetRow {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  target_type: DeploymentTargetType;
  host_ref: string;
  compose_file: string;
  service: string;
  healthcheck_url: string;
  managed_port: number | null;
  managed_runtime_dir: string | null;
  managed_domain: string | null;
  last_status: string | null;
  last_deployed_image: string | null;
  last_deployed_at: string | null;
  last_error: string | null;
}

interface DeploymentRevisionRow {
  id: string;
  target_id: string;
  target_name: string;
  project_id: string;
  project_name: string;
  run_id: string | null;
  image_ref: string;
  image_digest: string;
  status: string;
  deployed_at: string;
  rollback_of_revision_id: string | null;
}

interface InstallationRow {
  installation_id: number;
  account_login: string;
  account_type: string;
  repo_count: number;
  sync_status: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  updated_at: string;
}

interface GitHubRepositoryRow {
  installation_id: number;
  github_repo_id: string | number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  is_archived: boolean;
  html_url: string;
  pushed_at: string | null;
  analysis_status: "pending" | "analyzed" | "failed";
  deployability_status: "deployable" | "unsupported" | "imported" | "archived";
  deployability_reason: string | null;
  detected_framework: string | null;
  package_manager: ManagedAppPackageManager | null;
  linked_project_id: string | null;
  analyzed_at: string | null;
  synced_at: string;
}

interface GitHubOAuthConnectionRow {
  actor_email: string;
  github_user_id: string | number;
  github_login: string;
  github_name: string | null;
  avatar_url: string | null;
  profile_url: string;
  scope: string | null;
  encrypted_access_token: string;
  connected_at: string;
  updated_at: string;
}

interface AuditLogRow {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: JsonRecord;
  created_at: string;
}

interface WebhookActivityRow {
  delivery_id: string;
  event_name: string;
  status: string;
  run_id: string | null;
  error_message: string | null;
  created_at: string;
  repo_owner: string | null;
  repo_name: string | null;
  project_id: string | null;
}

export interface GitHubOAuthConnectionRecord extends GitHubConnectedAccount {
  actorEmail: string;
  encryptedAccessToken: string;
}

export interface CreateProjectInput {
  name: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  mode?: ProjectMode;
  githubRepoId?: number | null;
  defaultBranch: string;
  configPath?: string;
  appSlug?: string | null;
  primaryUrl?: string | null;
  managedConfig?: ManagedNextjsConfig | null;
  secrets?: Record<string, string>;
}

export interface CreateRunInput {
  projectId: string;
  deliveryId?: string;
  source: RunSource;
  branch: string;
  commitSha: string;
  triggeredBy: string;
  status?: RunStatus;
  pipelineConfig?: PipelineConfig | null;
  metadata?: QueuedRunMetadata;
}

export interface ClaimedRun {
  id: string;
  projectId: string;
  projectName: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  mode: ProjectMode;
  githubRepoId: number | null;
  defaultBranch: string;
  configPath: string;
  appSlug: string | null;
  primaryUrl: string | null;
  managedConfig: ManagedNextjsConfig | null;
  branch: string;
  commitSha: string;
  source: RunSource;
  triggeredBy: string;
  pipelineConfig: PipelineConfig | null;
  metadata: QueuedRunMetadata;
}

export class AutoOpsDb {
  constructor(public readonly pool: Pool) {}

  static fromConnectionString(connectionString: string): AutoOpsDb {
    return new AutoOpsDb(new Pool({ connectionString }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("SELECT pg_advisory_lock($1, $2)", [57421, 1]);
      await client.query(SCHEMA_SQL);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [57421, 1]);
      } finally {
        client.release();
      }
    }
  }

  async healthcheck(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const result = await this.pool.query<ProjectRow>(`
      SELECT
        p.*,
        COALESCE(target_counts.target_count, 0) AS target_count,
        latest_runs.status AS latest_run_status
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*)::int AS target_count
        FROM deployment_targets
        GROUP BY project_id
      ) target_counts ON target_counts.project_id = p.id
      LEFT JOIN LATERAL (
        SELECT status
        FROM pipeline_runs
        WHERE project_id = p.id
        ORDER BY queued_at DESC
        LIMIT 1
      ) latest_runs ON TRUE
      ORDER BY p.created_at DESC
    `);
    return result.rows.map(mapProjectSummary);
  }

  async getProject(projectId: string): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `
        SELECT
          p.*,
          COALESCE(target_counts.target_count, 0) AS target_count,
          latest_runs.status AS latest_run_status
        FROM projects p
        LEFT JOIN (
          SELECT project_id, COUNT(*)::int AS target_count
          FROM deployment_targets
          GROUP BY project_id
        ) target_counts ON target_counts.project_id = p.id
        LEFT JOIN LATERAL (
          SELECT status
          FROM pipeline_runs
          WHERE project_id = p.id
          ORDER BY queued_at DESC
          LIMIT 1
        ) latest_runs ON TRUE
        WHERE p.id = $1
      `,
      [projectId]
    );
    return result.rows[0] ? mapProjectSummary(result.rows[0]) : null;
  }

  async getProjectByRepo(owner: string, repo: string): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `
        SELECT
          p.*,
          COALESCE(target_counts.target_count, 0) AS target_count,
          latest_runs.status AS latest_run_status
        FROM projects p
        LEFT JOIN (
          SELECT project_id, COUNT(*)::int AS target_count
          FROM deployment_targets
          GROUP BY project_id
        ) target_counts ON target_counts.project_id = p.id
        LEFT JOIN LATERAL (
          SELECT status
          FROM pipeline_runs
          WHERE project_id = p.id
          ORDER BY queued_at DESC
          LIMIT 1
        ) latest_runs ON TRUE
        WHERE p.repo_owner = $1 AND p.repo_name = $2
      `,
      [owner, repo]
    );
    return result.rows[0] ? mapProjectSummary(result.rows[0]) : null;
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const [recentRuns, deploymentTargets, installation, repository, secrets] = await Promise.all([
      this.listRuns({ projectId, limit: 10 }),
      this.listDeploymentTargets(projectId),
      this.getGitHubInstallation(project.installationId),
      project.githubRepoId !== null
        ? this.getGitHubRepository(project.installationId, project.githubRepoId)
        : Promise.resolve(null),
      this.listProjectSecrets(projectId)
    ]);

    return {
      project,
      recentRuns,
      deploymentTargets,
      installation,
      repository,
      secretNames: Object.keys(secrets).sort()
    };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const id = randomUUID();
    await this.pool.query(
      `
        INSERT INTO projects (
          id,
          name,
          repo_owner,
          repo_name,
          installation_id,
          mode,
          github_repo_id,
          default_branch,
          config_path,
          app_slug,
          primary_url,
          generated_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      `,
      [
        id,
        input.name,
        input.repoOwner,
        input.repoName,
        input.installationId,
        input.mode ?? "custom_pipeline",
        input.githubRepoId ?? null,
        input.defaultBranch,
        input.configPath ?? ".autoops/pipeline.yml",
        input.appSlug ?? null,
        input.primaryUrl ?? null,
        input.managedConfig ? JSON.stringify(input.managedConfig) : null
      ]
    );
    if (input.secrets) {
      for (const [name, encryptedValue] of Object.entries(input.secrets)) {
        await this.upsertProjectSecret(id, name, encryptedValue);
      }
    }
    await this.writeAuditLog("system", "project.created", "project", id, {
      repoOwner: input.repoOwner,
      repoName: input.repoName
    });
    const created = await this.getProject(id);
    if (!created) {
      throw new Error("Failed to load created project.");
    }
    return created;
  }

  async updateProject(
    projectId: string,
    input: ProjectUpdateInput
  ): Promise<ProjectSummary | null> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      values.push(input.name);
      updates.push(`name = $${values.length}`);
    }
    if (input.defaultBranch !== undefined) {
      values.push(input.defaultBranch);
      updates.push(`default_branch = $${values.length}`);
    }
    if (input.configPath !== undefined) {
      values.push(input.configPath);
      updates.push(`config_path = $${values.length}`);
    }

    if (updates.length > 0) {
      values.push(projectId);
      await this.pool.query(
        `
          UPDATE projects
          SET ${updates.join(", ")},
              updated_at = NOW()
          WHERE id = $${values.length}
        `,
        values
      );
    }

    const secretEntries = Object.entries(input.secrets ?? {});
    if (secretEntries.length > 0) {
      for (const [name, encryptedValue] of secretEntries) {
        await this.upsertProjectSecret(projectId, name, encryptedValue);
      }
      await this.pool.query(
        `
          UPDATE projects
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [projectId]
      );
    }

    return this.getProject(projectId);
  }

  async upsertProjectSecret(
    projectId: string,
    name: string,
    encryptedValue: string
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO project_secrets (project_id, name, encrypted_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, name)
        DO UPDATE SET
          encrypted_value = EXCLUDED.encrypted_value,
          updated_at = NOW()
      `,
      [projectId, name, encryptedValue]
    );
  }

  async listProjectSecrets(projectId: string): Promise<Record<string, string>> {
    const result = await this.pool.query<{
      name: string;
      encrypted_value: string;
    }>(
      `
        SELECT name, encrypted_value
        FROM project_secrets
        WHERE project_id = $1
      `,
      [projectId]
    );
    return Object.fromEntries(result.rows.map((row) => [row.name, row.encrypted_value]));
  }

  async upsertGitHubInstallation(input: {
    installationId: number;
    accountLogin: string;
    accountType: string;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO github_installations (
          installation_id, account_login, account_type
        ) VALUES ($1, $2, $3)
        ON CONFLICT (installation_id)
        DO UPDATE SET
          account_login = EXCLUDED.account_login,
          account_type = EXCLUDED.account_type,
          updated_at = NOW()
      `,
      [input.installationId, input.accountLogin, input.accountType]
    );
  }

  async listGitHubInstallations(): Promise<
    ProjectInstallationSummary[]
  > {
    const result = await this.pool.query<InstallationRow>(
      `
        SELECT
          installation_id,
          account_login,
          account_type,
          repo_count,
          sync_status,
          last_sync_at,
          last_sync_error,
          updated_at
        FROM github_installations
        WHERE account_type <> 'OAuth'
        ORDER BY updated_at DESC
      `
    );
    return result.rows.map(mapInstallationSummary);
  }

  async getGitHubInstallation(
    installationId: number
  ): Promise<ProjectInstallationSummary | null> {
    const result = await this.pool.query<InstallationRow>(
      `
        SELECT
          installation_id,
          account_login,
          account_type,
          repo_count,
          sync_status,
          last_sync_at,
          last_sync_error,
          updated_at
        FROM github_installations
        WHERE installation_id = $1
      `,
      [installationId]
    );
    return result.rows[0] ? mapInstallationSummary(result.rows[0]) : null;
  }

  async upsertGitHubOAuthConnection(input: {
    actorEmail: string;
    githubUserId: number;
    login: string;
    name: string | null;
    avatarUrl: string | null;
    profileUrl: string;
    scope: string | null;
    encryptedAccessToken: string;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO github_oauth_connections (
          actor_email,
          github_user_id,
          github_login,
          github_name,
          avatar_url,
          profile_url,
          scope,
          encrypted_access_token,
          connected_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
        ON CONFLICT (actor_email)
        DO UPDATE SET
          github_user_id = EXCLUDED.github_user_id,
          github_login = EXCLUDED.github_login,
          github_name = EXCLUDED.github_name,
          avatar_url = EXCLUDED.avatar_url,
          profile_url = EXCLUDED.profile_url,
          scope = EXCLUDED.scope,
          encrypted_access_token = EXCLUDED.encrypted_access_token,
          updated_at = NOW()
      `,
      [
        input.actorEmail,
        input.githubUserId,
        input.login,
        input.name,
        input.avatarUrl,
        input.profileUrl,
        input.scope,
        input.encryptedAccessToken
      ]
    );
  }

  async getGitHubOAuthConnection(
    actorEmail: string
  ): Promise<GitHubOAuthConnectionRecord | null> {
    const result = await this.pool.query<GitHubOAuthConnectionRow>(
      `
        SELECT
          actor_email,
          github_user_id,
          github_login,
          github_name,
          avatar_url,
          profile_url,
          scope,
          encrypted_access_token,
          connected_at,
          updated_at
        FROM github_oauth_connections
        WHERE actor_email = $1
      `,
      [actorEmail]
    );

    return result.rows[0] ? mapGitHubOAuthConnectionRecord(result.rows[0]) : null;
  }

  async deleteGitHubOAuthConnection(actorEmail: string): Promise<void> {
    await this.pool.query(
      `
        DELETE FROM github_oauth_connections
        WHERE actor_email = $1
      `,
      [actorEmail]
    );
  }

  async setGitHubInstallationSyncState(input: {
    installationId: number;
    syncStatus: string;
    repoCount?: number;
    lastSyncError?: string | null;
    touchLastSync?: boolean;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE github_installations
        SET sync_status = $2,
            repo_count = COALESCE($3, repo_count),
            last_sync_error = $4,
            last_sync_at = CASE WHEN $5 THEN NOW() ELSE last_sync_at END,
            updated_at = NOW()
        WHERE installation_id = $1
      `,
      [
        input.installationId,
        input.syncStatus,
        input.repoCount ?? null,
        input.lastSyncError ?? null,
        input.touchLastSync ?? false
      ]
    );
  }

  async upsertGitHubRepositories(
    installationId: number,
    repositories: Array<{
      repoId: number;
      owner: string;
      name: string;
      fullName: string;
      defaultBranch: string;
      isPrivate: boolean;
      isArchived: boolean;
      htmlUrl: string;
      pushedAt: string | null;
      analysisStatus: "pending" | "analyzed" | "failed";
      deployabilityStatus: "deployable" | "unsupported" | "imported" | "archived";
      deployabilityReason: string | null;
      detectedFramework: string | null;
      packageManager: ManagedAppPackageManager | null;
      analyzedAt: string | null;
    }>
  ): Promise<void> {
    for (const repository of repositories) {
      await this.pool.query(
        `
          INSERT INTO github_repositories (
            installation_id,
            github_repo_id,
            owner,
            name,
            full_name,
            default_branch,
            is_private,
            is_archived,
            html_url,
            pushed_at,
            analysis_status,
            deployability_status,
            deployability_reason,
            detected_framework,
            package_manager,
            analyzed_at,
            synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, NOW()
          )
          ON CONFLICT (installation_id, github_repo_id)
          DO UPDATE SET
            owner = EXCLUDED.owner,
            name = EXCLUDED.name,
            full_name = EXCLUDED.full_name,
            default_branch = EXCLUDED.default_branch,
            is_private = EXCLUDED.is_private,
            is_archived = EXCLUDED.is_archived,
            html_url = EXCLUDED.html_url,
            pushed_at = EXCLUDED.pushed_at,
            analysis_status = EXCLUDED.analysis_status,
            deployability_status = EXCLUDED.deployability_status,
            deployability_reason = EXCLUDED.deployability_reason,
            detected_framework = EXCLUDED.detected_framework,
            package_manager = EXCLUDED.package_manager,
            analyzed_at = EXCLUDED.analyzed_at,
            synced_at = NOW(),
            updated_at = NOW()
        `,
        [
          installationId,
          repository.repoId,
          repository.owner,
          repository.name,
          repository.fullName,
          repository.defaultBranch,
          repository.isPrivate,
          repository.isArchived,
          repository.htmlUrl,
          repository.pushedAt,
          repository.analysisStatus,
          repository.deployabilityStatus,
          repository.deployabilityReason,
          repository.detectedFramework,
          repository.packageManager,
          repository.analyzedAt
        ]
      );
    }
  }

  async listGitHubRepositories(
    filters: GitHubRepositoryFilters = {}
  ): Promise<GitHubRepositorySummary[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];

    if (filters.installationId) {
      values.push(filters.installationId);
      clauses.push(`installation_id = $${values.length}`);
    }
    if (filters.search) {
      values.push(`%${filters.search.toLowerCase()}%`);
      clauses.push(
        `(LOWER(owner) LIKE $${values.length} OR LOWER(name) LIKE $${values.length} OR LOWER(full_name) LIKE $${values.length})`
      );
    }
    if (filters.deployable === true) {
      clauses.push(`deployability_status = 'deployable'`);
    }
    if (filters.imported === true) {
      clauses.push(`linked_project_id IS NOT NULL`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query<GitHubRepositoryRow>(
      `
        SELECT
          installation_id,
          github_repo_id,
          owner,
          name,
          full_name,
          default_branch,
          is_private,
          is_archived,
          html_url,
          pushed_at,
          analysis_status,
          deployability_status,
          deployability_reason,
          detected_framework,
          package_manager,
          linked_project_id,
          analyzed_at,
          synced_at
        FROM github_repositories
        ${where}
        ORDER BY synced_at DESC, full_name ASC
      `,
      values
    );

    return result.rows.map(mapGitHubRepositorySummary);
  }

  async getGitHubRepository(
    installationId: number,
    repoId: number
  ): Promise<GitHubRepositorySummary | null> {
    const result = await this.pool.query<GitHubRepositoryRow>(
      `
        SELECT
          installation_id,
          github_repo_id,
          owner,
          name,
          full_name,
          default_branch,
          is_private,
          is_archived,
          html_url,
          pushed_at,
          analysis_status,
          deployability_status,
          deployability_reason,
          detected_framework,
          package_manager,
          linked_project_id,
          analyzed_at,
          synced_at
        FROM github_repositories
        WHERE installation_id = $1 AND github_repo_id = $2
      `,
      [installationId, repoId]
    );

    return result.rows[0] ? mapGitHubRepositorySummary(result.rows[0]) : null;
  }

  async getGitHubRepositoryByProject(projectId: string): Promise<GitHubRepositorySummary | null> {
    const result = await this.pool.query<GitHubRepositoryRow>(
      `
        SELECT
          installation_id,
          github_repo_id,
          owner,
          name,
          full_name,
          default_branch,
          is_private,
          is_archived,
          html_url,
          pushed_at,
          analysis_status,
          deployability_status,
          deployability_reason,
          detected_framework,
          package_manager,
          linked_project_id,
          analyzed_at,
          synced_at
        FROM github_repositories
        WHERE linked_project_id = $1
        LIMIT 1
      `,
      [projectId]
    );

    return result.rows[0] ? mapGitHubRepositorySummary(result.rows[0]) : null;
  }

  async linkGitHubRepositoryToProject(
    installationId: number,
    repoId: number,
    projectId: string
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE github_repositories
        SET linked_project_id = $3,
            deployability_status = 'imported',
            updated_at = NOW()
        WHERE installation_id = $1 AND github_repo_id = $2
      `,
      [installationId, repoId, projectId]
    );
  }

  async hasWebhookDelivery(deliveryId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM webhook_deliveries
          WHERE delivery_id = $1
        ) AS exists
      `,
      [deliveryId]
    );
    return Boolean(result.rows[0]?.exists);
  }

  async recordWebhookDelivery(input: {
    deliveryId: string;
    eventName: string;
    payload: JsonRecord;
    status: string;
    runId?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO webhook_deliveries (
          delivery_id, event_name, payload, status, run_id, error_message, processed_at
        ) VALUES (
          $1, $2, $3::jsonb, $4, $5, $6,
          CASE WHEN $4 IN ('processed', 'ignored', 'failed', 'duplicate') THEN NOW() ELSE NULL END
        )
        ON CONFLICT (delivery_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          run_id = EXCLUDED.run_id,
          error_message = EXCLUDED.error_message,
          processed_at = EXCLUDED.processed_at
      `,
      [
        input.deliveryId,
        input.eventName,
        JSON.stringify(input.payload),
        input.status,
        input.runId ?? null,
        input.errorMessage ?? null
      ]
    );
  }

  async createRun(input: CreateRunInput): Promise<PipelineRunSummary> {
    const id = randomUUID();
    const status = input.status ?? "queued";
    await this.pool.query(
      `
        INSERT INTO pipeline_runs (
          id,
          project_id,
          delivery_id,
          source,
          branch,
          commit_sha,
          status,
          triggered_by,
          pipeline_config,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      `,
      [
        id,
        input.projectId,
        input.deliveryId ?? null,
        input.source,
        input.branch,
        input.commitSha,
        status,
        input.triggeredBy,
        input.pipelineConfig ? JSON.stringify(input.pipelineConfig) : null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
    const created = await this.getRun(id);
    if (!created) {
      throw new Error("Failed to load created run.");
    }
    return created.summary;
  }

  async supersedeQueuedRuns(
    projectId: string,
    branch: string,
    replacementRunId: string
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE pipeline_runs
        SET status = 'superseded',
            superseded_by_run_id = $3,
            finished_at = NOW(),
            error_message = 'Superseded by a newer queued run on the same branch.'
        WHERE project_id = $1
          AND branch = $2
          AND status = 'queued'
          AND id <> $3
      `,
      [projectId, branch, replacementRunId]
    );
  }

  async listRuns(filters: RunListFilters = {}): Promise<PipelineRunSummary[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const {
      projectId,
      status,
      source,
      search,
      limit = 100
    } = filters;

    if (projectId) {
      values.push(projectId);
      clauses.push(`r.project_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      clauses.push(`r.status = $${values.length}`);
    }
    if (source) {
      values.push(source);
      clauses.push(`r.source = $${values.length}`);
    }
    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      clauses.push(`
        (
          LOWER(p.name) LIKE $${values.length}
          OR LOWER(r.branch) LIKE $${values.length}
          OR LOWER(r.commit_sha) LIKE $${values.length}
          OR LOWER(r.triggered_by) LIKE $${values.length}
        )
      `);
    }

    values.push(limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await this.pool.query<RunRow>(
      `
        SELECT
          r.id,
          r.project_id,
          p.name AS project_name,
          r.source,
          r.branch,
          r.commit_sha,
          r.status,
          r.queued_at,
          r.started_at,
          r.finished_at,
          r.triggered_by,
          r.error_message,
          r.pipeline_config,
          r.metadata
        FROM pipeline_runs r
        INNER JOIN projects p ON p.id = r.project_id
        ${where}
        ORDER BY r.queued_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(mapRunSummary);
  }

  async getRun(runId: string): Promise<{
    summary: PipelineRunSummary;
    pipelineConfig: PipelineConfig | null;
    metadata: QueuedRunMetadata;
  } | null> {
    const result = await this.pool.query<RunRow>(
      `
        SELECT
          r.id,
          r.project_id,
          p.name AS project_name,
          r.source,
          r.branch,
          r.commit_sha,
          r.status,
          r.queued_at,
          r.started_at,
          r.finished_at,
          r.triggered_by,
          r.error_message,
          r.pipeline_config,
          r.metadata
        FROM pipeline_runs r
        INNER JOIN projects p ON p.id = r.project_id
        WHERE r.id = $1
      `,
      [runId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      summary: mapRunSummary(row),
      pipelineConfig: row.pipeline_config,
      metadata: row.metadata ?? {}
    };
  }

  async listRunsByIds(runIds: string[]): Promise<PipelineRunSummary[]> {
    if (runIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<RunRow>(
      `
        SELECT
          r.id,
          r.project_id,
          p.name AS project_name,
          r.source,
          r.branch,
          r.commit_sha,
          r.status,
          r.queued_at,
          r.started_at,
          r.finished_at,
          r.triggered_by,
          r.error_message,
          r.pipeline_config,
          r.metadata
        FROM pipeline_runs r
        INNER JOIN projects p ON p.id = r.project_id
        WHERE r.id = ANY($1::text[])
        ORDER BY r.queued_at DESC
      `,
      [runIds]
    );

    return result.rows.map(mapRunSummary);
  }

  async getRunDetail(runId: string): Promise<{
    run: PipelineRunSummary;
    stages: StageRun[];
  } | null> {
    const run = await this.getRun(runId);
    if (!run) {
      return null;
    }
    const stagesResult = await this.pool.query<{
      id: string;
      run_id: string;
      stage_name: string;
      stage_order: number;
      status: StageStatus;
      started_at: string | null;
      finished_at: string | null;
      metadata: JsonRecord;
    }>(
      `
        SELECT *
        FROM stage_runs
        WHERE run_id = $1
        ORDER BY stage_order ASC
      `,
      [runId]
    );
    return {
      run: run.summary,
      stages: stagesResult.rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        stageName: row.stage_name,
        stageOrder: row.stage_order,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        metadata: row.metadata ?? {}
      }))
    };
  }

  async listRunLogs(runId: string, afterId = 0): Promise<RunLogEntry[]> {
    const result = await this.pool.query<{
      id: number;
      run_id: string;
      stage_name: string;
      message: string;
      created_at: string;
    }>(
      `
        SELECT id, run_id, stage_name, message, created_at
        FROM run_logs
        WHERE run_id = $1 AND id > $2
        ORDER BY id ASC
      `,
      [runId, afterId]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      runId: row.run_id,
      stageName: row.stage_name,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  async appendRunLog(runId: string, stageName: string, message: string): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO run_logs (run_id, stage_name, message)
        VALUES ($1, $2, $3)
      `,
      [runId, stageName, message]
    );
  }

  async upsertStageRun(input: {
    runId: string;
    stageName: string;
    stageOrder: number;
    status: StageStatus;
    metadata?: JsonRecord;
    setStarted?: boolean;
    setFinished?: boolean;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO stage_runs (
          id,
          run_id,
          stage_name,
          stage_order,
          status,
          started_at,
          finished_at,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          CASE WHEN $6 THEN NOW() ELSE NULL END,
          CASE WHEN $7 THEN NOW() ELSE NULL END,
          $8::jsonb
        )
        ON CONFLICT (run_id, stage_name)
        DO UPDATE SET
          status = EXCLUDED.status,
          stage_order = EXCLUDED.stage_order,
          started_at = CASE
            WHEN $6 AND stage_runs.started_at IS NULL THEN NOW()
            ELSE stage_runs.started_at
          END,
          finished_at = CASE
            WHEN $7 THEN NOW()
            ELSE stage_runs.finished_at
          END,
          metadata = EXCLUDED.metadata
      `,
      [
        randomUUID(),
        input.runId,
        input.stageName,
        input.stageOrder,
        input.status,
        input.setStarted ?? false,
        input.setFinished ?? false,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  async setRunStatus(runId: string, status: RunStatus, errorMessage?: string | null): Promise<void> {
    const finishedStatuses: RunStatus[] = ["succeeded", "failed", "cancelled", "superseded"];
    await this.pool.query(
      `
        UPDATE pipeline_runs
        SET status = $2,
            error_message = $3,
            finished_at = CASE
              WHEN $2 = ANY($4::text[]) THEN NOW()
              ELSE finished_at
            END
        WHERE id = $1
      `,
      [runId, status, errorMessage ?? null, finishedStatuses]
    );
  }

  async claimNextQueuedRun(): Promise<ClaimedRun | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ id: string }>(
        `
          SELECT id
          FROM pipeline_runs
          WHERE status = 'queued'
          ORDER BY queued_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `
      );
      const nextId = selected.rows[0]?.id;
      if (!nextId) {
        await client.query("COMMIT");
        return null;
      }
      const updated = await client.query<{
        id: string;
        project_id: string;
        source: RunSource;
        branch: string;
        commit_sha: string;
        triggered_by: string;
        pipeline_config: PipelineConfig | null;
        metadata: QueuedRunMetadata;
        project_name: string;
        repo_owner: string;
        repo_name: string;
        installation_id: number;
        mode: ProjectMode;
        github_repo_id: string | number | null;
        default_branch: string;
        config_path: string;
        app_slug: string | null;
        primary_url: string | null;
        generated_config: ManagedNextjsConfig | null;
      }>(
        `
          UPDATE pipeline_runs r
          SET status = 'running',
              started_at = NOW()
          FROM projects p
          WHERE r.id = $1
            AND p.id = r.project_id
          RETURNING
            r.id,
            r.project_id,
            r.source,
            r.branch,
            r.commit_sha,
            r.triggered_by,
            r.pipeline_config,
            r.metadata,
            p.name AS project_name,
            p.repo_owner,
            p.repo_name,
            p.installation_id,
            p.mode,
            p.github_repo_id,
            p.default_branch,
            p.config_path,
            p.app_slug,
            p.primary_url,
            p.generated_config
        `,
        [nextId]
      );
      await client.query("COMMIT");
      const row = updated.rows[0];
      return row
        ? {
            id: row.id,
            projectId: row.project_id,
            projectName: row.project_name,
            repoOwner: row.repo_owner,
            repoName: row.repo_name,
            installationId: Number(row.installation_id),
            mode: row.mode,
            githubRepoId: row.github_repo_id === null ? null : Number(row.github_repo_id),
            defaultBranch: row.default_branch,
            configPath: row.config_path,
            appSlug: row.app_slug,
            primaryUrl: row.primary_url,
            managedConfig: row.generated_config,
            branch: row.branch,
            commitSha: row.commit_sha,
            source: row.source,
            triggeredBy: row.triggered_by,
            pipelineConfig: row.pipeline_config,
            metadata: row.metadata ?? {}
          }
        : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async syncDeploymentTargets(
    projectId: string,
    targets: Array<{
      name: string;
      targetType?: DeploymentTargetType;
      hostRef: string;
      composeFile: string;
      service: string;
      healthcheckUrl: string;
      managedPort?: number | null;
      managedRuntimeDir?: string | null;
      managedDomain?: string | null;
    }>
  ): Promise<DeploymentTargetSummary[]> {
    for (const target of targets) {
      await this.pool.query(
        `
          INSERT INTO deployment_targets (
            id,
            project_id,
            name,
            target_type,
            host_ref,
            compose_file,
            service,
            healthcheck_url,
            managed_port,
            managed_runtime_dir,
            managed_domain
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (project_id, name)
          DO UPDATE SET
            target_type = EXCLUDED.target_type,
            host_ref = EXCLUDED.host_ref,
            compose_file = EXCLUDED.compose_file,
            service = EXCLUDED.service,
            healthcheck_url = EXCLUDED.healthcheck_url,
            managed_port = EXCLUDED.managed_port,
            managed_runtime_dir = EXCLUDED.managed_runtime_dir,
            managed_domain = EXCLUDED.managed_domain,
            updated_at = NOW()
        `,
        [
          randomUUID(),
          projectId,
          target.name,
          target.targetType ?? "ssh_compose",
          target.hostRef,
          target.composeFile,
          target.service,
          target.healthcheckUrl,
          target.managedPort ?? null,
          target.managedRuntimeDir ?? null,
          target.managedDomain ?? null
        ]
      );
    }
    return this.listDeploymentTargets(projectId);
  }

  async listDeploymentTargets(projectId?: string): Promise<DeploymentTargetSummary[]> {
    const values: unknown[] = [];
    const where = projectId ? "WHERE t.project_id = $1" : "";
    if (projectId) {
      values.push(projectId);
    }
    const result = await this.pool.query<DeploymentTargetRow>(
      `
        SELECT
          t.id,
          t.project_id,
          p.name AS project_name,
          t.name,
          t.target_type,
          t.host_ref,
          t.compose_file,
          t.service,
          t.healthcheck_url,
          t.managed_port,
          t.managed_runtime_dir,
          t.managed_domain,
          t.last_status,
          t.last_deployed_image,
          t.last_deployed_at,
          t.last_error
        FROM deployment_targets t
        INNER JOIN projects p ON p.id = t.project_id
        ${where}
        ORDER BY p.name ASC, t.name ASC
      `,
      values
    );
    return result.rows.map(mapDeploymentTargetSummary);
  }

  async getDeploymentTargetById(targetId: string): Promise<DeploymentTargetSummary | null> {
    const result = await this.pool.query<DeploymentTargetRow>(
      `
        SELECT
          t.id,
          t.project_id,
          p.name AS project_name,
          t.name,
          t.target_type,
          t.host_ref,
          t.compose_file,
          t.service,
          t.healthcheck_url,
          t.managed_port,
          t.managed_runtime_dir,
          t.managed_domain,
          t.last_status,
          t.last_deployed_image,
          t.last_deployed_at,
          t.last_error
        FROM deployment_targets t
        INNER JOIN projects p ON p.id = t.project_id
        WHERE t.id = $1
      `,
      [targetId]
    );
    return result.rows[0] ? mapDeploymentTargetSummary(result.rows[0]) : null;
  }

  async reserveNextManagedPort(startPort = 6100): Promise<number> {
    const result = await this.pool.query<{ next_port: number | string }>(
      `
        SELECT GREATEST(COALESCE(MAX(managed_port), 0) + 1, $1) AS next_port
        FROM deployment_targets
        WHERE target_type = 'managed_vps'
      `,
      [startPort]
    );

    return Number(result.rows[0]?.next_port ?? startPort);
  }

  async markDeploymentTargetStatus(input: {
    targetId: string;
    lastStatus: string;
    lastDeployedImage?: string | null;
    lastError?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE deployment_targets
        SET last_status = $2,
            last_deployed_image = COALESCE($3, last_deployed_image),
            last_deployed_at = CASE WHEN $2 = 'succeeded' THEN NOW() ELSE last_deployed_at END,
            last_error = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        input.targetId,
        input.lastStatus,
        input.lastDeployedImage ?? null,
        input.lastError ?? null
      ]
    );
  }

  async createDeploymentRevision(input: {
    targetId: string;
    runId?: string | null;
    imageRef: string;
    imageDigest: string;
    status: string;
    rollbackOfRevisionId?: string | null;
  }): Promise<DeploymentRevisionSummary> {
    const id = randomUUID();
    await this.pool.query(
      `
        INSERT INTO deployment_revisions (
          id, target_id, run_id, image_ref, image_digest, status, rollback_of_revision_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        input.targetId,
        input.runId ?? null,
        input.imageRef,
        input.imageDigest,
        input.status,
        input.rollbackOfRevisionId ?? null
      ]
    );
    const revision = await this.getRevision(id);
    if (!revision) {
      throw new Error("Failed to load deployment revision.");
    }
    return revision;
  }

  async getRevision(revisionId: string): Promise<DeploymentRevisionSummary | null> {
    const result = await this.pool.query<DeploymentRevisionRow>(
      `
        SELECT
          r.id,
          r.target_id,
          t.name AS target_name,
          t.project_id,
          p.name AS project_name,
          r.run_id,
          r.image_ref,
          r.image_digest,
          r.status,
          r.deployed_at,
          r.rollback_of_revision_id
        FROM deployment_revisions r
        INNER JOIN deployment_targets t ON t.id = r.target_id
        INNER JOIN projects p ON p.id = t.project_id
        WHERE r.id = $1
      `,
      [revisionId]
    );
    return result.rows[0] ? mapDeploymentRevisionSummary(result.rows[0]) : null;
  }

  async listDeploymentRevisions(limit = 100): Promise<DeploymentRevisionSummary[]> {
    const result = await this.pool.query<DeploymentRevisionRow>(
      `
        SELECT
          r.id,
          r.target_id,
          t.name AS target_name,
          t.project_id,
          p.name AS project_name,
          r.run_id,
          r.image_ref,
          r.image_digest,
          r.status,
          r.deployed_at,
          r.rollback_of_revision_id
        FROM deployment_revisions r
        INNER JOIN deployment_targets t ON t.id = r.target_id
        INNER JOIN projects p ON p.id = t.project_id
        ORDER BY r.deployed_at DESC
        LIMIT $1
      `,
      [limit]
    );
    return result.rows.map(mapDeploymentRevisionSummary);
  }

  async listTargetRevisions(targetId: string): Promise<DeploymentRevisionSummary[]> {
    const result = await this.pool.query<DeploymentRevisionRow>(
      `
        SELECT
          r.id,
          r.target_id,
          t.name AS target_name,
          t.project_id,
          p.name AS project_name,
          r.run_id,
          r.image_ref,
          r.image_digest,
          r.status,
          r.deployed_at,
          r.rollback_of_revision_id
        FROM deployment_revisions r
        INNER JOIN deployment_targets t ON t.id = r.target_id
        INNER JOIN projects p ON p.id = t.project_id
        WHERE r.target_id = $1
        ORDER BY r.deployed_at DESC
      `,
      [targetId]
    );
    return result.rows.map(mapDeploymentRevisionSummary);
  }

  async getDeploymentTargetDetail(
    targetId: string
  ): Promise<DeploymentTargetDetail | null> {
    const target = await this.getDeploymentTargetById(targetId);
    if (!target) {
      return null;
    }

    const revisions = await this.listTargetRevisions(targetId);
    const linkedRunIds = [...new Set(revisions.flatMap((revision) => (
      revision.runId ? [revision.runId] : []
    )))];

    return {
      target,
      revisions,
      linkedRuns: await this.listRunsByIds(linkedRunIds)
    };
  }

  async listActivityEvents(input: {
    limit?: number;
    kind?: "audit" | "webhook";
    status?: string;
  } = {}): Promise<ActivityEvent[]> {
    const limit = input.limit ?? 50;
    const [auditRows, webhookRows] = await Promise.all([
      input.kind === "webhook"
        ? Promise.resolve<AuditLogRow[]>([])
        : this.pool.query<AuditLogRow>(
            `
              SELECT id, actor, action, entity_type, entity_id, metadata, created_at
              FROM audit_logs
              ORDER BY created_at DESC
              LIMIT $1
            `,
            [limit]
          ).then((result) => result.rows),
      input.kind === "audit"
        ? Promise.resolve<WebhookActivityRow[]>([])
        : this.pool.query<WebhookActivityRow>(
            `
              SELECT
                w.delivery_id,
                w.event_name,
                w.status,
                w.run_id,
                w.error_message,
                w.created_at,
                w.payload -> 'repository' -> 'owner' ->> 'login' AS repo_owner,
                w.payload -> 'repository' ->> 'name' AS repo_name,
                p.id AS project_id
              FROM webhook_deliveries w
              LEFT JOIN projects p
                ON p.repo_owner = w.payload -> 'repository' -> 'owner' ->> 'login'
               AND p.repo_name = w.payload -> 'repository' ->> 'name'
              ORDER BY w.created_at DESC
              LIMIT $1
            `,
            [limit]
          ).then((result) => result.rows)
    ]);

    const events = [
      ...auditRows.map(mapAuditActivityEvent),
      ...webhookRows.map(mapWebhookActivityEvent)
    ]
      .filter((event) => !input.status || event.status === input.status)
      .sort((left, right) => (
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      ))
      .slice(0, limit);

    return events;
  }

  async getDashboardOverview(): Promise<DashboardOverview> {
    const [
      projectCountResult,
      queuedRunCountResult,
      runningRunCountResult,
      successRateResult,
      recentRuns,
      recentDeployments,
      recentActivity,
      activeRuns,
      latestFailedRun,
      deploymentTargets
    ] = await Promise.all([
      this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM projects"),
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM pipeline_runs WHERE status = 'queued'"
      ),
      this.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM pipeline_runs WHERE status = 'running'"
      ),
      this.pool.query<{ total: string; succeeded: string }>(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status IN ('succeeded', 'failed', 'cancelled')
            )::text AS total,
            COUNT(*) FILTER (
              WHERE status = 'succeeded'
            )::text AS succeeded
          FROM pipeline_runs
          WHERE queued_at >= NOW() - INTERVAL '7 days'
        `
      ),
      this.listRuns({ limit: 8 }),
      this.listDeploymentRevisions(6),
      this.listActivityEvents({ limit: 8 }),
      this.listRuns({ status: "running", limit: 5 }),
      this.listRuns({ status: "failed", limit: 1 }),
      this.listDeploymentTargets()
    ]);

    const allUnhealthyTargets = deploymentTargets.filter(
      (target) => target.lastStatus !== null && target.lastStatus !== "succeeded"
    );
    const unhealthyTargets = allUnhealthyTargets.slice(0, 5);

    const totalCompleted = Number(successRateResult.rows[0]?.total ?? "0");
    const succeeded = Number(successRateResult.rows[0]?.succeeded ?? "0");

    return {
      metrics: {
        projectCount: Number(projectCountResult.rows[0]?.count ?? "0"),
        queuedRunCount: Number(queuedRunCountResult.rows[0]?.count ?? "0"),
        runningRunCount: Number(runningRunCountResult.rows[0]?.count ?? "0"),
        successRate7d: totalCompleted > 0 ? Math.round((succeeded / totalCompleted) * 100) : 0,
        unhealthyTargetCount: allUnhealthyTargets.length
      },
      attention: {
        latestFailedRun: latestFailedRun[0] ?? null,
        activeRuns,
        unhealthyTargets
      },
      recentRuns,
      recentDeployments,
      recentActivity
    };
  }

  async createRollbackEvent(input: {
    targetId: string;
    runId?: string | null;
    fromRevisionId?: string | null;
    toRevisionId: string;
    status: string;
    mode: string;
    initiatedBy: string;
    errorMessage?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `
        INSERT INTO rollback_events (
          id, target_id, run_id, from_revision_id, to_revision_id, status, mode, initiated_by, error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        id,
        input.targetId,
        input.runId ?? null,
        input.fromRevisionId ?? null,
        input.toRevisionId,
        input.status,
        input.mode,
        input.initiatedBy,
        input.errorMessage ?? null
      ]
    );
    return id;
  }

  async completeRollbackEvent(
    rollbackEventId: string,
    status: string,
    errorMessage?: string | null
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE rollback_events
        SET status = $2,
            error_message = $3,
            completed_at = NOW()
        WHERE id = $1
      `,
      [rollbackEventId, status, errorMessage ?? null]
    );
  }

  async enqueueRollbackRun(input: RollbackRequest): Promise<PipelineRunSummary> {
    const target = await this.getDeploymentTargetById(input.targetId);
    if (!target) {
      throw new Error("Deployment target not found.");
    }
    return this.createRun({
      projectId: target.projectId,
      source: "manual_rollback",
      branch: "manual",
      commitSha: "manual",
      triggeredBy: input.initiatedBy,
      metadata: {
        manualRollback: {
          targetId: input.targetId,
          revisionId: input.revisionId,
          initiatedBy: input.initiatedBy
        }
      }
    });
  }

  async rerun(runId: string, triggeredBy: string): Promise<PipelineRunSummary> {
    const existing = await this.getRun(runId);
    if (!existing) {
      throw new Error("Run not found.");
    }
    return this.createRun({
      projectId: existing.summary.projectId,
      source: "rerun",
      branch: existing.summary.branch,
      commitSha: existing.summary.commitSha,
      triggeredBy,
      pipelineConfig: existing.pipelineConfig,
      metadata: existing.metadata
    });
  }

  async writeAuditLog(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: JsonRecord = {}
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [actor, action, entityType, entityId, JSON.stringify(metadata)]
    );
  }
}

function mapProjectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    installationId: Number(row.installation_id),
    mode: row.mode,
    githubRepoId: row.github_repo_id === null ? null : Number(row.github_repo_id),
    defaultBranch: row.default_branch,
    configPath: row.config_path,
    appSlug: row.app_slug,
    primaryUrl: row.primary_url,
    managedConfig: row.generated_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetCount: row.target_count ?? 0,
    latestRunStatus: row.latest_run_status ?? null
  };
}

function mapRunSummary(row: RunRow): PipelineRunSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    source: row.source,
    branch: row.branch,
    commitSha: row.commit_sha,
    status: row.status,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    triggeredBy: row.triggered_by,
    errorMessage: row.error_message
  };
}

function mapDeploymentTargetSummary(
  row: DeploymentTargetRow
): DeploymentTargetSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    name: row.name,
    targetType: row.target_type,
    hostRef: row.host_ref,
    composeFile: row.compose_file,
    service: row.service,
    healthcheckUrl: row.healthcheck_url,
    managedPort: row.managed_port,
    managedRuntimeDir: row.managed_runtime_dir,
    managedDomain: row.managed_domain,
    lastStatus: row.last_status,
    lastDeployedImage: row.last_deployed_image,
    lastDeployedAt: row.last_deployed_at,
    lastError: row.last_error
  };
}

function mapDeploymentRevisionSummary(
  row: DeploymentRevisionRow
): DeploymentRevisionSummary {
  return {
    id: row.id,
    targetId: row.target_id,
    targetName: row.target_name,
    projectId: row.project_id,
    projectName: row.project_name,
    runId: row.run_id,
    imageRef: row.image_ref,
    imageDigest: row.image_digest,
    status: row.status,
    deployedAt: row.deployed_at,
    rollbackOfRevisionId: row.rollback_of_revision_id
  };
}

function mapInstallationSummary(
  row: InstallationRow
): ProjectInstallationSummary {
  return {
    installationId: Number(row.installation_id),
    accountLogin: row.account_login,
    accountType: row.account_type,
    repoCount: Number(row.repo_count ?? 0),
    syncStatus: row.sync_status,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    updatedAt: row.updated_at
  };
}

function mapGitHubRepositorySummary(
  row: GitHubRepositoryRow
): GitHubRepositorySummary {
  return {
    installationId: Number(row.installation_id),
    repoId: Number(row.github_repo_id),
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    isPrivate: row.is_private,
    isArchived: row.is_archived,
    htmlUrl: row.html_url,
    pushedAt: row.pushed_at,
    analysisStatus: row.analysis_status,
    deployabilityStatus: row.deployability_status,
    deployabilityReason: row.deployability_reason,
    detectedFramework: row.detected_framework,
    packageManager: row.package_manager,
    linkedProjectId: row.linked_project_id,
    analyzedAt: row.analyzed_at,
    syncedAt: row.synced_at
  };
}

function mapGitHubOAuthConnectionRecord(
  row: GitHubOAuthConnectionRow
): GitHubOAuthConnectionRecord {
  return {
    actorEmail: row.actor_email,
    githubUserId: Number(row.github_user_id),
    login: row.github_login,
    name: row.github_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    scope: row.scope,
    encryptedAccessToken: row.encrypted_access_token,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at
  };
}

function mapAuditActivityEvent(row: AuditLogRow): ActivityEvent {
  const metadata = row.metadata ?? {};
  const status = typeof metadata.status === "string" ? metadata.status : "completed";
  const metadataSummary = Object.entries(metadata)
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");

  return {
    id: `audit:${row.id}`,
    kind: "audit",
    title: humanizeDotSeparatedLabel(row.action),
    description: metadataSummary || `${humanizeDotSeparatedLabel(row.action)} recorded`,
    status,
    occurredAt: row.created_at,
    actor: row.actor,
    entityType: row.entity_type,
    entityId: row.entity_id,
    projectId: row.entity_type === "project" ? row.entity_id : readString(metadata.projectId),
    runId: row.entity_type === "run" ? row.entity_id : readString(metadata.runId),
    targetId: row.entity_type === "deployment_target"
      ? row.entity_id
      : readString(metadata.targetId),
    metadata
  };
}

function mapWebhookActivityEvent(row: WebhookActivityRow): ActivityEvent {
  const repoName = row.repo_owner && row.repo_name
    ? `${row.repo_owner}/${row.repo_name}`
    : "unknown repository";

  return {
    id: `webhook:${row.delivery_id}`,
    kind: "webhook",
    title: `GitHub ${row.event_name}`,
    description: row.error_message
      ? `${repoName} | ${row.error_message}`
      : `${repoName} webhook ${row.status}`,
    status: row.status,
    occurredAt: row.created_at,
    actor: null,
    entityType: "webhook_delivery",
    entityId: row.delivery_id,
    projectId: row.project_id,
    runId: row.run_id,
    targetId: null,
    metadata: {
      deliveryId: row.delivery_id,
      eventName: row.event_name,
      repoOwner: row.repo_owner,
      repoName: row.repo_name
    }
  };
}

function humanizeDotSeparatedLabel(value: string): string {
  return value
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function withClient<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
