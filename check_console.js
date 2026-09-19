const puppeteer = require('puppeteer');
const path = require('path');

const loginUrl = 'https://dispatch-box-sb.web.app/login';
const targetUrl = 'https://dispatch-box-sb.web.app/hitopplumbers/jobs';
const screenshotPath = path.resolve('scratch\\blank_screen_diagnose.png');

async function run() {
  console.log('🚀 Starting headless browser for diagnosis...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    page.on('console', msg => {
      console.log(`[PAGE LOG]: ${msg.text()}`);
    });

    page.on('pageerror', err => {
      console.error(`🔴 [PAGE RUNTIME ERROR]: ${err.toString()}`);
      if (err.stack) console.error(err.stack);
    });

    page.on('requestfailed', request => {
      console.warn(`⚠️ [REQUEST FAILED]: ${request.url()} - ${request.failure()?.errorText}`);
    });

    console.log(`📡 Logging in at ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', 'dispatcher@test.com');
    await page.type('input[type="password"]', 'Test123!');
    await page.click('button[type="submit"]');

    console.log('⏳ Waiting for auth navigation...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    console.log(`📡 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await new Promise(r => setTimeout(r, 2000));

    console.log('📸 Capturing screenshot...');
    await page.screenshot({ path: screenshotPath });

    const title = await page.title();
    console.log(`📍 Page title: ${title}`);
    console.log(`📍 Page URL: ${page.url()}`);
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log(`📍 Body HTML length: ${html.length}`);
    if (html.length < 500) {
      console.log(`📍 Body HTML: ${html}`);
    }
  } catch (error) {
    console.error('❌ Diagnostic run failed:', error);
  } finally {
    console.log('🔒 Closing browser...');
    await browser.close();
  }
}

run();
