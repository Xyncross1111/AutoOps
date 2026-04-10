const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:4173";
const outDir = path.resolve(__dirname, "../results-assets/screenshots");
fs.mkdirSync(outDir, { recursive: true });

async function prepareAuthedPage(page, route) {
  await page.addInitScript(() => {
    localStorage.setItem("autoops-token", "demo-token");
    localStorage.setItem("autoops-email", "maya@acme.dev");
    localStorage.setItem("autoops-theme", "light");
  });
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(outDir, "login-page.png"),
    fullPage: false
  });

  await page.close();

  const overview = await context.newPage();
  await prepareAuthedPage(overview, "/");
  await overview.screenshot({
    path: path.join(outDir, "overview-page.png"),
    fullPage: false
  });
  await overview.close();

  const repositories = await context.newPage();
  await prepareAuthedPage(repositories, "/repositories");
  await repositories.screenshot({
    path: path.join(outDir, "repositories-page.png"),
    fullPage: false
  });
  await repositories.close();

  const deployments = await context.newPage();
  await prepareAuthedPage(deployments, "/deployments?target=target_prod");
  await deployments.screenshot({
    path: path.join(outDir, "deployments-page.png"),
    fullPage: false
  });
  await deployments.close();

  const approvals = await context.newPage();
  await prepareAuthedPage(approvals, "/approvals");
  await approvals.screenshot({
    path: path.join(outDir, "approvals-page.png"),
    fullPage: false
  });
  await approvals.close();

  await browser.close();

  for (const file of fs.readdirSync(outDir)) {
    console.log(path.join(outDir, file));
  }
}

capture().catch((error) => {
  console.error(error);
  process.exit(1);
});
