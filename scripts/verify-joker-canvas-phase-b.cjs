const { chromium } = require(process.argv[2] || "playwright"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert");
(async () => {
  const scratch = path.resolve(".test-tmp/canvas-phase-b-dist");
  fs.writeFileSync(
    ".test-tmp/canvas-phase-b.tsx",
    fs
      .readFileSync("src/demo/canvasPhaseBFixtureSource.ts", "utf8")
      .split("String.raw`")[1]
      .split("`;")[0],
  );
  fs.writeFileSync(
    ".test-tmp/canvas-phase-b.html",
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden"><div id="table-fullscreen-root"><div id="root"></div></div><script type="module" src="/canvas-phase-b.tsx"></script></body></html>',
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
      rollupOptions: { input: path.resolve(".test-tmp/canvas-phase-b.html") },
    },
  });
  const browser = await chromium.launch({
      headless: true,
      ...(process.env.CANVAS_BROWSER_EXECUTABLE
        ? { executablePath: process.env.CANVAS_BROWSER_EXECUTABLE }
        : {}),
    }),
    reports = [];
  try {
    for (const test of [
      { ruleset: "popular", viewer: 0 },
      { ruleset: "classic", viewer: 1 },
      { ruleset: "minus", viewer: 3 },
      { ruleset: "popular", viewer: 0, nine: true },
      { ruleset: "minus", viewer: 2, nine: true },
      { ruleset: "classic", viewer: 0, nine: true },
      { ruleset: "popular", viewer: 0, dom: true },
      { ruleset: "classic", viewer: 0, w: 1280, h: 720 },
    ]) {
      const context = await browser.newContext({
        viewport: {
          width: test.w ?? (test.viewer === 2 ? 568 : 844),
          height: test.h ?? (test.viewer === 2 ? 320 : 390),
        },
        recordVideo:
          reports.length === 0
            ? { dir: path.resolve(".test-tmp/canvas-phase-b-video") }
            : undefined,
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ dom }) => {
          window.canvasDraws = [];
          window.domDealFallback = false;
          document.addEventListener("DOMContentLoaded", () => {
            const observer = new MutationObserver(() => {
              if (document.querySelector("[data-deal-traveling-card]"))
                window.domDealFallback = true;
            });
            observer.observe(document.body, { childList: true, subtree: true });
          });
          window.canvasBudget = { surfaces: 0, bytes: 0 };
          const original = CanvasRenderingContext2D.prototype.drawImage;
          CanvasRenderingContext2D.prototype.drawImage = function (...args) {
            const m = this.getTransform();
            window.canvasDraws.push({
              name: this.canvas.dataset.canvasPresentation,
              x: m.e,
              y: m.f,
              url: args[0].src,
              alpha: this.globalAlpha,
            });
            if (window.canvasDraws.length > 8000) window.canvasDraws.shift();
            const surfaces = [...document.querySelectorAll("canvas")];
            window.canvasBudget.surfaces = Math.max(window.canvasBudget.surfaces, surfaces.length);
            window.canvasBudget.bytes = Math.max(
              window.canvasBudget.bytes,
              surfaces.reduce((total, c) => total + c.width * c.height * 4, 0),
            );
            return original.apply(this, args);
          };
          if (dom) globalThis.CanvasRenderingContext2D = undefined;
        },
        { dom: Boolean(test.dom) },
      );
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        let file =
          url.pathname === "/"
            ? path.join(scratch, "canvas-phase-b.html")
            : path.join(scratch, "." + url.pathname);
        if (!fs.existsSync(file)) file = path.resolve("public", "." + url.pathname);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        await route.fulfill({
          body: fs.readFileSync(file),
          contentType:
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".png": "image/png",
              ".svg": "image/svg+xml",
              ".webp": "image/webp",
            }[path.extname(file)] || "application/octet-stream",
        });
      });
      await page.goto(
        "http://fixture.test/?ruleset=" +
          test.ruleset +
          "&viewer=" +
          test.viewer +
          (test.nine ? "&nine=1" : ""),
      );
      try {
        if (!test.nine && !test.dom) {
          await page
            .locator('[data-canvas-presentation="dealer-selection"]')
            .waitFor({ timeout: 10000 });
          assert.equal(
            await page.locator("[data-hand-card]").count(),
            0,
            "concealed hand cannot appear in dealer ritual",
          );
        }
        if (test.dom)
          await page.locator("[data-deal-traveling-card]").first().waitFor({ timeout: 15000 });
        else await page.locator('[data-canvas-presentation="deal"]').waitFor({ timeout: 15000 });
        await page.waitForFunction(() => window.phaseB.phase === "DECLARATION", null, {
          timeout: 30000,
        });
        if (!test.dom)
          await page.locator('[data-canvas-presentation="hand"]').waitFor({ timeout: 5000 });
        await page.waitForTimeout(800);
        const data = await page.evaluate(() => {
          window.phaseB.flush();
          return {
            ...window.phaseB,
            draws: window.canvasDraws,
            budget: window.canvasBudget,
            domDealFallback: window.domDealFallback,
            handCenters: [...document.querySelectorAll("[data-hand-card]")].map((el) => {
              const rect = el.parentElement.getBoundingClientRect();
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }),
            events: JSON.parse(localStorage.getItem("joker:timing-diagnostics:v1") ?? "[]"),
          };
        });
        assert.deepEqual(data.errors, []);
        if (!test.dom)
          assert.equal(
            data.domDealFallback,
            false,
            "warmed Canvas deal must not silently fall back mid-handoff",
          );
        assert.deepEqual(errors, []);
        assert.deepEqual(
          data.acks,
          test.nine && test.ruleset !== "classic" ? ["initial", "remaining"] : ["full"],
        );
        const dealDraws = data.draws.filter((d) => d.name === "deal");
        if (!test.dom) assert(dealDraws.length > 10);
        assert(
          dealDraws.every((d) => d.url.includes("blue_back")),
          "dealing never displays opponent faces",
        );
        if (!test.dom)
          assert(
            dealDraws.some((d) => Math.abs(d.x - dealDraws[0].x) > 60),
            "dealt cards must really travel",
          );
        if (!test.nine && !test.dom) assert(data.draws.some((d) => d.name === "dealer-selection"));
        if ((!test.nine || test.ruleset === "classic") && !test.dom)
          assert(data.draws.some((d) => d.name === "trump"));
        assert.equal(await page.locator("[data-hand-card]").count(), test.nine ? 9 : 1);
        if (!test.dom) {
          const painted = data.draws
            .filter((draw) => draw.name === "hand")
            .slice(-data.handCenters.length);
          assert.equal(painted.length, data.handCenters.length);
          for (let i = 0; i < painted.length; i++) {
            assert(!painted[i].url.includes("blue_back"), "revealed hand must finish face up");
            assert(
              Math.abs(painted[i].x - data.handCenters[i].x) < 1 &&
                Math.abs(painted[i].y - data.handCenters[i].y) < 1,
              "input targets must follow the visible Canvas cards",
            );
          }
        }
        if (!test.dom)
          assert.equal(
            await page.locator("[data-deal-traveling-card]").count(),
            0,
            "DOM flight ownership must be absent",
          );
        if (!test.dom)
          assert(
            await page.evaluate(() =>
              [...document.querySelectorAll("[data-hand-card]")].every(
                (el) => getComputedStyle(el).visibility === "hidden",
              ),
            ),
            "DOM cards are input overlays, not visible duplicates",
          );
        await page.locator("[data-hand-card]").first().locator("..").press("Enter");
        const afterFocus = await page.evaluate(() =>
          [...document.querySelectorAll("[data-hand-card]")].map((el) => {
            const r = el.parentElement.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }),
        );
        for (let i = 0; i < afterFocus.length; i++)
          assert(
            Math.abs(afterFocus[i].x - data.handCenters[i].x) < 1 &&
              Math.abs(afterFocus[i].y - data.handCenters[i].y) < 1,
            "keyboard focus must not scroll a clipped hand away from its Canvas",
          );
        assert.equal(await page.evaluate(() => window.phaseB.commits.length), 1);
        await page.screenshot({
          path: ".test-tmp/canvas-phase-b-" + test.ruleset + (test.nine ? "-nine" : "") + ".png",
        });
        await page.setViewportSize({ width: 800, height: 370 });
        await page.evaluate(() => window.phaseB.resize());
        await page.waitForTimeout(300);
        assert(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight,
          ),
        );
        reports.push({
          test,
          acks: data.acks,
          selectionCount: data.selectionCount,
          budget: data.budget,
          metrics: data.events
            .filter((e) => e.event === "canvas_presentation_motion_complete")
            .map((e) => e.details),
        });
      } catch (e) {
        console.log({ test, errors, state: await page.evaluate(() => window.phaseB) });
        await page.screenshot({ path: ".test-tmp/canvas-phase-b-failure.png" });
        throw e;
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(".test-tmp/canvas-phase-b-results.json", JSON.stringify(reports, null, 2));
  console.log(
    reports.map((r) => ({
      test: r.test,
      acks: r.acks,
      selectionCount: r.selectionCount,
      budget: r.budget,
    })),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
