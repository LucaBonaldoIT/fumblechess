// Renders the social preview image and app icons into public/ using headless Chrome.
//   npm run brand            (set CHROME_PATH if Chrome is not in a standard location)
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('Chrome not found: set CHROME_PATH');

const browser = await puppeteer.launch({ executablePath, headless: 'new' });
const page = await browser.newPage();

// Social preview, 1200x630 (Open Graph / Twitter large card)
await page.setViewport({ width: 1200, height: 630 });
await page.goto(pathToFileURL(resolve(root, 'scripts/brand/og.html')).href, {
  waitUntil: 'networkidle0',
});
await page.screenshot({ path: resolve(pub, 'og-image.png'), type: 'png' });

// Icons: the rounded favicon for "any" icons, a full-bleed square for the iOS home screen (iOS rounds it itself)
const svg = (rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="14"' : ''} fill="#b02e0c"/>
  <g fill="#fff" transform="${rounded ? '' : 'translate(32 32) scale(0.82) translate(-32 -32)'}">
    <rect x="20" y="12" width="6" height="10"/><rect x="29" y="12" width="6" height="10"/><rect x="38" y="12" width="6" height="10"/>
    <rect x="20" y="21" width="24" height="6"/><path d="M25 27h14l2 14H23z"/>
    <rect x="18" y="40" width="28" height="5"/><rect x="15" y="45" width="34" height="7" rx="1.5"/>
  </g>
</svg>`;
for (const [file, size, rounded] of [
  ['favicon-32.png', 32, true],
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(rounded)}`,
  );
  await page.screenshot({ path: resolve(pub, file), type: 'png', omitBackground: rounded });
}

await browser.close();
console.log(
  'wrote og-image.png, favicon-32.png, icon-192.png, icon-512.png, apple-touch-icon.png in public/',
);
