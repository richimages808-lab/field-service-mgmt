const puppeteer = require('puppeteer');
const path = require('path');

const targetUrl = 'https://maintenancemanager-c5533--test-qp47x9lo.web.app';
const screenshotPath = path.resolve('C:\\Users\\Rich\\.gemini\\antigravity\\brain\\ee21a14b-2956-4f7a-9f47-545118d3433a\\blank_screen_diagnose.png');

async function run() {
  console.log('🚀 Starting headless browser for blank screen diagnosis...');
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
    });

    page.on('requestfailed', request => {
      console.warn(`⚠️ [REQUEST FAILED]: ${request.url()} - ${request.failure().errorText}`);
    });

    console.log(`📡 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('📸 Capturing screenshot...');
    await page.screenshot({ path: screenshotPath });

    const title = await page.title();
    console.log(`📍 Page title: ${title}`);
    console.log(`📍 Page URL: ${page.url()}`);
    console.log(`📸 Saved screenshot to: ${screenshotPath}`);
  } catch (error) {
    console.error('❌ Diagnostic run failed:', error);
  } finally {
    console.log('🔒 Closing browser...');
    await browser.close();
  }
}

run();
