/**
 * Capture the MarkSnip "seam" Chrome Web Store gallery.
 *
 * Each panel is an authored HTML page in docs/store-screenshots/seam/.
 * We render it at 2x device scale and downscale to the exact store size with
 * a high-quality canvas pass, so thin seam lines and small mono code stay
 * crisp at the 640x400 thumbnail Google generates.
 *
 * Usage (from /src):
 *   node scripts/capture-seam-gallery.js                 # all present panels
 *   node scripts/capture-seam-gallery.js --only=panel-1  # one panel
 */

'use strict';

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const htmlDir = path.resolve(__dirname, '../../docs/store-screenshots/seam');
const outDir = path.join(htmlDir, 'out');

// file (in seam/) -> { w, h, out } at logical (1x) CSS pixels.
const SPECS = [
  { file: 'panel-1.html',      w: 1280, h: 800, out: '01-hero-seam.png' },
  { file: 'panel-2.html',      w: 1280, h: 800, out: '02-survives.png' },
  { file: 'panel-3.html',      w: 1280, h: 800, out: '03-destinations.png' },
  { file: 'panel-4.html',      w: 1280, h: 800, out: '04-reader.png' },
  { file: 'panel-5.html',      w: 1280, h: 800, out: '05-trust.png' },
  { file: 'promo-small.html',  w: 440,  h: 280, out: 'promo-small-tile.png' },
  { file: 'promo-marquee.html', w: 1400, h: 560, out: 'promo-marquee.png' }
];

const SCALE = 2;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].replace(/\.html$/, '') : null;

  const specs = SPECS
    .filter(s => fs.existsSync(path.join(htmlDir, s.file)))
    .filter(s => !only || s.file.startsWith(only));

  if (specs.length === 0) {
    console.log('No matching panels found to capture.');
    return;
  }

  console.log(`Capturing ${specs.length} panel(s) at ${SCALE}x -> downscaled.`);
  console.log(`Output: ${outDir}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ deviceScaleFactor: SCALE });

  try {
    for (const spec of specs) {
      await capture(context, spec);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  console.log('Done.');
}

async function capture(context, spec) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: spec.w, height: spec.h });
    const url = pathToFileURL(path.join(htmlDir, spec.file)).href;
    await page.goto(url, { waitUntil: 'load' });

    // Make sure the webfonts actually painted before we shoot.
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      geist: document.fonts.check('600 48px Geist'),
      mono: document.fonts.check('400 14px "JetBrains Mono"')
    }));
    if (!fonts.geist || !fonts.mono) {
      console.warn(`  ! ${spec.file}: webfont missing (Geist=${fonts.geist}, JetBrainsMono=${fonts.mono})`);
    }
    await page.waitForTimeout(350);

    const hi = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: spec.w, height: spec.h },
      animations: 'disabled'
    });

    const outPath = path.join(outDir, spec.out);
    await downscale(context, hi, spec.w, spec.h, outPath);
    console.log(`  Saved ${spec.out} (${spec.w}x${spec.h})`);
  } finally {
    await page.close().catch(() => {});
  }
}

// Downscale a 2x PNG buffer to exact w x h using Chromium's high-quality
// canvas resampling, then write the PNG to disk.
async function downscale(context, pngBuffer, w, h, outPath) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent('<!DOCTYPE html><meta charset="utf-8"><body style="margin:0">');
    const dataUrl = await page.evaluate(async ({ b64, w, h }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png');
    }, { b64: pngBuffer.toString('base64'), w, h });
    const data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  } finally {
    await page.close().catch(() => {});
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
