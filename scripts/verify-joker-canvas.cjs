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
  for (const test of [
    { ruleset: "popular", w: 844, h: 390, ack: 900 },
    { ruleset: "classic", w: 844, h: 390, ack: 900 },
    { ruleset: "minus", w: 568, h: 320, ack: 900 },
    { ruleset: "popular", w: 844, h: 390, ack: 900, reject: true },
    { ruleset: "classic", w: 844, h: 390, ack: 900, reduced: true },
    { ruleset: "minus", w: 844, h: 390, ack: 900, cold: true },
    { ruleset: "popular", w: 844, h: 390, ack: 900, touch: true },
    { ruleset: "classic", w: 844, h: 390, ack: 900, recover: true },
  ]) {
    const context = await b.newContext({
      viewport: { width: test.w, height: test.h },
      hasTouch: Boolean(test.touch),
      reducedMotion: test.reduced ? "reduce" : "no-preference",
      recordVideo:
        reports.length === 0
          ? { dir: path.resolve(".test-tmp/canvas-video"), size: { width: 844, height: 390 } }
          : undefined,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.canvasOps = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        const m = this.getTransform();
        window.canvasOps.push({
          url: args[0]?.src,
          w: args[0]?.naturalWidth,
          args: args.slice(1),
          matrix: [m.a, m.b, m.c, m.d, m.e, m.f],
          alpha: this.globalAlpha,
          canvas: [this.canvas.width, this.canvas.height],
        });
        if (window.canvasOps.length > 64) window.canvasOps.shift();
        return original.apply(this, args);
      };
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
        test.ruleset +
        "&ack=" +
        test.ack +
        (test.reject ? "&reject=1" : ""),
    );
    await page.waitForFunction(() => window.fixtureReady?.(), { timeout: 15000 });
    await page.waitForTimeout(800);
    assert.equal(await page.locator("[data-hand-card]").count(), 3);
    if (test.cold) await page.evaluate(() => window.fixtureCold());
    if (test.touch) {
      const card = await page.locator("[data-hand-card]").first().boundingBox();
      const x = card.x + card.width / 2,
        y = Math.min(test.h - 15, card.y + card.height * 0.25);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 4; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - step * 20 }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else await page.locator("[data-hand-card]").first().locator("..").dblclick();
    await page.waitForFunction(() => window.fixtureCommands.length === 1);
    const command = await page.evaluate(() => window.fixtureCommands[0]);
    const cardId = command.command.cardId;
    if (!test.cold) {
      await page.locator('canvas[data-renderer="canvas"]').waitFor({ state: "attached" });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const bitmap = await page.locator('canvas[data-renderer="canvas"]').evaluate((el) => {
        const ctx = el.getContext("2d"),
          data = ctx.getImageData(0, 0, el.width, el.height).data;
        let pixels = 0,
          colored = 0;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i + 3] > 20) {
            pixels++;
            if (
              Math.max(data[i], data[i + 1], data[i + 2]) -
                Math.min(data[i], data[i + 1], data[i + 2]) >
              30
            )
              colored++;
          }
        }
        return { pixels, colored, width: el.width, height: el.height };
      });
      if (bitmap.pixels <= 100) {
        await page.screenshot({ path: ".test-tmp/canvas-game-empty.png" });
        console.log(
          JSON.stringify({
            bitmap,
            ops: await page.evaluate(() => window.canvasOps),
            bounds: await page.locator("canvas").boundingBox(),
            errors,
          }),
        );
      }
      assert(bitmap.pixels > 100, "bitmap must be actually painted");
      if (!test.reduced) assert(bitmap.colored > 5, "artwork must not be a blank white card");
      await page.evaluate(() => window.fixturePoll());
      await page.waitForTimeout(350);
      if (!test.reduced) {
        const ops = await page.evaluate(() => window.canvasOps);
        const ys = ops.map((o) => o.matrix[5]);
        assert(
          Math.max(...ys) - Math.min(...ys) > (test.touch ? 1 : 30),
          "pixels must actually travel from hand to table",
        );
        assert(
          ops.every((o) => o.alpha === 1),
          "normal flight remains opaque",
        );
      }
      assert.equal(
        await page.locator('canvas[data-renderer="canvas"]').count(),
        1,
        "landed Canvas must wait for authority",
      );
      assert.equal(
        await page.locator('[data-trick-seat="0"]').count(),
        0,
        "no duplicate canonical card",
      );
      if (test.ruleset === "popular" && !test.reject)
        await page.screenshot({ path: ".test-tmp/canvas-game-landed.png" });
      if (test.reject) {
        await page.locator('[data-canvas-phase="returning"]').waitFor({ state: "attached" });
      }
      if (test.recover) {
        await page.setViewportSize({ width: 800, height: 370 });
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.waitForTimeout(80);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page
          .locator("canvas")
          .evaluate((element) => element.dispatchEvent(new Event("contextlost")));
        assert.equal(await page.locator("canvas").count(), 0);
        assert.equal(await page.locator("[data-local-flight-card]").count(), 1);
      }
      await page
        .locator('canvas[data-renderer="canvas"]')
        .waitFor({ state: "detached", timeout: 3000 });
      if (test.recover)
        await page
          .locator("[data-local-flight-card]")
          .waitFor({ state: "detached", timeout: 3000 });
      reports.push({ test, bitmap, command });
    } else {
      assert.equal(await page.locator("canvas").count(), 0);
      await page.waitForTimeout(1400);
      reports.push({ test, command });
    }
    if (test.reject) {
      assert.equal(await page.locator("[data-hand-card]").count(), 3);
      assert.equal(await page.locator('[data-trick-seat="0"]').count(), 0);
    } else {
      assert.equal(await page.locator("[data-hand-card]").count(), 2);
      assert.equal(await page.locator('[data-trick-seat="0"]').count(), 1);
      if (test.recover) {
        await page.evaluate(() => window.fixtureRemount());
        await page.waitForTimeout(150);
        assert.equal(
          await page.locator("canvas").count(),
          0,
          "remount must not replay historical local flight",
        );
        assert.equal(await page.locator('[data-trick-seat="0"]').count(), 1);
      }
      await page.waitForTimeout(1600);
      assert.equal(
        await page.evaluate(() => window.fixtureErrors.length),
        0,
        "canonical bot turns must remain legal",
      );
    }
    assert.equal(await page.evaluate(() => window.fixtureCommands.length), 1);
    assert.equal(errors.length, 0, errors.join("\n"));
    assert(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    await page.screenshot({
      path:
        ".test-tmp/canvas-game-" +
        test.ruleset +
        "-" +
        (test.reject ? "reject" : test.cold ? "cold" : test.reduced ? "reduced" : "accepted") +
        ".png",
    });
    await context.close();
  }
  await b.close();
  fs.writeFileSync(".test-tmp/canvas-game-results.json", JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
