import assert from "node:assert/strict";
import process from "node:process";

import { chromium, webkit } from "playwright";

const baseUrl = process.env.MEDIA_SMOKE_BASE_URL;
if (!baseUrl) throw new Error("MEDIA_SMOKE_BASE_URL is required");

const full = process.argv.includes("--full");
const audioMaterial = "material_tg_n1002993860753_358";
const secondAudioMaterial = "material_tg_n1002993860753_147";
const smallVideoMaterial = "material_tg_n1002993860753_319";
const largeVideoMaterial = "material_tg_n1002993860753_277";

function safeMediaRecord(response) {
  const request = response.request();
  const requestUrl = new URL(request.url());
  if (!requestUrl.pathname.startsWith("/media/")) return null;
  return response.allHeaders().then((headers) => ({
    method: request.method(),
    range: request.headers().range ?? null,
    status: response.status(),
    contentType: headers["content-type"] ?? null,
    contentLength: headers["content-length"] ?? null,
    contentRange: headers["content-range"] ?? null,
    acceptRanges: headers["accept-ranges"] ?? null,
    contentEncoding: headers["content-encoding"] ?? null,
  }));
}

async function attachEvidence(page, evidence) {
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) evidence.navigations.push(new URL(frame.url()).pathname);
  });
  page.on("requestfailed", (request) => {
    const requestUrl = new URL(request.url());
    evidence.failedRequests.push({
      kind: request.resourceType(),
      route: requestUrl.pathname.startsWith("/media/") ? "/media/:chat/:message/:index" : requestUrl.pathname,
      failure: request.failure()?.errorText ?? "unknown",
      range: request.headers().range ?? null,
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const recordPromise = safeMediaRecord(response);
    if (!recordPromise) return;
    void recordPromise.then((record) => {
      if (record) evidence.mediaResponses.push(record);
    });
  });
}

async function openPlayer(page, materialId, selector) {
  await page.goto(`${baseUrl}/materials/${materialId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator(selector).waitFor({ state: "attached", timeout: 20_000 });
  assert.equal(await page.getByText("Նյութը ժամանակավորապես չբացվեց").count(), 0);
  await page.locator(selector).evaluate((element) => {
    window.__mediaEvents = [];
    for (const name of ["loadstart", "loadedmetadata", "durationchange", "canplay", "playing", "pause", "waiting", "stalled", "seeking", "seeked", "error", "abort", "emptied"]) {
      element.addEventListener(name, () => {
        window.__mediaEvents.push({
          name,
          currentTime: element.currentTime,
          duration: Number.isFinite(element.duration) ? element.duration : null,
          readyState: element.readyState,
          networkState: element.networkState,
          errorCode: element.error?.code ?? null,
        });
      });
    }
  });
  await page.locator(selector).evaluate(async (element) => {
    await element.play();
  });
  await page.waitForFunction((css) => {
    const element = document.querySelector(css);
    return element && !element.paused && element.currentTime > 0.25;
  }, selector, { timeout: 30_000 });
}

async function waitForProgress(page, selector, seconds) {
  const start = await page.locator(selector).evaluate((element) => element.currentTime);
  await page.waitForFunction(({ css, target }) => {
    const element = document.querySelector(css);
    return element && element.currentTime >= target && !element.error;
  }, { css: selector, target: start + seconds }, { timeout: (seconds + 25) * 1_000 });
}

async function seekAndResume(page, selector, ratio) {
  const before = await page.locator(selector).evaluate((element) => ({ duration: element.duration, currentTime: element.currentTime }));
  assert.ok(Number.isFinite(before.duration) && before.duration > 1, "media duration must be available");
  const target = Math.min(before.duration - 0.5, Math.max(0.5, before.duration * ratio));
  await page.locator(selector).evaluate((element, nextTime) => { element.currentTime = nextTime; }, target);
  await page.waitForFunction(({ css, targetTime }) => {
    const element = document.querySelector(css);
    return element && Math.abs(element.currentTime - targetTime) < 3 && !element.seeking && !element.error;
  }, { css: selector, targetTime: target }, { timeout: 30_000 });
  await page.locator(selector).evaluate(async (element) => { await element.play(); });
  await waitForProgress(page, selector, 1.5);
}

async function pauseResume(page, selector) {
  await page.locator(selector).evaluate((element) => element.pause());
  await page.waitForFunction((css) => document.querySelector(css)?.paused === true, selector);
  await page.locator(selector).evaluate(async (element) => { await element.play(); });
  await waitForProgress(page, selector, 1);
}

async function runBrowser(name, browserType) {
  // Playwright's bundled Chromium has no H.264; set MEDIA_SMOKE_CHROMIUM_CHANNEL=chrome to test real videos.
  const channel = name === "chromium" ? process.env.MEDIA_SMOKE_CHROMIUM_CHANNEL : undefined;
  const browser = await browserType.launch({
    ...(channel ? { channel } : {}),
    headless: true,
    args: name === "chromium" ? ["--autoplay-policy=no-user-gesture-required"] : [],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const evidence = { browser: name, mediaResponses: [], failedRequests: [], navigations: [], pageErrors: [], consoleErrors: [], scenarios: [] };
  try {
    const audioPage = await context.newPage();
    await attachEvidence(audioPage, evidence);
    await openPlayer(audioPage, audioMaterial, "audio");
    await waitForProgress(audioPage, "audio", full ? 60 : 5);
    await seekAndResume(audioPage, "audio", 0.65);
    await seekAndResume(audioPage, "audio", 0.2);
    await pauseResume(audioPage, "audio");
    evidence.scenarios.push("audio-play-seek-pause-resume");

    const secondAudioPage = await context.newPage();
    await attachEvidence(secondAudioPage, evidence);
    await openPlayer(secondAudioPage, secondAudioMaterial, "audio");
    await waitForProgress(secondAudioPage, "audio", 2);
    evidence.scenarios.push("second-audio");

    const videoPage = await context.newPage();
    await attachEvidence(videoPage, evidence);
    await openPlayer(videoPage, smallVideoMaterial, "video");
    await waitForProgress(videoPage, "video", full ? 15 : 3);
    await seekAndResume(videoPage, "video", 0.5);
    evidence.scenarios.push("small-video-play-seek");

    const largeVideoPage = await context.newPage();
    await attachEvidence(largeVideoPage, evidence);
    await openPlayer(largeVideoPage, largeVideoMaterial, "video");
    await waitForProgress(largeVideoPage, "video", 2);
    await seekAndResume(largeVideoPage, "video", 0.5);
    evidence.scenarios.push("large-video-play-seek");

    await Promise.all([
      audioPage.locator("audio").evaluate(async (element) => { await element.play(); }),
      videoPage.locator("video").evaluate(async (element) => { await element.play(); }),
    ]);
    await Promise.all([waitForProgress(audioPage, "audio", 2), waitForProgress(videoPage, "video", 2)]);
    evidence.scenarios.push("parallel-audio-video");

    assert.equal(evidence.pageErrors.length, 0, `page errors: ${evidence.pageErrors.join(" | ")}`);
    assert.equal(evidence.consoleErrors.length, 0, `console errors: ${evidence.consoleErrors.join(" | ")}`);
    for (const page of context.pages()) {
      assert.equal(await page.getByText("Նյութը ժամանակավորապես չբացվեց").count(), 0, "route error boundary must remain absent");
    }
    return evidence;
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    evidence.routeErrorBoundaries = await Promise.all(context.pages().map(async (page) => ({
      route: new URL(page.url()).pathname,
      count: await page.getByText("Նյութը ժամանակավորապես չբացվեց").count().catch(() => -1),
    })));
    return evidence;
  } finally {
    await context.close();
    await browser.close();
  }
}

const results = [];
for (const [name, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  results.push(await runBrowser(name, browserType));
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.failure)) process.exitCode = 1;
