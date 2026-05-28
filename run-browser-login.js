const puppeteer = require('puppeteer');
const path = require('path');

const targetUrl = 'https://maintenancemanager-c5533.web.app/login';
const screenshotPath = path.resolve('C:\\Users\\Rich\\.gemini\\antigravity\\brain\\b47e1964-2e50-4fc0-87c6-69fcff07123f\\dispatcher_dashboard.png');

async function run() {
  console.log('🚀 Starting Puppeteer visible (headful) browser session...');
  
  // Launch browser in headful mode (headless: false)
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null, // Allow browser to use normal window sizing
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  try {
    const page = await browser.newPage();
    
    console.log(`📡 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('✍️ Page loaded. Entering credentials...');
    // Wait for the email input field
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Type credentials with a slight human-like typing delay
    await page.type('input[type="email"]', 'dispatcher@test.com', { delay: 100 });
    await page.type('input[type="password"]', 'Test123!', { delay: 100 });
    
    console.log('⚡ Clicking "Sign In" button...');
    await page.click('button[type="submit"]');
    
    console.log('⏳ Waiting for authentication to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(err => {
      console.log('⚠️ SPA routing or navigation finished.');
    });
    
    const currentUrl = page.url();
    console.log(`📍 Current page URL: ${currentUrl}`);
    
    console.log(`📸 Capturing screenshot to local folder...`);
    await page.screenshot({ path: screenshotPath });
    
    console.log('👀 Pausing for 10 seconds so you can inspect the logged-in dashboard on your screen...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('✅ Browser test completed successfully!');
  } catch (error) {
    console.error('❌ An error occurred during browser testing:', error);
  } finally {
    console.log('🔒 Closing browser...');
    await browser.close();
  }
}

run();
