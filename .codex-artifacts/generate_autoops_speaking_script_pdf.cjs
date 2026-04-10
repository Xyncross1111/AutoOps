const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require(path.resolve(__dirname, "node_modules/pdfkit"));

const outFile = path.resolve(__dirname, "../results-assets/AutoOps-speaking-script.pdf");

const fonts = {
  regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  serif: "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
};

const C = {
  ink: "#102133",
  blue: "#2E68FF",
  slate: "#5D6B78",
  cream: "#FBF8F2",
  white: "#FFFFFF",
  border: "#DAE3EC",
  mint: "#ECF8F2",
  sand: "#FFF2E3",
  cloud: "#F4F8FF",
  rose: "#FBEAE6"
};

const sections = [
  {
    speaker: "Chaitali",
    slides: "Slides 1-3",
    fill: C.cloud,
    intro: "Opening, project goal, and phase 1 capabilities.",
    points: [
      "Slide 1: Good morning/afternoon. We’re presenting AutoOps, a self-hosted CI/CD platform MVP. The goal of this project is to give teams a single control plane for GitHub-triggered pipelines, deployment operations, approvals, and rollback handling.",
      "Slide 2: At a high level, AutoOps solves a common problem: CI/CD workflows are often spread across scripts, servers, and dashboards. AutoOps brings those pieces together into one system. It helps teams track every stage of a release, deploy safely, and recover quickly when something goes wrong.",
      "Slide 3: In Phase 1, the platform already covers the full delivery loop. It handles GitHub intake, pipeline configuration, execution, deployment operations, UI-based monitoring, and recovery controls. So this is not just a UI prototype, but a working operational foundation.",
      "Handoff: I’ll now hand it over to Bhumika, who will explain the architecture and how the execution flow works."
    ]
  },
  {
    speaker: "Bhumika",
    slides: "Slides 4-5",
    fill: C.mint,
    intro: "Architecture and execution workflow.",
    points: [
      "Slide 4: The architecture is divided into clear layers. apps/api acts as the control plane, apps/worker executes the pipeline jobs, apps/web provides the operator dashboard, packages/core contains shared logic, and packages/db manages persistent state in Postgres. This separation makes the system easier to maintain and extend.",
      "Slide 5: The execution flow starts with a GitHub push event. The API validates and records the webhook, then creates a queued run. The worker picks up that run, prepares the repository, builds and tests the project, and finally deploys it. Throughout the process, AutoOps stores logs, stage states, and outcomes so operators always know what happened.",
      "Handoff: Next, Anas will show how the product looks from the operator’s point of view and how deployment management works."
    ]
  },
  {
    speaker: "Anas",
    slides: "Slides 6-8",
    fill: C.sand,
    intro: "Dashboard walkthrough, onboarding, and deployment operations.",
    points: [
      "Slide 6: This overview screen is designed for operators. It highlights the most important metrics first, such as active runs, failed deployments, unhealthy targets, and pending approvals. Instead of digging through multiple tools, the operator gets an immediate picture of delivery health.",
      "Slide 7: This repositories view supports onboarding. Teams can connect GitHub, inspect repositories, and decide whether a project should follow a managed deployment path or a custom pipeline path. This makes AutoOps flexible enough for different project types while still keeping the workflow centralized.",
      "Slide 8: This deployment view is one of the strongest parts of the platform. It shows target health, deployment revisions, and rollback readiness. The important idea here is that each release is tied to a concrete deployment record, which makes failures traceable and rollback actions much safer.",
      "Handoff: I’ll now pass it to Anshuman for the governance side of the product and our final conclusion."
    ]
  },
  {
    speaker: "Anshuman",
    slides: "Slides 9-10",
    fill: C.rose,
    intro: "Governance, approvals, and final conclusion.",
    points: [
      "Slide 9: This slide focuses on governance and traceability. AutoOps supports protected release approvals, so important promotions can require a decision before deployment continues. Each approval stores the requester, revision, source and destination targets, and comments, which creates a proper audit trail.",
      "Slide 10: To conclude, AutoOps already demonstrates the complete CI/CD lifecycle: webhook intake, run orchestration, build and test automation, deployment, health verification, approvals, and rollback. Our main takeaway is that AutoOps can be presented as a strong platform foundation for trustworthy self-hosted delivery.",
      "Closing line: Thank you. We’d be happy to answer any questions."
    ]
  }
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function makeDoc() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, left: 52, right: 52, bottom: 48 }
  });
  doc.registerFont("regular", fonts.regular);
  doc.registerFont("bold", fonts.bold);
  doc.registerFont("serif", fonts.serif);
  return doc;
}

function header(doc) {
  doc.save().rect(0, 0, doc.page.width, 16).fill(C.blue).restore();
  doc.moveDown(0.3);
  doc.font("bold").fontSize(11).fillColor(C.blue).text("AUTOOPS PRESENTATION SCRIPT", {
    characterSpacing: 1.4
  });
  doc.moveDown(0.4);
  doc.font("serif").fontSize(24).fillColor(C.ink).text("Speaking Points for 4 Presenters");
  doc.moveDown(0.35);
  doc.font("regular").fontSize(11).fillColor(C.slate).text(
    "Presenter order: Chaitali, Bhumika, Anas, Anshuman. This handout gives a clear script and handoff line for each person."
  );
  doc.moveDown(0.8);
}

function summary(doc) {
  const x = doc.x;
  const y = doc.y;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 78;
  doc.save().roundedRect(x, y, w, h, 12).fillAndStroke(C.cloud, C.border).restore();
  doc.font("bold").fontSize(13).fillColor(C.ink).text("Speaking split", x + 16, y + 14);
  doc.font("regular").fontSize(11).fillColor(C.ink);
  doc.text("Chaitali: Slides 1-3", x + 16, y + 36);
  doc.text("Bhumika: Slides 4-5", x + 180, y + 36);
  doc.text("Anas: Slides 6-8", x + 338, y + 36);
  doc.text("Anshuman: Slides 9-10", x + 480, y + 36);
  doc.y = y + h + 16;
}

function sectionCard(doc, section) {
  const x = doc.x;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startY = doc.y;

  doc.save().roundedRect(x, startY, w, 34, 12).fillAndStroke(section.fill, C.border).restore();
  doc.font("bold").fontSize(15).fillColor(C.ink).text(section.speaker, x + 16, startY + 10);
  doc.font("bold").fontSize(10).fillColor(C.slate).text(section.slides, x + w - 120, startY + 12, {
    width: 100,
    align: "right"
  });
  doc.y = startY + 44;
  doc.font("regular").fontSize(11).fillColor(C.slate).text(section.intro);
  doc.moveDown(0.55);

  for (const point of section.points) {
    const bulletX = x + 4;
    const textX = x + 18;
    const pointY = doc.y;
    doc.save().circle(bulletX, pointY + 7, 2.6).fill(C.blue).restore();
    doc.font("regular").fontSize(11).fillColor(C.ink).text(point, textX, pointY, {
      width: w - 22
    });
    doc.moveDown(0.45);
  }

  doc.moveDown(0.35);
}

async function build() {
  ensureDir(outFile);
  const doc = makeDoc();
  const stream = fs.createWriteStream(outFile);
  doc.pipe(stream);

  header(doc);
  summary(doc);

  sections.forEach((section, index) => {
    if (index > 0 && doc.y > 640) {
      doc.addPage();
      header(doc);
    }
    sectionCard(doc, section);
  });

  doc.moveDown(0.4);
  doc.font("bold").fontSize(13).fillColor(C.ink).text("Short handoff lines");
  doc.moveDown(0.3);
  doc.font("regular").fontSize(11).fillColor(C.ink).text("Chaitali to Bhumika: Bhumika will now explain the system design and workflow.");
  doc.moveDown(0.25);
  doc.text("Bhumika to Anas: Anas will now walk through the product interface and deployment operations.");
  doc.moveDown(0.25);
  doc.text("Anas to Anshuman: Anshuman will finish with governance features and the final takeaway.");

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
