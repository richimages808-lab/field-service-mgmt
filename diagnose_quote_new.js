const puppeteer = require('puppeteer');
const path = require('path');

async function test() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log(`[PAGE LOG]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PAGE ERROR]: ${err}`));

  console.log('Logging in...');
  await page.goto('https://dispatch-box-sb.web.app/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'dispatcher@test.com');
  await page.type('input[type="password"]', 'Test123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  console.log('Navigating to /quotes/new...');
  await page.goto('https://dispatch-box-sb.web.app/quotes/new', { waitUntil: 'networkidle2' });
  
  console.log('Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  const hasForm = await page.evaluate(() => {
    return {
      hasSpinner: !!document.querySelector('.animate-spin'),
      hasScope: !!document.querySelector('#scope-of-work-textarea'),
      hasCustomerField: !!document.querySelector('input[placeholder*="123 Main St"]'),
      bodyTextSnippet: document.body.innerText.slice(0, 300)
    };
  });
  console.log('Result:', JSON.stringify(hasForm, null, 2));

  await page.screenshot({ path: path.resolve('scratch/sandbox_audit/04_create_quote_5s.png') });
  await browser.close();
}

test();
