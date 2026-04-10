const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require(path.resolve(__dirname, "node_modules/pdfkit"));

const outFile = path.resolve(__dirname, "../results-assets/AutoOps-project-presentation.pdf");
const shotsDir = path.resolve(__dirname, "../results-assets/screenshots");

const PAGE = { width: 960, height: 540, margin: 42 };
const C = {
  ink: "#102133",
  navy: "#17314F",
  blue: "#2E68FF",
  cyan: "#42B6C7",
  teal: "#197B72",
  green: "#2D8F58",
  orange: "#F28E2B",
  cream: "#FBF8F2",
  white: "#FFFFFF",
  cloud: "#F4F8FF",
  slate: "#5D6B78",
  border: "#DAE3EC",
  mint: "#ECF8F2",
  sand: "#FFF2E3",
  rose: "#FBEAE6",
  paleBlue: "#D6E4FF"
};

const fonts = {
  regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  serif: "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
};

const shots = {
  login: path.join(shotsDir, "login-page.png"),
  overview: path.join(shotsDir, "overview-page.png"),
  repositories: path.join(shotsDir, "repositories-page.png"),
  deployments: path.join(shotsDir, "deployments-page.png"),
  approvals: path.join(shotsDir, "approvals-page.png")
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createDoc() {
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    bufferPages: false
  });
  doc.registerFont("regular", fonts.regular);
  doc.registerFont("bold", fonts.bold);
  doc.registerFont("serif", fonts.serif);
  return doc;
}

function bg(doc, color) {
  doc.save().rect(0, 0, PAGE.width, PAGE.height).fill(color).restore();
}

function topBar(doc, color = C.blue) {
  doc.save().rect(0, 0, PAGE.width, 12).fill(color).restore();
}

function footer(doc, page) {
  doc.font("regular").fontSize(9).fillColor(C.slate).text(String(page), PAGE.width - 56, PAGE.height - 28, {
    width: 18,
    align: "right"
  });
}

function header(doc, kicker, title, subtitle, page) {
  bg(doc, C.cream);
  topBar(doc);
  doc.font("bold").fontSize(10).fillColor(C.blue).text(kicker.toUpperCase(), 48, 24, {
    characterSpacing: 1.5
  });
  const titleX = 48;
  const titleY = 48;
  const titleWidth = 680;
  doc.font("serif").fontSize(24);
  const titleHeight = doc.heightOfString(title, { width: titleWidth });
  doc.fillColor(C.ink).text(title, titleX, titleY, { width: titleWidth });
  if (subtitle) {
    doc.font("regular").fontSize(11).fillColor(C.slate).text(subtitle, 48, titleY + titleHeight + 10, {
      width: 760
    });
  }
  doc.font("bold").fontSize(10).fillColor(C.slate).text("AutoOps", PAGE.width - 110, 24, {
    width: 62,
    align: "right"
  });
  footer(doc, page);
}

function roundedRect(doc, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  if (fill) doc.fillAndStroke(fill, stroke || fill);
  else if (stroke) doc.strokeColor(stroke).lineWidth(lineWidth).stroke();
  doc.restore();
}

function card(doc, x, y, w, h, opts = {}) {
  roundedRect(doc, x, y, w, h, 14, opts.fill || C.white, opts.stroke || C.border, opts.lineWidth || 1);
}

function cardText(doc, x, y, w, h, title, body, opts = {}) {
  card(doc, x, y, w, h, opts);
  doc.font("bold").fontSize(opts.titleSize || 13).fillColor(opts.titleColor || C.ink).text(title, x + 16, y + 14, {
    width: w - 32
  });
  doc.font("regular").fontSize(opts.bodySize || 10.8).fillColor(opts.bodyColor || C.slate).text(body, x + 16, y + 40, {
    width: w - 32,
    height: h - 52
  });
}

function chip(doc, x, y, label, fill, text = C.white) {
  const w = 18 + label.length * 6.2;
  roundedRect(doc, x, y, w, 24, 12, fill, fill);
  doc.font("bold").fontSize(9.5).fillColor(text).text(label, x, y + 7, {
    width: w,
    align: "center"
  });
  return w;
}

function bullets(doc, items, x, y, w, fontSize = 14, color = C.ink, gap = 10) {
  let cy = y;
  for (const item of items) {
    doc.save().circle(x + 4, cy + 8, 3).fill(color).restore();
    doc.font("regular").fontSize(fontSize).fillColor(color).text(item, x + 16, cy, {
      width: w - 16
    });
    cy = doc.y + gap;
  }
  return cy;
}

function arrow(doc, x1, y1, x2, y2, color = C.blue) {
  doc.save().strokeColor(color).lineWidth(2).moveTo(x1, y1).lineTo(x2, y2).stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 8;
  doc.moveTo(x2, y2)
    .lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
    .lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
    .fill(color);
  doc.restore();
}

function framedImage(doc, imagePath, x, y, w, h, label, tint) {
  card(doc, x, y, w, h, { fill: C.white, stroke: C.border, lineWidth: 1.2 });
  if (label) {
    chip(doc, x + 16, y - 14, label, tint || C.blue);
  }
  doc.image(imagePath, x + 12, y + 12, {
    fit: [w - 24, h - 24],
    align: "center",
    valign: "center"
  });
}

function cover(doc) {
  bg(doc, C.ink);
  doc.save().rect(640, -20, 360, 170).fillOpacity(0.96).fill(C.blue).restore();
  doc.save().rect(700, 420, 260, 100).fillOpacity(0.98).fill(C.orange).restore();
  doc.font("bold").fontSize(16).fillColor("#AACBFF").text("AUTOOPS", 52, 52, { characterSpacing: 2 });
  doc.font("serif").fontSize(30).fillColor(C.white).text("Self-Hosted CI/CD\nPlatform MVP", 52, 86, {
    width: 360
  });
  doc.font("regular").fontSize(15).fillColor("#D9E6F4").text(
    "A control plane for GitHub-triggered pipelines, Docker-based execution, deployment health, approvals, and rollback-safe operations.",
    52,
    192,
    { width: 360 }
  );
  let cx = 52;
  cx += chip(doc, cx, 292, "Express API", C.blue) + 10;
  cx += chip(doc, cx, 292, "Worker", C.teal) + 10;
  chip(doc, cx, 292, "React Dashboard", C.orange);
  cx = 52;
  cx += chip(doc, cx, 326, "Postgres", C.navy) + 10;
  cx += chip(doc, cx, 326, "Docker", C.green) + 10;
  chip(doc, cx, 326, "SSH + Managed Deploys", "#7B5634");
  framedImage(doc, shots.overview, 492, 52, 404, 266, "Dashboard", C.cyan);
  cardText(
    doc,
    516,
    350,
    348,
    108,
    "Why this project matters",
    "AutoOps consolidates build, test, deploy, approval, and recovery workflows into one operator-facing system.",
    { fill: "#F8F1E7", stroke: "#F8F1E7", titleColor: C.ink, bodyColor: C.slate }
  );
}

function slide2(doc) {
  header(doc, "Project Thesis", "What AutoOps is designed to solve", "A cleaner narrative for the project before the implementation detail.", 2);
  bullets(doc, [
    "AutoOps turns a GitHub push into a controlled CI/CD workflow that stays inside infrastructure the team owns.",
    "The product centralizes queueing, execution visibility, deployment state, healthchecks, and recovery instead of relying on fragmented scripts.",
    "The MVP is strongest where operations usually hurt: stage visibility, release traceability, approval gates, and rollback readiness.",
    "It supports both repository-defined pipelines and a managed import path for supported web applications."
  ], 56, 130, 520, 14.5, C.ink, 12);
  cardText(doc, 640, 136, 268, 86, "Core promise", "Push code. Track every stage. Deploy safely. Recover quickly.", {
    fill: C.cloud,
    stroke: C.paleBlue
  });
  cardText(doc, 640, 244, 268, 86, "Primary users", "Platform teams, operators, and self-hosted product teams that need more control.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
  cardText(doc, 640, 352, 268, 86, "Presentation angle", "Frame it as an operational platform foundation, not just a deployment dashboard.", {
    fill: C.sand,
    stroke: "#F0D5B4"
  });
}

function slide3(doc) {
  header(doc, "Capability Map", "What Phase 1 already includes", "The current repo covers the entire CI/CD loop, not just one slice of it.", 3);
  const cards = [
    ["GitHub Intake", "App installations, webhook validation, deduplication, repository syncing, and onboarding metadata.", C.cloud, C.paleBlue],
    ["Pipeline Config", "Per-repository .autoops/pipeline.yml with triggers, build settings, test commands, and deployment targets.", C.white, C.border],
    ["Execution Engine", "Queued runs, ordered stages, Docker build/test execution, image push, and per-target deployment.", C.white, C.border],
    ["Operations UI", "Overview, repositories, projects, runs, deployments, approvals, activity feeds, and rollback actions.", C.white, C.border],
    ["Recovery Controls", "Deployment revisions, automatic rollback, manual rollback, and protected-target promotion approvals.", C.sand, "#F0D5B4"],
    ["Managed Mode", "Supported imports for standalone Next.js, React, CRA, and static HTML applications.", C.mint, "#CEE7DB"]
  ];
  let i = 0;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const [title, body, fill, stroke] = cards[i++];
      cardText(doc, 56 + col * 286, 134 + row * 156, 258, 132, title, body, {
        fill,
        stroke
      });
    }
  }
}

function slide4(doc) {
  header(doc, "Architecture", "How the system is split up", "The repo has a clear separation between control plane, execution, product UI, and shared platform logic.", 4);
  cardText(doc, 56, 156, 140, 84, "GitHub", "Installations\nPush webhooks\nRepository access", { fill: C.cloud, stroke: C.paleBlue });
  cardText(doc, 230, 140, 184, 118, "apps/api", "Express control plane\nAuthentication\nProject and deployment APIs\nRepository analysis", { fill: C.white, stroke: C.border });
  cardText(doc, 230, 296, 184, 118, "apps/web", "React 19 dashboard\nOperator workflows\nRun and deployment views\nApprovals and activity", { fill: C.white, stroke: C.border });
  cardText(doc, 442, 140, 176, 118, "packages/core", "Shared types\nPipeline parsing\nSecurity helpers\nRollback logic", { fill: "#F5F8FC", stroke: C.border });
  cardText(doc, 442, 296, 176, 118, "packages/db", "Postgres schema\nRuns, targets, revisions\nSecrets, approvals, audit logs", { fill: "#F5F8FC", stroke: C.border });
  cardText(doc, 648, 140, 202, 118, "apps/worker", "Claims queued runs\nClones repos\nBuilds, tests, deploys\nHandles rollback and promotion", { fill: C.mint, stroke: "#CEE7DB" });
  cardText(doc, 648, 296, 202, 118, "Deployment targets", "SSH Compose hosts\nManaged VPS targets\nHealthcheck endpoints", { fill: C.sand, stroke: "#F0D5B4" });
  arrow(doc, 196, 198, 226, 198);
  arrow(doc, 414, 198, 438, 198);
  arrow(doc, 618, 198, 644, 198);
  arrow(doc, 322, 260, 322, 290, C.slate);
  arrow(doc, 530, 260, 530, 290, C.slate);
  arrow(doc, 748, 260, 748, 290, C.slate);
}

function slide5(doc) {
  header(doc, "Execution Flow", "From webhook to deployed revision", "This is the operational loop AutoOps automates end to end.", 5);
  const steps = [
    ["Push event", "GitHub emits a signed push webhook."],
    ["Validation", "API verifies headers and deduplicates the delivery."],
    ["Queueing", "Matching projects create queued runs with branch and SHA."],
    ["Prepare", "Worker clones the repo and resolves the pipeline config."],
    ["Build + test", "Docker image build and test commands run in sequence."],
    ["Deploy", "Image push, target deploy, healthcheck, revision record."]
  ];
  let x = 42;
  for (let i = 0; i < steps.length; i += 1) {
    cardText(doc, x, 188, 136, 128, steps[i][0], steps[i][1], {
      fill: i % 2 === 0 ? C.white : "#F8FAFF",
      stroke: C.border,
      titleSize: 12.5,
      bodySize: 10.3
    });
    if (i < steps.length - 1) arrow(doc, x + 136, 252, x + 148, 252);
    x += 150;
  }
  cardText(doc, 86, 370, 372, 86, "Persistent state", "Runs, stages, logs, delivery outcomes, targets, revisions, and approvals all land in Postgres for traceability.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
  cardText(doc, 504, 370, 372, 86, "Operator result", "The dashboard can immediately show what failed, where it failed, and what the next safe recovery action should be.", {
    fill: C.sand,
    stroke: "#F0D5B4"
  });
}

function slide6(doc) {
  header(doc, "Product UI", "Overview page for the operator", "The dashboard starts with the things that need attention first.", 6);
  framedImage(doc, shots.overview, 44, 126, 564, 336, "Overview", C.blue);
  cardText(doc, 650, 136, 254, 88, "What it shows", "Project count, running work, success rate, unhealthy targets, and pending approvals.", {
    fill: C.cloud,
    stroke: C.paleBlue
  });
  cardText(doc, 650, 246, 254, 104, "Why it matters", "The page is tuned for triage: latest failure, active work, and fast rerun access are all surfaced immediately.", {
    fill: C.white,
    stroke: C.border
  });
  cardText(doc, 650, 372, 254, 78, "Presentation message", "AutoOps behaves like an operational cockpit, not just a release history table.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
}

function slide7(doc) {
  header(doc, "Onboarding", "GitHub connection and repository discovery", "This is where AutoOps links source repositories to managed or custom deployment paths.", 7);
  cardText(doc, 48, 130, 238, 92, "GitHub integration", "The UI brings together OAuth connection, installation sync, repository inventory, and import actions in one workflow.", {
    fill: C.cloud,
    stroke: C.paleBlue
  });
  cardText(doc, 48, 238, 238, 96, "Managed import path", "Supported repos can be analyzed and imported directly into managed deployments when they match v1 constraints.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
  cardText(doc, 48, 350, 238, 98, "Version 1 boundary", "Managed mode targets standalone Next.js, React, CRA, and static HTML repositories. Monorepos stay on the custom-pipeline route.", {
    fill: C.sand,
    stroke: "#F0D5B4"
  });
  framedImage(doc, shots.repositories, 316, 126, 596, 344, "Repositories", C.teal);
}

function slide8(doc) {
  header(doc, "Deployment Ops", "Release state, target health, and rollback readiness", "The deployment view makes release safety concrete with revisions, approvals, and target-level status.", 8);
  framedImage(doc, shots.deployments, 44, 154, 572, 302, "Deployments", C.orange);
  cardText(doc, 650, 168, 256, 78, "Target state", "Each target keeps environment, protection status, promotion order, healthcheck URL, and deployment metadata.", {
    fill: C.cloud,
    stroke: C.paleBlue
  });
  cardText(doc, 650, 260, 256, 78, "Revision history", "Successful releases become deployment revisions with image references and digests, making rollback explicit.", {
    fill: C.white,
    stroke: C.border
  });
  cardText(doc, 650, 352, 256, 78, "Failure recovery", "If deployment health fails after a known-good revision exists, the worker can attempt automatic rollback.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
  cardText(doc, 650, 444, 256, 46, "Best talking point", "This view ties release history directly to recovery options.", {
    fill: C.rose,
    stroke: "#F1D4CD"
  });
}

function slide9(doc) {
  header(doc, "Governance", "Protected release approvals and traceability", "Approvals are first-class workflow objects, not comments pasted into chat.", 9);
  cardText(doc, 48, 130, 250, 88, "Approval model", "Protected promotions can require explicit approval before deployment work is queued.", {
    fill: C.cloud,
    stroke: C.paleBlue
  });
  cardText(doc, 48, 236, 250, 88, "Stored context", "Each record keeps requester, revision, source target, destination target, comments, and decision timestamps.", {
    fill: C.white,
    stroke: C.border
  });
  cardText(doc, 48, 342, 250, 88, "Why it matters", "Operators get a durable change trail for protected releases instead of relying on memory or side-channel approvals.", {
    fill: C.mint,
    stroke: "#CEE7DB"
  });
  framedImage(doc, shots.approvals, 328, 126, 584, 344, "Approvals", C.blue);
}

function slide10(doc) {
  bg(doc, C.ink);
  doc.save().rect(626, -24, 340, 160).fillOpacity(0.96).fill(C.blue).restore();
  doc.save().rect(690, 404, 240, 92).fillOpacity(0.98).fill(C.orange).restore();
  doc.font("serif").fontSize(25).fillColor(C.white).text("AutoOps is already\na real CI/CD story", 52, 52, {
    width: 360
  });
  bullets(doc, [
    "The repo demonstrates webhook intake, run orchestration, Docker build and test, deployment, health verification, and rollback.",
    "Its clean split between API, worker, UI, shared logic, and database layer makes the architecture easy to explain and easy to extend.",
    "The clearest next steps are broader framework support, richer deployment strategies, deeper observability, and stronger multi-environment workflows."
  ], 56, 170, 420, 14.2, "#E7EFF8", 12);
  framedImage(doc, shots.login, 540, 52, 340, 232, "Login", C.cyan);
  cardText(doc, 540, 322, 340, 106, "Closing line", "Present AutoOps as a platform foundation for trustworthy self-hosted delivery: controlled inputs, visible state, safe releases, and fast recovery.", {
    fill: "#1E3B58",
    stroke: "#1E3B58",
    titleColor: C.white,
    bodyColor: "#D7E4F2"
  });
  let cx = 56;
  cx += chip(doc, cx, 430, "Control plane", C.blue) + 10;
  cx += chip(doc, cx, 430, "Release safety", C.teal) + 10;
  chip(doc, cx, 430, "Rollback ready", C.orange);
  doc.font("serif").fontSize(18).fillColor("#BFD7FF").text("Build with control.\nDeploy with confidence.", 56, 458, {
    width: 260
  });
}

function build() {
  ensureDir(outFile);
  const doc = createDoc();
  const stream = fs.createWriteStream(outFile);
  doc.pipe(stream);

  cover(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide2(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide3(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide4(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide5(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide6(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide7(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide8(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide9(doc);
  doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, left: 0, right: 0, bottom: 0 } });
  slide10(doc);

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
