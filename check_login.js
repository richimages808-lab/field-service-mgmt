const puppeteer = require('puppeteer');
const path = require('path');

const targetUrl = 'https://maintenancemanager-c5533--test-qp47x9lo.web.app/login';
const screenshotPath = path.resolve('C:\\Users\\Rich\\.gemini\\antigravity\\brain\\ee21a14b-2956-4f7a-9f47-545118d3433a\\dispatcher_dashboard.png');

async function run() {
  console.log('🚀 Starting Puppeteer browser session for login check...');
  
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
    
    console.log('✍️ Page loaded. Entering credentials...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.type('input[type="email"]', 'dispatcher@test.com');
    await page.type('input[type="password"]', 'Test123!');
    
    console.log('⚡ Clicking "Sign In" button...');
    await page.click('button[type="submit"]');
    
    console.log('⏳ Waiting for authentication navigation...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(err => {
      console.log('⚠️ SPA routing or navigation finished.');
    });
    
    // Additional wait for any active Firestore snapshots/auth state loadings
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const currentUrl = page.url();
    console.log(`📍 Current page URL: ${currentUrl}`);
    
    console.log(`📸 Capturing post-login dashboard screenshot...`);
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Saved screenshot to: ${screenshotPath}`);
    
    console.log('✅ Browser test completed successfully!');
  } catch (error) {
    console.error('❌ An error occurred during browser testing:', error);
  } finally {
    console.log('🔒 Closing browser...');
    await browser.close();
  }
}

run();
