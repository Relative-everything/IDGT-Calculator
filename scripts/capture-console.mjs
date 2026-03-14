import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => {
    console.log('PAGE LOG>', msg.type(), msg.text());
  });

  await page.goto('http://localhost:5174/IDGT-Calculator/');
  await page.waitForLoadState('networkidle');

  // Click Calculate button
  await page.click('button:has-text("Calculate")');

  // Allow time for calculations and logging
  await page.waitForTimeout(1200);

  await browser.close();
})();
