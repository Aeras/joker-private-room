const { chromium } = require(process.argv[2] || "playwright");
const fs = require("fs"),
  path = require("path"),
  assert = require("assert");
(async () => {
  const scratch = path.resolve(".test-tmp/canvas-game-dist");
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  const fixtureSource = fs
    .readFileSync("src/demo/canvasBrowserFixtureSource.ts", "utf8")
    .split("String.raw`")[1]
    .split("`;")[0];
  fs.writeFileSync(".test-tmp/canvas-game.tsx", fixtureSource);
  fs.writeFileSync(
    ".test-tmp/canvas-game.html",
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden"><div id="table-fullscreen-root"><div id="root"></div></div><script type="module" src="/canvas-game.tsx"></script></body></html>',
  );
  const { build } = await import("vite"),
    react = (await import("@vitejs/plugin-react")).default,
    tailwind = (await import("@tailwindcss/vite")).default;
  await build({
    configFile: false,
    root: path.resolve(".test-tmp"),
    plugins: [react(), tailwind()],
    resolve: { alias: { "@": path.resolve("src") } },
    publicDir: false,
    build: {
      outDir: scratch,
      emptyOutDir: true,
      rollupOptions: { input: path.resolve(".test-tmp/canvas-game.html") },
    },
  });
  const b = await chromium.launch({
    ...(process.env.CANVAS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.CANVAS_BROWSER_EXECUTABLE }
      : {}),
    headless: true,
  });

  const reports = [];
  for (const ruleset of ["popular", "classic", "minus"]) {
    for (const mode of ["HIGHER_SUIT", "SUIT_WINS", "COMPETE", "FROM_BELOW"]) {
      const follower = mode === "COMPETE" || mode === "FROM_BELOW";
      const context = await b.newContext({
        viewport: {
          width: ruleset === "minus" ? 568 : 844,
          height: ruleset === "minus" ? 320 : 390,
        },
        hasTouch: true,
        recordVideo:
          reports.length === 3 ? { dir: path.resolve(".test-tmp/phase-c-video") } : undefined,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        window.jokerPaints = [];
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          window.jokerPaints.push({
            url: args[0]?.src,
            alpha: this.globalAlpha,
            x: this.getTransform().e,
            y: this.getTransform().f,
            scale: this.getTransform().a,
          });
          if (window.jokerPaints.length > 10000) window.jokerPaints.shift();
          return draw.apply(this, args);
        };
        window.stages = [];
        document.addEventListener("DOMContentLoaded", () =>
          new MutationObserver(() => {
            const el = document.querySelector("[data-canvas-trick-stage]");
            if (el && !window.stages.includes(el.dataset.canvasTrickStage))
              window.stages.push(el.dataset.canvasTrickStage);
          }).observe(document.body, { attributes: true, subtree: true, childList: true }),
        );
      });
      await page.route("**/*", async (r) => {
        const u = new URL(r.request().url());
        let file =
          u.pathname === "/"
            ? path.resolve(".test-tmp/canvas-game-dist/canvas-game.html")
            : path.resolve(".test-tmp/canvas-game-dist", "." + u.pathname);
        if (!fs.existsSync(file)) file = path.resolve("public", "." + u.pathname);
        if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: "" });
        await r.fulfill({
          body: fs.readFileSync(file),
          contentType:
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".png": "image/png",
              ".webp": "image/webp",
              ".svg": "image/svg+xml",
            }[path.extname(file)] || "application/octet-stream",
        });
      });

      await page.goto(
        "http://fixture.test/?ruleset=" +
          ruleset +
          "&ack=1300&joker=" +
          (follower ? "follower" : "lead"),
      );
      await page.waitForFunction(() => window.fixtureReady?.());
      await page.waitForTimeout(800);
      const card = page.locator('[data-hand-card^="joker"]').locator("..");
      await card.press("Enter");
      await page.locator("[data-joker-choice-layer]").waitFor({ state: "attached" });
      assert.equal(
        await page.evaluate(() => window.fixtureCommands.length),
        0,
        "chooser cannot submit before choice",
      );
      assert.equal(
        await page.locator("[data-local-flight-card]").count(),
        0,
        "Joker stays in hand",
      );
      const option = follower
        ? page.getByRole("button", {
            name: mode === "FROM_BELOW" ? "Τζόκερ από κάτω" : "Τζόκερ από πάνω",
            exact: true,
          })
        : page.getByRole("button", {
            name: mode === "HIGHER_SUIT" ? "Θέλω μεγαλύτερο ατού" : "Παίρνουν Μπαστούνια",
            exact: false,
          });
      await option.tap();
      await page.waitForFunction(() => window.fixtureCommands.length === 1);
      assert.equal(await page.locator("[data-joker-choice-layer]").count(), 0);
      await page.locator('canvas[data-renderer="canvas"]').waitFor();
      await page.waitForTimeout(500);
      assert.equal(await page.locator("[data-local-flight-card]").count(), 1, "awaits authority");
      if (mode === "FROM_BELOW")
        assert.equal(
          await page.locator('canvas[data-renderer="canvas"]').evaluate((el) => el.style.zIndex),
          "0",
        );
      await page.locator("[data-local-flight-card]").waitFor({ state: "detached", timeout: 4000 });
      await page.waitForFunction(() => window.fixtureCompleted() >= 1, null, { timeout: 6000 });
      await page.waitForFunction(() => window.stages.includes("collecting"), null, {
        timeout: 6000,
      });
      await page.waitForTimeout(550);
      assert.equal(await page.evaluate(() => window.fixtureErrors.length), 0);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator("[data-trick-seat]").count(), 0, "no competing DOM card");
      const stages = await page.evaluate(() => window.stages);
      assert(stages.includes("stacking"));
      const paints = await page.evaluate(() => window.jokerPaints);
      assert(
        paints.some((p) => p.url?.includes("joker")),
        "actual Joker artwork drawn",
      );
      reports.push({ ruleset, mode, stages, draws: paints.length });
      await page.screenshot({ path: ".test-tmp/phase-c-" + ruleset + "-" + mode + ".png" });
      await context.close();
    }
  }
  await b.close();
  fs.writeFileSync(".test-tmp/phase-c-browser-results.json", JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
