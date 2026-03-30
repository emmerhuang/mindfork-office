const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const dir = os.tmpdir();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 });

  await page.goto('http://localhost:3000');
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(6000);

  // Canvas: 1152x1536 virtual, rendered at ~780x1040 starting at x=570
  // Boss desk at tile(1,3)=(96,288) -> screen: 570+(96/1152)*780=635, 40+(288/1536)*1040=235
  // Boss character sits at desk, so around (635, 200-280)

  // Take wide crop of top working area
  await page.screenshot({ path: path.join(dir, 'mf-boss-close.png'), clip: { x: 610, y: 120, width: 200, height: 200 } });

  // Full 2x for reference
  await page.screenshot({ path: path.join(dir, 'mf-full-3x.png') });

  console.log('Done');
  await browser.close();
})();
