const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.MOCK_API_PORT || 4010);

const now = new Date("2026-04-10T16:30:00Z");
const iso = (offsetMinutes) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString();

const overview = {
  metrics: {
    projectCount: 8,
    queuedRunCount: 2,
    runningRunCount: 1,
    successRate7d: 0.93,
    unhealthyTargetCount: 1,
    pendingApprovalCount: 2
  },
  attention: {
    latestFailedRun: {
      id: "run_fail_01",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      source: "push",
      branch: "main",
      commitSha: "8ab12de44c9977c4ae51234c33f5510b9912abcd",
      status: "failed",
      queuedAt: iso(-85),
      startedAt: iso(-84),
      finishedAt: iso(-80),
      triggeredBy: "ci-bot",
      errorMessage: "Deploy healthcheck timed out on production target."
    },
    activeRuns: [
      {
        id: "run_live_01",
        projectId: "proj_portal",
        projectName: "Customer Portal",
        source: "push",
        branch: "feature/release-ops",
        commitSha: "fd77231a3a2342f6b7b44aa1122bbccdd3344556",
        status: "running",
        queuedAt: iso(-18),
        startedAt: iso(-16),
        finishedAt: null,
        triggeredBy: "maya",
        errorMessage: null
      }
    ],
    unhealthyTargets: [],
    pendingApprovals: [
      {
        id: "approval_01",
        projectId: "proj_autoops",
        projectName: "AutoOps Control Plane",
        sourceRevisionId: "rev_preview_01",
        sourceTargetId: "target_staging",
        sourceTargetName: "staging",
        destinationTargetId: "target_prod",
        destinationTargetName: "production",
        sourceImageRef: "ghcr.io/acme/autoops:staging-8ab12de",
        sourceImageDigest: "sha256:75f1737c91bc32d67b2a2df0d1bb9af91c1aa5e441abdc9f0f02dd8f1a772222",
        requestedBy: "maya",
        decidedBy: null,
        requestComment: "Stable in staging for 24 hours. Ready for production promotion.",
        decisionComment: null,
        status: "pending",
        queuedRunId: null,
        createdAt: iso(-52),
        decidedAt: null
      },
      {
        id: "approval_02",
        projectId: "proj_portal",
        projectName: "Customer Portal",
        sourceRevisionId: "rev_preview_02",
        sourceTargetId: "target_preview",
        sourceTargetName: "preview",
        destinationTargetId: "target_stage_2",
        destinationTargetName: "staging",
        sourceImageRef: "ghcr.io/acme/portal:preview-fd77231",
        sourceImageDigest: "sha256:1a1fbfeac4c2028af1cbf772dabc4412345f1111caa99ee0d1b2033444555666",
        requestedBy: "alex",
        decidedBy: null,
        requestComment: "QA passed smoke and payment flow checks.",
        decisionComment: null,
        status: "pending",
        queuedRunId: null,
        createdAt: iso(-28),
        decidedAt: null
      }
    ]
  },
  recentRuns: [
    {
      id: "run_live_01",
      projectId: "proj_portal",
      projectName: "Customer Portal",
      source: "push",
      branch: "feature/release-ops",
      commitSha: "fd77231a3a2342f6b7b44aa1122bbccdd3344556",
      status: "running",
      queuedAt: iso(-18),
      startedAt: iso(-16),
      finishedAt: null,
      triggeredBy: "maya",
      errorMessage: null
    },
    {
      id: "run_ok_01",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      source: "rerun",
      branch: "main",
      commitSha: "96ea12fd11aa41c1ff22bcde1133557799ccdde1",
      status: "succeeded",
      queuedAt: iso(-200),
      startedAt: iso(-198),
      finishedAt: iso(-192),
      triggeredBy: "maya",
      errorMessage: null
    },
    {
      id: "run_fail_01",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      source: "push",
      branch: "main",
      commitSha: "8ab12de44c9977c4ae51234c33f5510b9912abcd",
      status: "failed",
      queuedAt: iso(-85),
      startedAt: iso(-84),
      finishedAt: iso(-80),
      triggeredBy: "ci-bot",
      errorMessage: "Deploy healthcheck timed out on production target."
    }
  ],
  recentDeployments: [],
  recentActivity: []
};

const installations = {
  installations: [
    {
      installationId: 942001,
      accountLogin: "acme-platform",
      accountType: "Organization",
      repoCount: 14,
      syncStatus: "synced",
      lastSyncAt: iso(-21),
      lastSyncError: null,
      updatedAt: iso(-21)
    }
  ]
};

const githubAccount = {
  account: {
    githubUserId: 1024,
    login: "maya-ops",
    name: "Maya Rivera",
    avatarUrl: "https://avatars.githubusercontent.com/u/1024?v=4",
    profileUrl: "https://github.com/maya-ops",
    scope: "repo,read:org",
    connectedAt: iso(-10_000),
    updatedAt: iso(-200)
  }
};

const userRepositories = {
  repositories: [
    {
      repoId: 1001,
      owner: "acme",
      name: "autoops",
      fullName: "acme/autoops",
      description: "Self-hosted CI/CD control plane for GitHub repositories.",
      defaultBranch: "main",
      isPrivate: true,
      isArchived: false,
      visibility: "private",
      htmlUrl: "https://github.com/acme/autoops",
      pushedAt: iso(-40),
      installationId: 942001,
      linkedProjectId: "proj_autoops",
      autoOpsDeployabilityStatus: "imported"
    },
    {
      repoId: 1002,
      owner: "acme",
      name: "customer-portal",
      fullName: "acme/customer-portal",
      description: "Next.js app managed through AutoOps managed deploys.",
      defaultBranch: "main",
      isPrivate: true,
      isArchived: false,
      visibility: "private",
      htmlUrl: "https://github.com/acme/customer-portal",
      pushedAt: iso(-95),
      installationId: 942001,
      linkedProjectId: "proj_portal",
      autoOpsDeployabilityStatus: "imported"
    },
    {
      repoId: 1003,
      owner: "acme",
      name: "docs-site",
      fullName: "acme/docs-site",
      description: "Static HTML docs site ready for managed import.",
      defaultBranch: "main",
      isPrivate: false,
      isArchived: false,
      visibility: "public",
      htmlUrl: "https://github.com/acme/docs-site",
      pushedAt: iso(-340),
      installationId: 942001,
      linkedProjectId: null,
      autoOpsDeployabilityStatus: "deployable"
    }
  ]
};

const repositories = {
  repositories: [
    {
      installationId: 942001,
      repoId: 1001,
      owner: "acme",
      name: "autoops",
      fullName: "acme/autoops",
      description: "Self-hosted CI/CD control plane for GitHub repositories.",
      defaultBranch: "main",
      isPrivate: true,
      isArchived: false,
      htmlUrl: "https://github.com/acme/autoops",
      pushedAt: iso(-40),
      analysisStatus: "analyzed",
      deployabilityStatus: "imported",
      deployabilityReason: null,
      detectedFramework: "react",
      packageManager: "pnpm",
      linkedProjectId: "proj_autoops",
      analyzedAt: iso(-1440),
      syncedAt: iso(-21)
    },
    {
      installationId: 942001,
      repoId: 1002,
      owner: "acme",
      name: "customer-portal",
      fullName: "acme/customer-portal",
      description: "Next.js app managed through AutoOps managed deploys.",
      defaultBranch: "main",
      isPrivate: true,
      isArchived: false,
      htmlUrl: "https://github.com/acme/customer-portal",
      pushedAt: iso(-95),
      analysisStatus: "analyzed",
      deployabilityStatus: "imported",
      deployabilityReason: null,
      detectedFramework: "nextjs",
      packageManager: "pnpm",
      linkedProjectId: "proj_portal",
      analyzedAt: iso(-1440),
      syncedAt: iso(-21)
    },
    {
      installationId: 942001,
      repoId: 1003,
      owner: "acme",
      name: "docs-site",
      fullName: "acme/docs-site",
      description: "Static HTML docs site ready for managed import.",
      defaultBranch: "main",
      isPrivate: false,
      isArchived: false,
      htmlUrl: "https://github.com/acme/docs-site",
      pushedAt: iso(-340),
      analysisStatus: "analyzed",
      deployabilityStatus: "deployable",
      deployabilityReason: null,
      detectedFramework: "static_html",
      packageManager: null,
      linkedProjectId: null,
      analyzedAt: iso(-1440),
      syncedAt: iso(-21)
    }
  ]
};

const approvals = {
  approvals: [
    overview.attention.pendingApprovals[0],
    overview.attention.pendingApprovals[1],
    {
      id: "approval_03",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      sourceRevisionId: "rev_approved_01",
      sourceTargetId: "target_stage_2",
      sourceTargetName: "staging",
      destinationTargetId: "target_prod",
      destinationTargetName: "production",
      sourceImageRef: "ghcr.io/acme/autoops:staging-96ea12f",
      sourceImageDigest: "sha256:bb4817305d23f8eed4f5544444555577d9a9c11114444dd11eeff00442233111",
      requestedBy: "maya",
      decidedBy: "olivia",
      requestComment: "Validated after rollback fix.",
      decisionComment: "Approved after sign-off from platform lead.",
      status: "approved",
      queuedRunId: "run_promote_01",
      createdAt: iso(-300),
      decidedAt: iso(-280)
    }
  ]
};

const deploymentTargets = [
  {
    id: "target_prod",
    projectId: "proj_autoops",
    projectName: "AutoOps Control Plane",
    name: "production",
    targetType: "ssh_compose",
    environment: "production",
    promotionOrder: 2,
    protected: true,
    hostRef: "prod",
    composeFile: "/srv/autoops/docker-compose.yml",
    service: "app",
    healthcheckUrl: "https://autoops.example.com/health",
    managedPort: null,
    managedRuntimeDir: null,
    managedDomain: null,
    lastStatus: "failed",
    lastDeployedImage: "ghcr.io/acme/autoops:main-8ab12de@sha256:9999999abcdef",
    lastDeployedAt: iso(-80),
    lastError: "Healthcheck timed out after deploy."
  },
  {
    id: "target_staging",
    projectId: "proj_autoops",
    projectName: "AutoOps Control Plane",
    name: "staging",
    targetType: "ssh_compose",
    environment: "staging",
    promotionOrder: 1,
    protected: false,
    hostRef: "stage",
    composeFile: "/srv/autoops-stage/docker-compose.yml",
    service: "app",
    healthcheckUrl: "https://staging.autoops.example.com/health",
    managedPort: null,
    managedRuntimeDir: null,
    managedDomain: null,
    lastStatus: "succeeded",
    lastDeployedImage: "ghcr.io/acme/autoops:staging-96ea12f@sha256:1111111abcdef",
    lastDeployedAt: iso(-180),
    lastError: null
  },
  {
    id: "target_preview",
    projectId: "proj_portal",
    projectName: "Customer Portal",
    name: "preview:feature-release-ops",
    targetType: "managed_vps",
    environment: "preview",
    promotionOrder: 1,
    protected: false,
    hostRef: "managed",
    composeFile: "/opt/autoops-managed/apps/customer-portal-preview/docker-compose.yml",
    service: "app",
    healthcheckUrl: "http://customer-portal-preview:3000/",
    managedPort: 4301,
    managedRuntimeDir: "/opt/autoops-managed/apps/customer-portal-preview",
    managedDomain: "customer-portal-preview.autoops.example.com",
    lastStatus: "succeeded",
    lastDeployedImage: "autoops-managed-customer-portal:run_live_01@sha256:7777777abcdef",
    lastDeployedAt: iso(-35),
    lastError: null
  }
];

const deploymentsIndex = {
  targets: deploymentTargets,
  revisions: [
    {
      id: "rev_prod_01",
      targetId: "target_prod",
      targetName: "production",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      runId: "run_fail_01",
      runSource: "push",
      imageRef: "ghcr.io/acme/autoops:main-8ab12de",
      imageDigest: "sha256:9999999abcdef",
      status: "failed",
      deployedAt: iso(-80),
      rollbackOfRevisionId: null,
      promotedFromRevisionId: "rev_stage_01",
      promotedFromTargetId: "target_staging",
      promotedFromTargetName: "staging",
      promotionApprovalId: "approval_03",
      promotionApprovalStatus: "approved"
    },
    {
      id: "rev_stage_01",
      targetId: "target_staging",
      targetName: "staging",
      projectId: "proj_autoops",
      projectName: "AutoOps Control Plane",
      runId: "run_ok_01",
      runSource: "rerun",
      imageRef: "ghcr.io/acme/autoops:staging-96ea12f",
      imageDigest: "sha256:1111111abcdef",
      status: "succeeded",
      deployedAt: iso(-180),
      rollbackOfRevisionId: null,
      promotedFromRevisionId: null,
      promotedFromTargetId: null,
      promotedFromTargetName: null,
      promotionApprovalId: null,
      promotionApprovalStatus: null
    },
    {
      id: "rev_preview_02",
      targetId: "target_preview",
      targetName: "preview:feature-release-ops",
      projectId: "proj_portal",
      projectName: "Customer Portal",
      runId: "run_live_01",
      runSource: "push",
      imageRef: "autoops-managed-customer-portal:run_live_01",
      imageDigest: "sha256:7777777abcdef",
      status: "succeeded",
      deployedAt: iso(-35),
      rollbackOfRevisionId: null,
      promotedFromRevisionId: null,
      promotedFromTargetId: null,
      promotedFromTargetName: null,
      promotionApprovalId: null,
      promotionApprovalStatus: null
    }
  ]
};

const deploymentTargetDetail = {
  target: deploymentTargets[0],
  revisions: deploymentsIndex.revisions.filter((revision) => revision.targetId === "target_prod"),
  linkedRuns: []
};

const authMe = {
  user: {
    email: "maya@acme.dev"
  }
};

const login = {
  token: "demo-token",
  user: authMe.user
};

const installUrl = { url: "https://github.com/apps/autoops/installations/new" };
const oauthUrl = { url: "https://github.com/login/oauth/authorize?client_id=demo" };

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, { error: "Not found" }, 404);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    return notFound(res);
  }

  if (req.method === "OPTIONS") {
    return sendJson(res, { ok: true });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  if (pathname === "/healthz") {
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
    return sendJson(res, login);
  }

  if (pathname === "/api/auth/me") {
    return sendJson(res, authMe);
  }

  if (pathname === "/api/github/account") {
    return sendJson(res, githubAccount);
  }

  if (pathname === "/api/github/installations") {
    return sendJson(res, installations);
  }

  if (pathname === "/api/github/oauth-url") {
    return sendJson(res, oauthUrl);
  }

  if (pathname === "/api/github/install-url") {
    return sendJson(res, installUrl);
  }

  if (pathname === "/api/github/user/repositories" || pathname === "/api/github/account/repositories") {
    return sendJson(res, userRepositories);
  }

  if (pathname === "/api/github/repositories") {
    return sendJson(res, repositories);
  }

  if (pathname === "/api/dashboard/overview") {
    return sendJson(res, { overview });
  }

  if (pathname === "/api/approvals") {
    return sendJson(res, approvals);
  }

  if (pathname.startsWith("/api/approvals/") && pathname.endsWith("/approve")) {
    return sendJson(res, {
      approval: { ...approvals.approvals[0], status: "approved", decidedBy: "maya@acme.dev", decidedAt: iso(0) },
      run: overview.recentRuns[0]
    });
  }

  if (pathname.startsWith("/api/approvals/") && pathname.endsWith("/reject")) {
    return sendJson(res, {
      approval: { ...approvals.approvals[0], status: "rejected", decidedBy: "maya@acme.dev", decidedAt: iso(0) }
    });
  }

  if (pathname === "/api/deployments") {
    return sendJson(res, deploymentsIndex);
  }

  if (pathname === "/api/deployments/targets/target_prod") {
    return sendJson(res, deploymentTargetDetail);
  }

  if (pathname === "/api/runs/run_fail_01") {
    return sendJson(res, {
      run: overview.attention.latestFailedRun,
      stages: [
        { id: "stage_prepare", runId: "run_fail_01", stageName: "prepare", stageOrder: 1, status: "succeeded", startedAt: iso(-84), finishedAt: iso(-83), metadata: {} },
        { id: "stage_build", runId: "run_fail_01", stageName: "build", stageOrder: 2, status: "succeeded", startedAt: iso(-83), finishedAt: iso(-82), metadata: {} },
        { id: "stage_test", runId: "run_fail_01", stageName: "test", stageOrder: 3, status: "succeeded", startedAt: iso(-82), finishedAt: iso(-81), metadata: {} },
        { id: "stage_deploy", runId: "run_fail_01", stageName: "deploy", stageOrder: 4, status: "failed", startedAt: iso(-81), finishedAt: iso(-80), metadata: {} }
      ],
      logs: [
        { id: 1, runId: "run_fail_01", stageName: "deploy", message: "Deploying to production on prod-autoops-01.", createdAt: iso(-81) },
        { id: 2, runId: "run_fail_01", stageName: "deploy", message: "Healthcheck timed out after 60 seconds.", createdAt: iso(-80) }
      ]
    });
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`Mock AutoOps API listening on http://localhost:${PORT}`);
});
