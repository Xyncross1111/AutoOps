import http from "node:http";

const port = Number(process.env.PORT ?? 4010);
const baseTime = Date.parse("2026-04-10T12:00:00.000Z");

function minutesAgo(minutes) {
  return new Date(baseTime - minutes * 60_000).toISOString();
}

const githubAccount = {
  githubUserId: 1042,
  login: "autoops-lab",
  name: "AutoOps Research Lab",
  avatarUrl: "https://avatars.githubusercontent.com/u/1042?v=4",
  profileUrl: "https://github.com/autoops-lab",
  scope: "repo, read:org",
  connectedAt: minutesAgo(60 * 24 * 6),
  updatedAt: minutesAgo(60 * 8)
};

const installations = [
  {
    installationId: 1001,
    accountLogin: "autoops-lab",
    accountType: "Organization",
    repoCount: 7,
    syncStatus: "succeeded",
    lastSyncAt: minutesAgo(12),
    lastSyncError: null,
    updatedAt: minutesAgo(12)
  }
];

const projects = [
  {
    id: "project-campus-portal",
    name: "Campus Portal",
    repoOwner: "autoops-lab",
    repoName: "campus-portal",
    installationId: 1001,
    mode: "managed_nextjs",
    githubRepoId: 845001,
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    appSlug: "campus-portal",
    primaryUrl: "https://campus-portal.autoops.local",
    managedConfig: {
      framework: "nextjs",
      packageManager: "pnpm",
      packageManagerVersion: "10.28.2",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      nodeVersion: "20",
      outputPort: 3000,
      outputDirectory: ".next"
    },
    createdAt: minutesAgo(60 * 24 * 14),
    updatedAt: minutesAgo(22),
    targetCount: 2,
    latestRunStatus: "failed"
  },
  {
    id: "project-placement-api",
    name: "Placement API",
    repoOwner: "autoops-lab",
    repoName: "placement-api",
    installationId: 1001,
    mode: "custom_pipeline",
    githubRepoId: 845002,
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    appSlug: null,
    primaryUrl: "https://placement-api.autoops.local",
    managedConfig: null,
    createdAt: minutesAgo(60 * 24 * 17),
    updatedAt: minutesAgo(41),
    targetCount: 2,
    latestRunStatus: "succeeded"
  }
];

const runs = [
  {
    id: "run-201",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    source: "push",
    branch: "feat/security-audit",
    commitSha: "f83a1d5c712e4f890d6e58f6b14d9dcb2f1e7802",
    status: "failed",
    queuedAt: minutesAgo(47),
    startedAt: minutesAgo(45),
    finishedAt: minutesAgo(37),
    triggeredBy: "ananya@autoops.local",
    errorMessage: "Dependency audit gate failed after a critical advisory was confirmed."
  },
  {
    id: "run-203",
    projectId: "project-placement-api",
    projectName: "Placement API",
    source: "push",
    branch: "main",
    commitSha: "2f4bb8a8cb3746c2d6a570f85432f72f455f031f",
    status: "running",
    queuedAt: minutesAgo(18),
    startedAt: minutesAgo(16),
    finishedAt: null,
    triggeredBy: "ci-bot@autoops.local",
    errorMessage: null
  },
  {
    id: "run-204",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    source: "manual_deploy",
    branch: "main",
    commitSha: "1cd4f4ad16b4e926a3134fd68a3290c43ca5cbdb",
    status: "succeeded",
    queuedAt: minutesAgo(90),
    startedAt: minutesAgo(88),
    finishedAt: minutesAgo(83),
    triggeredBy: "shubhangi@autoops.local",
    errorMessage: null
  },
  {
    id: "run-199",
    projectId: "project-placement-api",
    projectName: "Placement API",
    source: "rerun",
    branch: "main",
    commitSha: "81f77150c67226bc4f8f4781d34743dfcc322cd1",
    status: "succeeded",
    queuedAt: minutesAgo(170),
    startedAt: minutesAgo(168),
    finishedAt: minutesAgo(161),
    triggeredBy: "ananya@autoops.local",
    errorMessage: null
  }
];

const runDetails = {
  "run-201": {
    run: runs[0],
    stages: [
      {
        id: "stage-201-1",
        runId: "run-201",
        stageName: "checkout",
        stageOrder: 1,
        status: "succeeded",
        startedAt: minutesAgo(45),
        finishedAt: minutesAgo(44),
        metadata: { image: "node:20-bookworm", step: "git clone" }
      },
      {
        id: "stage-201-2",
        runId: "run-201",
        stageName: "build",
        stageOrder: 2,
        status: "succeeded",
        startedAt: minutesAgo(44),
        finishedAt: minutesAgo(41),
        metadata: { command: "pnpm build" }
      },
      {
        id: "stage-201-3",
        runId: "run-201",
        stageName: "audit",
        stageOrder: 3,
        status: "failed",
        startedAt: minutesAgo(41),
        finishedAt: minutesAgo(37),
        metadata: {
          advisories: 2,
          critical: 1,
          packages: ["next", "minimatch"]
        }
      },
      {
        id: "stage-201-4",
        runId: "run-201",
        stageName: "deploy",
        stageOrder: 4,
        status: "skipped",
        startedAt: null,
        finishedAt: null,
        metadata: { reason: "Audit gate failed" }
      }
    ],
    logs: [
      {
        id: 1,
        runId: "run-201",
        stageName: "checkout",
        message: "Cloned autoops-lab/campus-portal at f83a1d5.",
        createdAt: minutesAgo(45)
      },
      {
        id: 2,
        runId: "run-201",
        stageName: "build",
        message: "pnpm install completed in 22.3s. Starting production build.",
        createdAt: minutesAgo(43)
      },
      {
        id: 3,
        runId: "run-201",
        stageName: "build",
        message: "Build completed successfully. Generated 14 optimized assets.",
        createdAt: minutesAgo(41)
      },
      {
        id: 4,
        runId: "run-201",
        stageName: "audit",
        message: "Dependabot advisory sync returned 2 dependency findings for the workspace.",
        createdAt: minutesAgo(40)
      },
      {
        id: 5,
        runId: "run-201",
        stageName: "audit",
        message: "Critical advisory detected: next@14.1.2 susceptible to cache poisoning under crafted routing input.",
        createdAt: minutesAgo(39)
      },
      {
        id: 6,
        runId: "run-201",
        stageName: "audit",
        message: "AI remediation summary: upgrade to next@14.1.4 and re-run integration smoke tests before production promotion.",
        createdAt: minutesAgo(38)
      },
      {
        id: 7,
        runId: "run-201",
        stageName: "audit",
        message: "Dependency audit gate failed after a critical advisory was confirmed. Deployment cancelled.",
        createdAt: minutesAgo(37)
      }
    ]
  },
  "run-203": {
    run: runs[1],
    stages: [
      {
        id: "stage-203-1",
        runId: "run-203",
        stageName: "checkout",
        stageOrder: 1,
        status: "succeeded",
        startedAt: minutesAgo(16),
        finishedAt: minutesAgo(15),
        metadata: {}
      },
      {
        id: "stage-203-2",
        runId: "run-203",
        stageName: "test",
        stageOrder: 2,
        status: "running",
        startedAt: minutesAgo(15),
        finishedAt: null,
        metadata: {}
      }
    ],
    logs: [
      {
        id: 20,
        runId: "run-203",
        stageName: "test",
        message: "Running API integration suite in isolated Docker network...",
        createdAt: minutesAgo(14)
      }
    ]
  },
  "run-204": {
    run: runs[2],
    stages: [
      {
        id: "stage-204-1",
        runId: "run-204",
        stageName: "build",
        stageOrder: 1,
        status: "succeeded",
        startedAt: minutesAgo(88),
        finishedAt: minutesAgo(86),
        metadata: {}
      },
      {
        id: "stage-204-2",
        runId: "run-204",
        stageName: "deploy",
        stageOrder: 2,
        status: "succeeded",
        startedAt: minutesAgo(86),
        finishedAt: minutesAgo(83),
        metadata: {}
      }
    ],
    logs: [
      {
        id: 30,
        runId: "run-204",
        stageName: "deploy",
        message: "Production rollout completed successfully in 4m 55s.",
        createdAt: minutesAgo(83)
      }
    ]
  },
  "run-199": {
    run: runs[3],
    stages: [
      {
        id: "stage-199-1",
        runId: "run-199",
        stageName: "build",
        stageOrder: 1,
        status: "succeeded",
        startedAt: minutesAgo(168),
        finishedAt: minutesAgo(166),
        metadata: {}
      }
    ],
    logs: [
      {
        id: 40,
        runId: "run-199",
        stageName: "build",
        message: "Re-run completed successfully.",
        createdAt: minutesAgo(161)
      }
    ]
  }
};

const deploymentTargets = [
  {
    id: "target-preview",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    name: "preview:security-audit",
    targetType: "ssh_compose",
    environment: "preview",
    promotionOrder: 1,
    protected: false,
    hostRef: "preview",
    composeFile: "/srv/campus-portal-preview/docker-compose.yml",
    service: "web",
    healthcheckUrl: "https://preview-campus.autoops.local/health",
    managedPort: null,
    managedRuntimeDir: null,
    managedDomain: null,
    lastStatus: "succeeded",
    lastDeployedImage: "ghcr.io/autoops-lab/campus-portal:preview-f83a1d5@sha256:9e4b5fc8c5e0ec7cd8a512aa8a55a4e5467ad4e4ed563d6ab33af8e6d27391fe",
    lastDeployedAt: minutesAgo(95),
    lastError: null
  },
  {
    id: "target-production",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    name: "production",
    targetType: "managed_vps",
    environment: "production",
    promotionOrder: 2,
    protected: true,
    hostRef: "prod",
    composeFile: "/opt/autoops-managed/campus-portal/docker-compose.yml",
    service: "web",
    healthcheckUrl: "https://campus-portal.autoops.local/health",
    managedPort: 6100,
    managedRuntimeDir: "/opt/autoops-managed/apps/campus-portal",
    managedDomain: "campus-portal.autoops.local",
    lastStatus: "failed",
    lastDeployedImage: "ghcr.io/autoops-lab/campus-portal:main-1cd4f4a@sha256:71e4bcbc10c6a2f084d6d6f8696e0a71f4d8389684d4a58dfe7665e5beec5e4a",
    lastDeployedAt: minutesAgo(84),
    lastError: "Healthcheck timed out after 30s while waiting for /health to return 200."
  },
  {
    id: "target-placement-staging",
    projectId: "project-placement-api",
    projectName: "Placement API",
    name: "staging",
    targetType: "ssh_compose",
    environment: "staging",
    promotionOrder: 1,
    protected: true,
    hostRef: "staging",
    composeFile: "/srv/placement-api-staging/docker-compose.yml",
    service: "api",
    healthcheckUrl: "https://placement-api.autoops.local/health",
    managedPort: null,
    managedRuntimeDir: null,
    managedDomain: null,
    lastStatus: "succeeded",
    lastDeployedImage: "ghcr.io/autoops-lab/placement-api:2f4bb8a@sha256:cb7683ee4983a36db0cfd6e2620fd9302d47d7a788cf30990601a7795fbd8ad1",
    lastDeployedAt: minutesAgo(19),
    lastError: null
  }
];

const revisions = [
  {
    id: "revision-401",
    targetId: "target-preview",
    targetName: "preview:security-audit",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    runId: "run-204",
    runSource: "manual_deploy",
    imageRef: "ghcr.io/autoops-lab/campus-portal:preview-f83a1d5",
    imageDigest: "sha256:9e4b5fc8c5e0ec7cd8a512aa8a55a4e5467ad4e4ed563d6ab33af8e6d27391fe",
    status: "succeeded",
    deployedAt: minutesAgo(95),
    rollbackOfRevisionId: null,
    promotedFromRevisionId: null,
    promotedFromTargetId: null,
    promotedFromTargetName: null,
    promotionApprovalId: null,
    promotionApprovalStatus: null
  },
  {
    id: "revision-397",
    targetId: "target-production",
    targetName: "production",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    runId: "run-204",
    runSource: "manual_deploy",
    imageRef: "ghcr.io/autoops-lab/campus-portal:main-1cd4f4a",
    imageDigest: "sha256:71e4bcbc10c6a2f084d6d6f8696e0a71f4d8389684d4a58dfe7665e5beec5e4a",
    status: "failed",
    deployedAt: minutesAgo(84),
    rollbackOfRevisionId: null,
    promotedFromRevisionId: null,
    promotedFromTargetId: null,
    promotedFromTargetName: null,
    promotionApprovalId: null,
    promotionApprovalStatus: null
  },
  {
    id: "revision-392",
    targetId: "target-production",
    targetName: "production",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    runId: "run-199",
    runSource: "manual_promotion",
    imageRef: "ghcr.io/autoops-lab/campus-portal:main-7a11c28",
    imageDigest: "sha256:b3f44e42b8587eef24ac23592d0ad5c6d3ae98f91db3f3d71bca03bc05dfb2b0",
    status: "succeeded",
    deployedAt: minutesAgo(300),
    rollbackOfRevisionId: null,
    promotedFromRevisionId: "revision-388",
    promotedFromTargetId: "target-preview",
    promotedFromTargetName: "preview:release-candidate",
    promotionApprovalId: "approval-1",
    promotionApprovalStatus: "approved"
  }
];

const approvals = [
  {
    id: "approval-1",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    sourceRevisionId: "revision-401",
    sourceTargetId: "target-preview",
    sourceTargetName: "preview:security-audit",
    destinationTargetId: "target-production",
    destinationTargetName: "production",
    sourceImageRef: "ghcr.io/autoops-lab/campus-portal:preview-f83a1d5",
    sourceImageDigest: "sha256:9e4b5fc8c5e0ec7cd8a512aa8a55a4e5467ad4e4ed563d6ab33af8e6d27391fe",
    requestedBy: "shubhangi@autoops.local",
    decidedBy: null,
    requestComment: "Preview validation passed. Ready for supervised promotion.",
    decisionComment: null,
    status: "pending",
    queuedRunId: null,
    createdAt: minutesAgo(28),
    decidedAt: null
  },
  {
    id: "approval-0",
    projectId: "project-campus-portal",
    projectName: "Campus Portal",
    sourceRevisionId: "revision-388",
    sourceTargetId: "target-preview",
    sourceTargetName: "preview:release-candidate",
    destinationTargetId: "target-production",
    destinationTargetName: "production",
    sourceImageRef: "ghcr.io/autoops-lab/campus-portal:main-7a11c28",
    sourceImageDigest: "sha256:b3f44e42b8587eef24ac23592d0ad5c6d3ae98f91db3f3d71bca03bc05dfb2b0",
    requestedBy: "ananya@autoops.local",
    decidedBy: "anas@autoops.local",
    requestComment: null,
    decisionComment: "Smoke checks passed on preview and staging.",
    status: "approved",
    queuedRunId: "run-199",
    createdAt: minutesAgo(320),
    decidedAt: minutesAgo(310)
  }
];

const activity = [
  {
    id: "event-webhook-1",
    kind: "webhook",
    title: "Webhook received",
    description: "GitHub push event accepted for autoops-lab/campus-portal.",
    status: "processed",
    occurredAt: minutesAgo(48),
    actor: "github[bot]",
    entityType: "repository",
    entityId: "autoops-lab/campus-portal",
    projectId: "project-campus-portal",
    runId: "run-201",
    targetId: null,
    metadata: {
      deliveryId: "d8a9ef80-084c-4cb7-a183-17f15b9a4d4a",
      event: "push",
      ref: "refs/heads/feat/security-audit",
      signature: "verified",
      installationId: 1001
    }
  },
  {
    id: "event-webhook-2",
    kind: "webhook",
    title: "Signature verified",
    description: "HMAC SHA-256 validation succeeded before pipeline execution started.",
    status: "succeeded",
    occurredAt: minutesAgo(47),
    actor: "autoops-api",
    entityType: "run",
    entityId: "run-201",
    projectId: "project-campus-portal",
    runId: "run-201",
    targetId: null,
    metadata: {
      algorithm: "sha256",
      deliveryId: "d8a9ef80-084c-4cb7-a183-17f15b9a4d4a",
      validationWindowMs: 42
    }
  },
  {
    id: "event-audit-1",
    kind: "audit",
    title: "Pipeline queued",
    description: "Run run-201 entered the worker queue with deterministic stage ordering.",
    status: "queued",
    occurredAt: minutesAgo(46),
    actor: "autoops-worker",
    entityType: "run",
    entityId: "run-201",
    projectId: "project-campus-portal",
    runId: "run-201",
    targetId: null,
    metadata: {
      stages: ["checkout", "build", "audit", "deploy"],
      source: "push"
    }
  },
  {
    id: "event-audit-2",
    kind: "audit",
    title: "Promotion requested",
    description: "Preview revision queued for production approval.",
    status: "pending",
    occurredAt: minutesAgo(28),
    actor: "shubhangi@autoops.local",
    entityType: "approval",
    entityId: "approval-1",
    projectId: "project-campus-portal",
    runId: null,
    targetId: "target-production",
    metadata: {
      sourceRevisionId: "revision-401",
      destinationTargetId: "target-production"
    }
  },
  {
    id: "event-audit-3",
    kind: "audit",
    title: "Deployment health degraded",
    description: "Production healthcheck failed after the latest rollout.",
    status: "failed",
    occurredAt: minutesAgo(82),
    actor: "autoops-worker",
    entityType: "target",
    entityId: "target-production",
    projectId: "project-campus-portal",
    runId: "run-204",
    targetId: "target-production",
    metadata: {
      healthcheckUrl: "https://campus-portal.autoops.local/health",
      timeoutSeconds: 30
    }
  }
];

const projectDetail = {
  project: projects[0],
  recentRuns: [runs[0], runs[2]],
  deploymentTargets: deploymentTargets.filter((target) => target.projectId === "project-campus-portal"),
  installation: installations[0],
  repository: {
    installationId: 1001,
    repoId: 845001,
    owner: "autoops-lab",
    name: "campus-portal",
    fullName: "autoops-lab/campus-portal",
    description: "Student-facing portal used for deployment workflow experiments.",
    defaultBranch: "main",
    isPrivate: true,
    isArchived: false,
    htmlUrl: "https://github.com/autoops-lab/campus-portal",
    pushedAt: minutesAgo(48),
    analysisStatus: "analyzed",
    deployabilityStatus: "deployable",
    deployabilityReason: null,
    detectedFramework: "nextjs",
    packageManager: "pnpm",
    linkedProjectId: "project-campus-portal",
    analyzedAt: minutesAgo(180),
    syncedAt: minutesAgo(12)
  },
  secretNames: ["DATABASE_URL", "GITHUB_WEBHOOK_SECRET", "OPENAI_API_KEY"]
};

const deploymentTargetDetails = {
  "target-preview": {
    target: deploymentTargets[0],
    revisions: revisions.filter((revision) => revision.targetId === "target-preview"),
    linkedRuns: [runs[2], runs[0]]
  },
  "target-production": {
    target: deploymentTargets[1],
    revisions: revisions.filter((revision) => revision.targetId === "target-production"),
    linkedRuns: [runs[2], runs[3]]
  },
  "target-placement-staging": {
    target: deploymentTargets[2],
    revisions: [],
    linkedRuns: [runs[1]]
  }
};

const overview = {
  metrics: {
    projectCount: projects.length,
    queuedRunCount: 1,
    runningRunCount: 1,
    successRate7d: 92,
    unhealthyTargetCount: 1,
    pendingApprovalCount: approvals.filter((approval) => approval.status === "pending").length
  },
  attention: {
    latestFailedRun: runs[0],
    activeRuns: [runs[1]],
    unhealthyTargets: [deploymentTargets[1]],
    pendingApprovals: [approvals[0]]
  },
  recentRuns: [runs[2], runs[1], runs[0], runs[3]],
  recentDeployments: [revisions[0], revisions[1], revisions[2]],
  recentActivity: [activity[0], activity[1], activity[3], activity[4]]
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function notFound(response, pathname) {
  json(response, 404, { error: `No mock route for ${pathname}` });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    json(response, 200, { user: { email: "researcher@autoops.local" } });
    return;
  }

  if (request.method === "GET" && pathname === "/api/github/account") {
    json(response, 200, { account: githubAccount });
    return;
  }

  if (request.method === "GET" && pathname === "/api/github/installations") {
    json(response, 200, { installations });
    return;
  }

  if (request.method === "GET" && pathname === "/api/dashboard/overview") {
    json(response, 200, { overview });
    return;
  }

  if (request.method === "GET" && pathname === "/api/projects") {
    json(response, 200, { projects });
    return;
  }

  if (request.method === "GET" && pathname === "/api/approvals") {
    json(response, 200, { approvals });
    return;
  }

  if (request.method === "GET" && pathname === "/api/activity") {
    json(response, 200, { events: activity });
    return;
  }

  if (request.method === "GET" && pathname === "/api/runs") {
    json(response, 200, { runs });
    return;
  }

  if (request.method === "GET" && pathname === "/api/deployments") {
    json(response, 200, { targets: deploymentTargets, revisions });
    return;
  }

  if (request.method === "GET" && pathname === "/api/projects/project-campus-portal") {
    json(response, 200, projectDetail);
    return;
  }

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    const detail = runDetails[runMatch[1]];
    if (!detail) {
      notFound(response, pathname);
      return;
    }
    json(response, 200, detail);
    return;
  }

  const runStreamMatch = pathname.match(/^\/api\/runs\/([^/]+)\/stream$/);
  if (request.method === "GET" && runStreamMatch) {
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    response.end();
    return;
  }

  const deploymentMatch = pathname.match(/^\/api\/deployments\/targets\/([^/]+)$/);
  if (request.method === "GET" && deploymentMatch) {
    const detail = deploymentTargetDetails[deploymentMatch[1]];
    if (!detail) {
      notFound(response, pathname);
      return;
    }
    json(response, 200, detail);
    return;
  }

  notFound(response, pathname);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mock API listening on http://127.0.0.1:${port}\n`);
});
