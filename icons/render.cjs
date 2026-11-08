// Simge PNG'lerini SVG'den üretir: node icons/render.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<style>body{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(__dirname, `icon-${s}.png`), omitBackground: true });
  }
  await b.close();
})();
