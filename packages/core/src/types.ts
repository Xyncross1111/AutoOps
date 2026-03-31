export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "superseded";

export type StageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type RunSource = "push" | "rerun" | "manual_rollback";

export interface PipelineHealthcheck {
  url: string;
  timeoutSeconds?: number;
}

export interface PipelineTarget {
  name: string;
  hostRef: string;
  composeFile: string;
  service: string;
  healthcheck: PipelineHealthcheck;
}

export interface PipelineConfig {
  version: 1;
  triggers: {
    push: {
      branches: string[];
    };
  };
  build: {
    context: string;
    dockerfile: string;
    image: string;
  };
  test: {
    commands: string[];
  };
  deploy: {
    targets: PipelineTarget[];
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  defaultBranch: string;
  configPath: string;
  createdAt: string;
  updatedAt: string;
  targetCount: number;
  latestRunStatus: RunStatus | null;
}

export interface PipelineRunSummary {
  id: string;
  projectId: string;
  projectName: string;
  source: RunSource;
  branch: string;
  commitSha: string;
  status: RunStatus;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  triggeredBy: string;
  errorMessage: string | null;
}

export interface StageRun {
  id: string;
  runId: string;
  stageName: string;
  stageOrder: number;
  status: StageStatus;
  startedAt: string | null;
  finishedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface RunLogEntry {
  id: number;
  runId: string;
  stageName: string;
  message: string;
  createdAt: string;
}

export interface DeploymentTargetSummary {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  hostRef: string;
  composeFile: string;
  service: string;
  healthcheckUrl: string;
  lastStatus: string | null;
  lastDeployedImage: string | null;
  lastDeployedAt: string | null;
  lastError: string | null;
}

export interface DeploymentRevisionSummary {
  id: string;
  targetId: string;
  targetName: string;
  projectId: string;
  projectName: string;
  runId: string | null;
  imageRef: string;
  imageDigest: string;
  status: string;
  deployedAt: string;
  rollbackOfRevisionId: string | null;
}

export interface RollbackRequest {
  targetId: string;
  revisionId: string;
  initiatedBy: string;
}

export interface GitHubPushContext {
  owner: string;
  repo: string;
  installationId: number;
  ref: string;
  after: string;
  sender: string;
  deliveryId: string;
}

export interface ManualRollbackMetadata {
  targetId: string;
  revisionId: string;
  initiatedBy: string;
}

export interface QueuedRunMetadata {
  pipelineConfig?: PipelineConfig;
  deliveryId?: string;
  manualRollback?: ManualRollbackMetadata;
}

export interface ProjectInstallationSummary {
  installationId: number;
  accountLogin: string;
  accountType: string;
  updatedAt: string;
}

export interface RunListFilters {
  projectId?: string;
  status?: RunStatus;
  source?: RunSource;
  search?: string;
  limit?: number;
}

export interface ProjectUpdateInput {
  name?: string;
  defaultBranch?: string;
  configPath?: string;
  secrets?: Record<string, string>;
}

export interface ProjectDetail {
  project: ProjectSummary;
  recentRuns: PipelineRunSummary[];
  deploymentTargets: DeploymentTargetSummary[];
  installation: ProjectInstallationSummary | null;
  secretNames: string[];
}

export interface DeploymentTargetDetail {
  target: DeploymentTargetSummary;
  revisions: DeploymentRevisionSummary[];
  linkedRuns: PipelineRunSummary[];
}

export type ActivityEventKind = "audit" | "webhook";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  title: string;
  description: string;
  status: string;
  occurredAt: string;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  runId: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
}

export interface DashboardOverview {
  metrics: {
    projectCount: number;
    queuedRunCount: number;
    runningRunCount: number;
    successRate7d: number;
    unhealthyTargetCount: number;
  };
  attention: {
    latestFailedRun: PipelineRunSummary | null;
    activeRuns: PipelineRunSummary[];
    unhealthyTargets: DeploymentTargetSummary[];
  };
  recentRuns: PipelineRunSummary[];
  recentDeployments: DeploymentRevisionSummary[];
  recentActivity: ActivityEvent[];
}
