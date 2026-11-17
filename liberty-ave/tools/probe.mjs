// Debug helper: render one frame with full browser logging so scene errors are visible.
//   node tools/probe.mjs [frame] [comp]
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(path.join(root, "package.json"));
const { bundle } = await import(req.resolve("@remotion/bundler"));
const { renderStill, selectComposition, openBrowser } = await import(req.resolve("@remotion/renderer"));

const frame = Number(process.argv[2] ?? 0);
const compId = process.argv[3] ?? "liberty-ave-16x9";
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), onProgress: () => {} });
const chromiumOptions = { gl: process.env.CINE_GL ?? "swangle" };
const browser = await openBrowser("chrome", { browserExecutable: process.env.CINE_BROWSER, chromiumOptions });
browser.on("console", (m) => console.log("[console:" + m.type() + "]", m.text().slice(0, 400)));
browser.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 800)));
const dbg = process.argv[4] ?? "all";
const inputProps = { dbg };
const composition = await selectComposition({ serveUrl, id: compId, inputProps, puppeteerInstance: browser, chromiumOptions });
const out = path.join(root, "review", "probe.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
await renderStill({
  serveUrl,
  composition,
  frame,
  inputProps,
  output: out,
  puppeteerInstance: browser,
  chromiumOptions,
  overwrite: true,
  timeoutInMilliseconds: 180000,
  onBrowserLog: (l) => console.log("[browser:", l.type + "]", String(l.text).slice(0, 400)),
});
console.log("wrote", out);
await browser.close({ silent: true });
