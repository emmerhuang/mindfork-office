const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const dir = os.tmpdir();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto('http://localhost:3000');
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(5000);

  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  console.log('Canvas box:', JSON.stringify(box));

  // Canvas virtual: 1152x1536, rendered into box
  const CANVAS_W = 1152, CANVAS_H = 1536;
  const canvasAspect = CANVAS_W / CANVAS_H; // 0.75
  const boxAspect = box.width / box.height;
  let renderW, renderH, offsetX, offsetY;
  if (boxAspect > canvasAspect) {
    renderH = box.height;
    renderW = box.height * canvasAspect;
    offsetX = (box.width - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = box.width;
    renderH = box.width / canvasAspect;
    offsetX = 0;
    offsetY = (box.height - renderH) / 2;
  }

  function canvasToScreen(cx, cy) {
    return {
      x: box.x + offsetX + (cx / CANVAS_W) * renderW,
      y: box.y + offsetY + (cy / CANVAS_H) * renderH,
    };
  }

  console.log(`Render: ${renderW}x${renderH}, offset: ${offsetX},${offsetY}`);

  // Whiteboard: tiles x=4-8, y=1-3 => canvas 384-768, 96-288 => center at 576, 192
  const wb = canvasToScreen(576, 192);
  console.log(`Whiteboard center screen: ${Math.round(wb.x)}, ${Math.round(wb.y)}`);

  // Boss screen: tiles x=1-3, y=3-5 => canvas 96-288, 288-480 => center at 192, 384
  const bs = canvasToScreen(192, 384);
  console.log(`Boss screen center: ${Math.round(bs.x)}, ${Math.round(bs.y)}`);

  // Click whiteboard
  console.log('Clicking whiteboard...');
  await page.mouse.click(wb.x, wb.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'mf-wb-overlay.png') });

  // Close overlay if any by pressing escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Click boss screen
  console.log('Clicking boss screen...');
  await page.mouse.click(bs.x, bs.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'mf-boss-overlay.png') });

  // Close and test character OS click
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Character positions from officeData (homeTile * 96)
  // Sherlock: deskTile probably around col 2, row 5 area
  // Let me click various spots and check OS bubble
  // From the screenshots, characters are in the middle rows
  // TILE=96, Characters from officeData:
  // boss: deskTile {x:1,y:3}, secretary: {x:5,y:3}
  // sherlock: {x:2,y:5}, lego: {x:5,y:5}, vault: {x:8,y:5}
  // forge: {x:2,y:7}, lens: {x:5,y:7}, waffles: {x:8,y:7}

  // Click Sherlock (at desk x:2-4, y:5-6, character at ~x:3*96, y:5.5*96 = 288, 528)
  const sh = canvasToScreen(3 * 96, 5.5 * 96);
  console.log('Clicking Sherlock area...');
  await page.mouse.click(sh.x, sh.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'mf-os-sherlock.png') });

  // Click same spot again
  await page.mouse.click(sh.x, sh.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'mf-os-sherlock2.png') });

  // Click Lego
  const lg = canvasToScreen(6 * 96, 5.5 * 96);
  console.log('Clicking Lego area...');
  await page.mouse.click(lg.x, lg.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(dir, 'mf-os-lego.png') });

  console.log('Screenshots saved to ' + dir);
  await browser.close();
  console.log('Done!');
})();
