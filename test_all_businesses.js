const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://dispatch-box-sb.web.app';
const OUT_DIR = path.resolve('scratch/sandbox_audit/accounts');

const ACCOUNTS = [
  { name: '01_pacific_builders_admin', email: 'test@example.com', pass: 'test123456', role: 'Corporate Admin' },
  { name: '02_island_flow_dispatcher', email: 'dispatcher@test.com', pass: 'Test123!', role: 'Dispatcher' },
  { name: '03_aloha_air_tech', email: 'tech@test.com', pass: 'Test123!', role: 'Corporate Tech' },
  { name: '04_techwire_solo', email: 'solo@test.com', pass: 'Test123!', role: 'Solo Tech' },
  { name: '05_system_admin', email: 'rich@richheaton.com', pass: 'Admin2024!', role: 'System Admin' }
];

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const results = [];

  for (const acc of ACCOUNTS) {
    console.log(`\n========================================`);
    console.log(`Testing Account: ${acc.name} (${acc.email})`);
    console.log(`========================================`);

    // Fresh isolated browser context = isolated cookies, indexedDB, localStorage
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.toString()));

    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', acc.email);
      await page.type('input[type="password"]', acc.pass);
      await page.click('button[type="submit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));

      const landingUrl = page.url();
      const pageTitle = await page.title();
      const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
      
      const screenshotPath = path.join(OUT_DIR, `${acc.name}_dashboard.png`);
      await page.screenshot({ path: screenshotPath });

      console.log(`📍 Landed at: ${landingUrl}`);
      console.log(`📸 Screenshot saved: ${screenshotPath}`);

      results.push({
        account: acc.name,
        email: acc.email,
        landingUrl,
        pageTitle,
        hasError: errors.length > 0,
        errors: errors.slice(0, 2)
      });

    } catch (err) {
      console.error(`❌ Error testing ${acc.name}:`, err.message);
      results.push({ account: acc.name, email: acc.email, error: err.message });
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log('\n\n=== SUMMARY RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
}

run();
