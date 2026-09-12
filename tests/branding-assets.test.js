import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

class Button {
  constructor(action) { this.dataset = { action }; this.onclick = null; }
}
const app = {
  html: "",
  buttons: [],
  set innerHTML(value) {
    this.html = value;
    this.buttons = [...value.matchAll(/data-action="([^"]+)"/g)].map((match) => new Button(match[1]));
  },
  querySelector(selector) {
    const action = selector.match(/data-action="([^"]+)"/)?.[1];
    return this.buttons.find((button) => button.dataset.action === action) || null;
  },
};
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
const { renderTitle } = await import("../js/ui.js");
renderTitle(0, { modes() {}, profile() {}, settings() {} });

assert.match(app.html, /<img[\s\S]*class="brand-logo"/);
assert.match(app.html, /src="\.\/assets\/branding\/wordstrike-logo\.webp"/);
assert.match(app.html, /alt="WORDSTRIKE"/);
assert.match(app.html, /width="360"[\s\S]*height="360"/);
assert.match(app.html, /decoding="async"/);
assert.match(app.html, /fetchpriority="high"/);
assert.match(app.html, /draggable="false"/);
assert.match(app.html, /<h1 class="sr-only">WORDSTRIKE<\/h1>/);
assert.doesNotMatch(app.html, /class="game-title"/);
for (const label of ["START", "Leaderboards", "Profile &amp; Stats", "Settings"]) {
  assert.ok(app.html.includes(label), `Title navigation label missing: ${label}`);
}

const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
assert.equal((ui.match(/class="brand-logo"/g) || []).length, 1);
assert.doesNotMatch(ui, /src="\/assets\//);

const css = await readFile(new URL("../style.css", import.meta.url), "utf8");
assert.match(css, /\.sr-only\s*\{[\s\S]*clip:\s*rect\(0, 0, 0, 0\)/);
assert.doesNotMatch(css, /\.brand-logo\s*\{/);

const titleCss = await readFile(new URL("../styles/screens/title.css", import.meta.url), "utf8");
assert.match(titleCss, /\.title-screen \.brand-logo\s*\{[\s\S]*pointer-events:\s*none/);
assert.match(titleCss, /\.title-screen \.brand-logo\s*\{[\s\S]*user-select:\s*none/);
assert.match(titleCss, /\.title-screen \.brand-logo\s*\{[\s\S]*-webkit-user-drag:\s*none/);
assert.match(titleCss, /@media \(max-height:\s*650px\) and \(min-width:\s*821px\)[\s\S]*\.title-screen \.brand-logo/);
assert.match(titleCss, /@media \(max-width:\s*820px\)[\s\S]*\.title-screen \.brand-logo/);
assert.match(titleCss, /@media \(max-width:\s*520px\)[\s\S]*\.title-screen \.brand-logo/);

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /rel="canonical" href="https:\/\/thiepn\.dev\/wordstrike\/"/);
assert.match(html, /property="og:url" content="https:\/\/thiepn\.dev\/wordstrike\/"/);
assert.match(html, /property="og:image" content="https:\/\/thiepn\.dev\/wordstrike\/assets\/branding\/wordstrike-logo\.png"/);
assert.match(html, /name="description" content="WORDSTRIKE/);
assert.match(html, /rel="icon" href="\.\/assets\/icons\/favicon\.ico" sizes="any"/);
assert.match(html, /rel="icon" type="image\/png" href="\.\/assets\/icons\/favicon-64\.png"/);
assert.match(html, /rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon\.png"/);
assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
assert.match(html, /href="\.\/manifest\.webmanifest"/);
assert.match(html, /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/);
assert.doesNotMatch(html, /href="\/assets\//);

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
assert.equal(manifest.id, "./");
assert.equal(manifest.name, "WORDSTRIKE");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.match(manifest.description, /local-first browser typing game/i);
assert.deepEqual(manifest.icons, [
  { src: "./assets/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "./assets/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "./assets/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
]);
for (const path of [
  "../assets/branding/wordstrike-logo.webp",
  "../assets/icons/favicon.ico",
  "../assets/icons/favicon-64.png",
  "../assets/icons/apple-touch-icon.png",
  "../assets/icons/icon-192.png",
  "../assets/icons/icon-512.png",
  "../assets/icons/icon-maskable-512.png",
  "../sw.js",
]) {
  await access(new URL(path, import.meta.url));
}

console.log("Main-menu branding, canonical metadata, favicons, PWA manifest/service-worker identity, responsive Title CSS, and relative assets passed.");