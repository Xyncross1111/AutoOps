const path = require("node:path");
const fs = require("node:fs");
const PptxGenJS = require(path.resolve(__dirname, "pptxgen/node_modules/pptxgenjs"));

const pptx = new PptxGenJS();
pptx.author = "OpenAI Codex";
pptx.company = "OpenAI";
pptx.subject = "AutoOps project presentation";
pptx.title = "AutoOps - Self-Hosted CI/CD Platform MVP";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-US"
};
pptx.defineLayout({ name: "AUTOOPS_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "AUTOOPS_WIDE";

const C = {
  ink: "102133",
  navy: "17314F",
  blue: "2E68FF",
  cyan: "43B7C7",
  teal: "1A7B73",
  green: "2E9058",
  orange: "F18E2C",
  cream: "FBF8F2",
  cloud: "F4F8FF",
  white: "FFFFFF",
  slate: "5B6978",
  border: "DCE4EE",
  sand: "FFF2E3",
  mint: "ECF8F2",
  rose: "FCECE8"
};

const screen = (name) => path.resolve(__dirname, "../results-assets/screenshots", name);

function addBase(slide, dark = false) {
  slide.background = { color: dark ? C.ink : C.cream };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: dark ? 7.5 : 0.22,
    fill: { color: dark ? C.ink : C.blue },
    line: { color: dark ? C.ink : C.blue }
  });
}

function addHeader(slide, kicker, title, subtitle) {
  addBase(slide, false);
  slide.addText(kicker, {
    x: 0.68,
    y: 0.38,
    w: 3.4,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 10,
    bold: true,
    color: C.blue,
    allCaps: true,
    charSpace: 1.4,
    margin: 0
  });
  slide.addText(title, {
    x: 0.68,
    y: 0.72,
    w: 8.8,
    h: 0.5,
    fontFace: "Aptos Display",
    fontSize: 24,
    bold: true,
    color: C.ink,
    margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.68,
      y: 1.25,
      w: 10.7,
      h: 0.34,
      fontFace: "Aptos",
      fontSize: 11.5,
      color: C.slate,
      margin: 0
    });
  }
  slide.addText("AutoOps", {
    x: 11.65,
    y: 0.38,
    w: 1.0,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 10,
    bold: true,
    color: C.slate,
    align: "right",
    margin: 0
  });
}

function addFooter(slide, number) {
  slide.addText(String(number), {
    x: 12.4,
    y: 7.01,
    w: 0.28,
    h: 0.16,
    fontFace: "Aptos",
    fontSize: 9.5,
    color: C.slate,
    align: "right",
    margin: 0
  });
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.07,
    fill: { color: opts.fill || C.white },
    line: { color: opts.line || C.border, pt: opts.pt || 1.1 }
  });
}

function addTitleBodyCard(slide, x, y, w, h, title, body, opts = {}) {
  addCard(slide, x, y, w, h, opts);
  slide.addText(title, {
    x: x + 0.18,
    y: y + 0.14,
    w: w - 0.36,
    h: 0.22,
    fontFace: "Aptos Display",
    fontSize: 14,
    bold: true,
    color: opts.titleColor || C.ink,
    margin: 0
  });
  slide.addText(body, {
    x: x + 0.18,
    y: y + 0.45,
    w: w - 0.36,
    h: h - 0.58,
    fontFace: "Aptos",
    fontSize: opts.fontSize || 11.3,
    color: opts.bodyColor || C.slate,
    margin: 0,
    fit: "shrink"
  });
}

function addBulletText(slide, bullets, x, y, w, h, fontSize = 16) {
  slide.addText(
    bullets.map((b) => `• ${b}`).join("\n"),
    {
      x,
      y,
      w,
      h,
      fontFace: "Aptos",
      fontSize,
      color: C.ink,
      margin: 0.04,
      fit: "shrink",
      paraSpaceAfterPt: 10
    }
  );
}

function addChip(slide, x, y, w, label, fill, text = C.white) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.34,
    rectRadius: 0.09,
    fill: { color: fill },
    line: { color: fill }
  });
  slide.addText(label, {
    x: x + 0.07,
    y: y + 0.05,
    w: w - 0.14,
    h: 0.14,
    fontFace: "Aptos",
    fontSize: 9.6,
    bold: true,
    color: text,
    align: "center",
    margin: 0
  });
}

function addArrow(slide, x1, y1, x2, y2, color = C.blue) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, pt: 2.1, beginArrowType: "none", endArrowType: "triangle" }
  });
}

function addScreenFrame(slide, imgPath, x, y, w, h, label, tint = C.blue) {
  addCard(slide, x, y, w, h, { fill: C.white, line: C.border, pt: 1.2 });
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.14,
    y: y + 0.14,
    w: w - 0.28,
    h: h - 0.28,
    fill: { color: "F6F8FB" },
    line: { color: "F6F8FB" }
  });
  slide.addImage({
    path: imgPath,
    x: x + 0.16,
    y: y + 0.16,
    w: w - 0.32,
    h: h - 0.32
  });
  addChip(slide, x + 0.18, y - 0.18, 1.65, label, tint);
}

function buildSlides() {
  {
    const slide = pptx.addSlide();
    addBase(slide, true);
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.85,
      y: -0.15,
      w: 5.0,
      h: 2.25,
      fill: { color: C.blue, transparency: 12 },
      line: { color: C.blue, transparency: 100 },
      rotate: 6
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 9.7,
      y: 5.85,
      w: 3.7,
      h: 1.45,
      fill: { color: C.orange, transparency: 6 },
      line: { color: C.orange, transparency: 100 },
      rotate: -6
    });
    slide.addText("AutoOps", {
      x: 0.78,
      y: 0.72,
      w: 3.5,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 17,
      bold: true,
      color: "A9CBFF",
      allCaps: true,
      charSpace: 1.6,
      margin: 0
    });
    slide.addText("Self-Hosted CI/CD\nPlatform MVP", {
      x: 0.78,
      y: 1.2,
      w: 5.9,
      h: 1.45,
      fontFace: "Aptos Display",
      fontSize: 28,
      bold: true,
      color: C.white,
      margin: 0,
      fit: "shrink"
    });
    slide.addText(
      "A control plane for GitHub-triggered pipelines, Docker-based execution, deployment health, approvals, and rollback-safe operations.",
      {
        x: 0.8,
        y: 3.0,
        w: 5.95,
        h: 0.86,
        fontFace: "Aptos",
        fontSize: 16,
        color: "DCE6F2",
        margin: 0
      }
    );
    addChip(slide, 0.82, 4.24, 1.55, "Express API", C.blue);
    addChip(slide, 2.5, 4.24, 1.36, "Worker", C.teal);
    addChip(slide, 3.98, 4.24, 1.86, "React Dashboard", C.orange);
    addChip(slide, 0.82, 4.68, 1.46, "Postgres", C.navy);
    addChip(slide, 2.4, 4.68, 1.14, "Docker", C.green);
    addChip(slide, 3.65, 4.68, 2.18, "SSH + Managed Deploys", "7B5634");

    addScreenFrame(slide, screen("overview-page.png"), 7.5, 0.92, 5.0, 3.32, "Dashboard", C.cyan);
    addTitleBodyCard(
      slide,
      7.8,
      4.62,
      4.4,
      1.3,
      "Why this project matters",
      "AutoOps consolidates build, test, deploy, approval, and recovery workflows into one operator-facing system.",
      { fill: "F8F2EA", line: "F8F2EA", titleColor: C.ink, bodyColor: C.slate }
    );
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Project Thesis", "What AutoOps is designed to solve", "A simple narrative for the project before the implementation detail.");
    addBulletText(slide, [
      "AutoOps turns a GitHub push into a controlled CI/CD workflow that stays inside infrastructure the team owns.",
      "The product centralizes queueing, execution visibility, deployment state, healthchecks, and recovery instead of relying on fragmented scripts.",
      "The MVP is strongest where operations usually hurt: stage visibility, release traceability, approval gates, and rollback readiness.",
      "It supports both repository-defined pipelines and a managed import path for supported web applications."
    ], 0.82, 1.95, 7.25, 4.85, 16.4);
    addTitleBodyCard(slide, 8.45, 2.0, 3.72, 1.0, "Core promise", "Push code. Track every stage. Deploy safely. Recover quickly.", { fill: C.cloud, line: "D4E4FF" });
    addTitleBodyCard(slide, 8.45, 3.25, 3.72, 1.0, "Primary users", "Platform teams, operators, and self-hosted product teams that need more control.", { fill: C.mint, line: "CFE9DD" });
    addTitleBodyCard(slide, 8.45, 4.5, 3.72, 1.0, "Presentation angle", "Frame it as an operational platform foundation, not just a deployment dashboard.", { fill: C.sand, line: "F2D8B8" });
    addFooter(slide, 2);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Capability Map", "What Phase 1 already includes", "The current repo covers the entire CI/CD loop, not a single slice of it.");
    const cards = [
      ["GitHub Intake", "App installations, webhook validation, deduplication, repository syncing, and onboarding metadata.", C.cloud, "D4E4FF"],
      ["Pipeline Config", "Per-repository .autoops/pipeline.yml with triggers, build settings, test commands, and deployment targets.", C.white, C.border],
      ["Execution Engine", "Queued runs, ordered stages, Docker build and test execution, image push, and per-target deployment.", C.white, C.border],
      ["Operations UI", "Overview, repositories, projects, runs, deployments, approvals, activity feeds, and rollback actions.", C.white, C.border],
      ["Recovery Controls", "Deployment revisions, automatic rollback, manual rollback, and protected-target promotion approvals.", C.sand, "F2D8B8"],
      ["Managed Mode", "Supported imports for standalone Next.js, React, CRA, and static HTML applications.", C.mint, "CFE9DD"]
    ];
    let i = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const [title, body, fill, line] = cards[i];
        addTitleBodyCard(slide, 0.82 + col * 4.1, 1.95 + row * 2.18, 3.66, 1.78, title, body, { fill, line });
        i += 1;
      }
    }
    addFooter(slide, 3);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Architecture", "How the system is split up", "The repo has a clear separation between control plane, execution, product UI, and shared platform logic.");
    addTitleBodyCard(slide, 0.84, 2.05, 2.2, 1.2, "GitHub", "Installations\nPush webhooks\nRepository access", { fill: C.cloud, line: "D4E4FF" });
    addTitleBodyCard(slide, 3.28, 1.82, 2.55, 1.55, "apps/api", "Express control plane\nAuthentication\nProject and deployment APIs\nRepository analysis", { fill: C.white, line: C.border });
    addTitleBodyCard(slide, 3.28, 4.05, 2.55, 1.55, "apps/web", "React 19 dashboard\nOperator workflows\nRun and deployment views\nApprovals and activity", { fill: C.white, line: C.border });
    addTitleBodyCard(slide, 6.16, 1.82, 2.45, 1.55, "packages/core", "Shared types\nPipeline parsing\nSecurity helpers\nRollback logic", { fill: "F5F8FC", line: C.border });
    addTitleBodyCard(slide, 6.16, 4.05, 2.45, 1.55, "packages/db", "Postgres schema\nRuns, targets, revisions\nSecrets, approvals, audit logs", { fill: "F5F8FC", line: C.border });
    addTitleBodyCard(slide, 8.96, 1.82, 2.9, 1.55, "apps/worker", "Claims queued runs\nClones repos\nBuilds, tests, deploys\nHandles rollback and promotion", { fill: C.mint, line: "CFE9DD" });
    addTitleBodyCard(slide, 8.96, 4.05, 2.9, 1.55, "Deployment targets", "SSH Compose hosts\nManaged VPS targets\nHealthcheck endpoints", { fill: C.sand, line: "F2D8B8" });
    addArrow(slide, 3.05, 2.64, 3.24, 2.64);
    addArrow(slide, 5.86, 2.64, 6.12, 2.64);
    addArrow(slide, 8.64, 2.64, 8.92, 2.64);
    addArrow(slide, 4.54, 3.4, 4.54, 4.0, C.slate);
    addArrow(slide, 7.38, 3.4, 7.38, 4.0, C.slate);
    addArrow(slide, 10.35, 3.4, 10.35, 4.0, C.slate);
    addFooter(slide, 4);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Execution Flow", "From webhook to deployed revision", "This is the operational loop AutoOps automates end to end.");
    const steps = [
      ["Push event", "GitHub emits a signed push webhook."],
      ["Validation", "API verifies headers and deduplicates the delivery."],
      ["Queueing", "Matching projects create queued runs with branch and SHA."],
      ["Prepare", "Worker clones the repo and resolves the pipeline config."],
      ["Build + test", "Docker image build and test commands run in sequence."],
      ["Deploy", "Image push, target deploy, healthcheck, revision record."]
    ];
    let x = 0.6;
    for (let i = 0; i < steps.length; i += 1) {
      addTitleBodyCard(slide, x, 2.45, 1.94, 1.92, steps[i][0], steps[i][1], { fill: i % 2 === 0 ? C.white : "F8FAFF", line: C.border, fontSize: 10.8 });
      if (i < steps.length - 1) {
        addArrow(slide, x + 1.94, 3.41, x + 2.12, 3.41, C.blue);
      }
      x += 2.1;
    }
    addTitleBodyCard(slide, 1.05, 5.05, 5.15, 1.0, "Persistent state", "Runs, stages, logs, delivery outcomes, targets, revisions, and approvals all land in Postgres for traceability.", { fill: C.mint, line: "CFE9DD" });
    addTitleBodyCard(slide, 6.95, 5.05, 5.15, 1.0, "Operator result", "The dashboard can immediately show what failed, where it failed, and what the next safe recovery action should be.", { fill: C.sand, line: "F2D8B8" });
    addFooter(slide, 5);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Product UI", "Overview page for the operator", "The dashboard starts with the things that need attention first.");
    addScreenFrame(slide, screen("overview-page.png"), 0.78, 1.86, 7.45, 4.7, "Overview", C.blue);
    addTitleBodyCard(slide, 8.55, 2.0, 3.78, 1.0, "What it shows", "Project count, running work, success rate, unhealthy targets, and pending approvals.", { fill: C.cloud, line: "D4E4FF" });
    addTitleBodyCard(slide, 8.55, 3.22, 3.78, 1.0, "Why it matters", "The page is tuned for triage: latest failure, active work, and fast rerun access are all surfaced immediately.", { fill: C.white, line: C.border });
    addTitleBodyCard(slide, 8.55, 4.44, 3.78, 1.0, "Presentation message", "AutoOps behaves like an operational cockpit, not just a release history table.", { fill: C.mint, line: "CFE9DD" });
    addFooter(slide, 6);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Onboarding", "GitHub connection and repository discovery", "This is where AutoOps links source repositories to managed or custom deployment paths.");
    addTitleBodyCard(slide, 0.82, 1.95, 3.45, 1.2, "GitHub integration", "The UI brings together OAuth connection, installation sync, repository inventory, and import actions in one workflow.", { fill: C.cloud, line: "D4E4FF" });
    addTitleBodyCard(slide, 0.82, 3.35, 3.45, 1.2, "Managed import path", "Supported repos can be analyzed and imported directly into managed deployments when they match v1 constraints.", { fill: C.mint, line: "CFE9DD" });
    addTitleBodyCard(slide, 0.82, 4.75, 3.45, 1.2, "Version 1 boundary", "Managed mode targets standalone Next.js, React, CRA, and static HTML repositories. Monorepos stay on the custom-pipeline route.", { fill: C.sand, line: "F2D8B8" });
    addScreenFrame(slide, screen("repositories-page.png"), 4.6, 1.86, 7.95, 4.92, "Repositories", C.teal);
    addFooter(slide, 7);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Deployment Ops", "Release state, target health, and rollback readiness", "The deployment view makes release safety concrete with revisions, approvals, and target-level status.");
    addScreenFrame(slide, screen("deployments-page.png"), 0.78, 1.86, 7.5, 4.82, "Deployments", C.orange);
    addBulletText(slide, [
      "Targets carry environment, protection status, promotion order, healthcheck URL, and deployment metadata.",
      "Successful releases become deployment revisions with image references and digests, which makes rollback explicit.",
      "If deployment health fails after a known-good revision exists, the worker can attempt automatic rollback."
    ], 8.58, 2.02, 3.72, 3.2, 14.2);
    addTitleBodyCard(slide, 8.58, 5.36, 3.72, 0.96, "Best talking point", "This is where AutoOps shows operational maturity: deployment history is tied directly to recovery options.", { fill: C.rose, line: "F3D5CF" });
    addFooter(slide, 8);
  }

  {
    const slide = pptx.addSlide();
    addHeader(slide, "Governance", "Protected release approvals and traceability", "Approvals are first-class workflow objects, not comments pasted into chat.");
    addTitleBodyCard(slide, 0.82, 1.95, 3.55, 1.18, "Approval model", "Protected promotions can require explicit approval before deployment work is queued.", { fill: C.cloud, line: "D4E4FF" });
    addTitleBodyCard(slide, 0.82, 3.3, 3.55, 1.18, "Stored context", "Each record keeps requester, revision, source target, destination target, comments, and decision timestamps.", { fill: C.white, line: C.border });
    addTitleBodyCard(slide, 0.82, 4.65, 3.55, 1.18, "Why it matters", "Operators get a durable change trail for protected releases instead of relying on memory or side-channel approvals.", { fill: C.mint, line: "CFE9DD" });
    addScreenFrame(slide, screen("approvals-page.png"), 4.7, 1.86, 7.82, 4.92, "Approvals", C.blue);
    addFooter(slide, 9);
  }

  {
    const slide = pptx.addSlide();
    addBase(slide, true);
    slide.addText("AutoOps is already a real CI/CD story", {
      x: 0.82,
      y: 0.92,
      w: 6.5,
      h: 0.6,
      fontFace: "Aptos Display",
      fontSize: 25,
      bold: true,
      color: C.white,
      margin: 0
    });
    addBulletText(slide, [
      "The repo demonstrates webhook intake, run orchestration, Docker build and test, deployment, health verification, and rollback.",
      "Its clean split between API, worker, UI, shared logic, and database layer makes the architecture easy to explain and easy to extend.",
      "The clearest next steps are broader framework support, richer deployment strategies, deeper observability, and stronger multi-environment workflows."
    ], 0.86, 1.95, 6.5, 3.25, 16.3);
    addScreenFrame(slide, screen("login-page.png"), 7.62, 1.12, 4.45, 2.98, "Login", C.cyan);
    addTitleBodyCard(slide, 7.62, 4.46, 4.45, 1.32, "Closing line", "Present AutoOps as a platform foundation for trustworthy self-hosted delivery: controlled inputs, visible state, safe releases, and fast recovery.", { fill: "1F3B58", line: "1F3B58", titleColor: C.white, bodyColor: "D9E7F3" });
    addChip(slide, 0.86, 5.68, 2.0, "Control plane", C.blue);
    addChip(slide, 2.98, 5.68, 2.08, "Release safety", C.teal);
    addChip(slide, 5.18, 5.68, 1.88, "Rollback ready", C.orange);
    slide.addText("AutoOps\nBuild with control. Deploy with confidence.", {
      x: 0.84,
      y: 6.15,
      w: 4.5,
      h: 0.68,
      fontFace: "Aptos Display",
      fontSize: 17,
      bold: true,
      color: "BFD7FF",
      margin: 0
    });
  }
}

async function main() {
  buildSlides();
  const outDir = path.resolve(__dirname, "../results-assets");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "AutoOps-project-presentation.pptx");
  await pptx.writeFile({ fileName: outFile });
  console.log(outFile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
