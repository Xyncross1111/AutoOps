const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require(path.resolve(__dirname, "node_modules/pdfkit"));

const outFile = path.resolve(__dirname, "../results-assets/AutoOps-speaking-script-plain.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 54, left: 54, right: 54, bottom: 54 }
});

doc.registerFont("regular", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
doc.registerFont("bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf");

const text = `
AutoOps Presentation Speaking Script

Speaking split

Chaitali: Slides 1-3
Bhumika: Slides 4-5
Anas: Slides 6-8
Anshuman: Slides 9-10

Chaitali

Slide 1:
Good morning/afternoon. We’re presenting AutoOps, a self-hosted CI/CD platform MVP. The goal of this project is to give teams a single control plane for GitHub-triggered pipelines, deployment operations, approvals, and rollback handling.

Slide 2:
At a high level, AutoOps solves a common problem: CI/CD workflows are often spread across scripts, servers, and dashboards. AutoOps brings those pieces together into one system. It helps teams track every stage of a release, deploy safely, and recover quickly when something goes wrong.

Slide 3:
In Phase 1, the platform already covers the full delivery loop. It handles GitHub intake, pipeline configuration, execution, deployment operations, UI-based monitoring, and recovery controls. So this is not just a UI prototype, but a working operational foundation.

Handoff:
I’ll now hand it over to Bhumika, who will explain the architecture and how the execution flow works.

Bhumika

Slide 4:
The architecture is divided into clear layers. apps/api acts as the control plane, apps/worker executes the pipeline jobs, apps/web provides the operator dashboard, packages/core contains shared logic, and packages/db manages persistent state in Postgres. This separation makes the system easier to maintain and extend.

Slide 5:
The execution flow starts with a GitHub push event. The API validates and records the webhook, then creates a queued run. The worker picks up that run, prepares the repository, builds and tests the project, and finally deploys it. Throughout the process, AutoOps stores logs, stage states, and outcomes so operators always know what happened.

Handoff:
Next, Anas will show how the product looks from the operator’s point of view and how deployment management works.

Anas

Slide 6:
This overview screen is designed for operators. It highlights the most important metrics first, such as active runs, failed deployments, unhealthy targets, and pending approvals. Instead of digging through multiple tools, the operator gets an immediate picture of delivery health.

Slide 7:
This repositories view supports onboarding. Teams can connect GitHub, inspect repositories, and decide whether a project should follow a managed deployment path or a custom pipeline path. This makes AutoOps flexible enough for different project types while still keeping the workflow centralized.

Slide 8:
This deployment view is one of the strongest parts of the platform. It shows target health, deployment revisions, and rollback readiness. The important idea here is that each release is tied to a concrete deployment record, which makes failures traceable and rollback actions much safer.

Handoff:
I’ll now pass it to Anshuman for the governance side of the product and our final conclusion.

Anshuman

Slide 9:
This slide focuses on governance and traceability. AutoOps supports protected release approvals, so important promotions can require a decision before deployment continues. Each approval stores the requester, revision, source and destination targets, and comments, which creates a proper audit trail.

Slide 10:
To conclude, AutoOps already demonstrates the complete CI/CD lifecycle: webhook intake, run orchestration, build and test automation, deployment, health verification, approvals, and rollback. Our main takeaway is that AutoOps can be presented as a strong platform foundation for trustworthy self-hosted delivery.

Closing line:
Thank you. We’d be happy to answer any questions.

Short handoff lines

Chaitali to Bhumika:
Bhumika will now explain the system design and workflow.

Bhumika to Anas:
Anas will now walk through the product interface and deployment operations.

Anas to Anshuman:
Anshuman will finish with governance features and the final takeaway.
`.trim();

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

doc.font("bold").fontSize(16).fillColor("black").text("AutoOps Presentation Speaking Script");
doc.moveDown(1);
doc.font("regular").fontSize(11).fillColor("black").text(text, {
  align: "left",
  lineGap: 3
});

doc.end();

stream.on("finish", () => {
  console.log(outFile);
});

stream.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
