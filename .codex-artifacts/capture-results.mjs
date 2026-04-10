import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const webBaseUrl = process.env.WEB_BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), "../results-assets");

const captures = [
  {
    file: "overview-dashboard.png",
    route: "/",
    title: "Operational overview",
    waitForText: "Operational overview"
  },
  {
    file: "runs-failed-run-log.png",
    route: "/runs?run=run-201&tab=logs",
    title: "Pipeline run traceability",
    waitForText: "Dependency audit gate failed after a critical advisory was confirmed."
  },
  {
    file: "deployments-revision-ledger.png",
    route: "/deployments?target=target-preview",
    title: "Deployment revision ledger",
    waitForText: "Promote to Production"
  },
  {
    file: "activity-webhook-log.png",
    route: "/activity?kind=webhook&event=event-webhook-1",
    title: "Webhook event trace",
    waitForText: "Raw event context"
  },
  {
    file: "approvals-release-queue.png",
    route: "/approvals",
    title: "Protected release approval queue",
    waitForText: "Pending approvals"
  }
];

async function waitForVisibleText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    text,
    { timeout: 15_000 }
  );
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1560, height: 1080 },
    colorScheme: "light"
  });

  await context.addInitScript(() => {
    localStorage.setItem("autoops-token", "paper-token");
    localStorage.setItem("autoops-email", "researcher@autoops.local");
    localStorage.setItem("autoops-theme", "light");
  });

  const page = await context.newPage();

  for (const capture of captures) {
    await page.goto(`${webBaseUrl}${capture.route}`, { waitUntil: "domcontentloaded" });
    await waitForVisibleText(page, capture.waitForText);
    await page.waitForTimeout(600);
    const outputPath = path.join(outputDir, capture.file);
    await page.screenshot({ path: outputPath, fullPage: false });
    process.stdout.write(`Saved ${capture.title}: ${outputPath}\n`);
  }

  await browser.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
