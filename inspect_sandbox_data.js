const puppeteer = require('puppeteer');

async function inspect() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log(`[PAGE LOG]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PAGE ERROR]: ${err}`));

  console.log('Logging in as rich@richheaton.com...');
  await page.goto('https://dispatch-box-sb.web.app/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'rich@richheaton.com');
  await page.type('input[type="password"]', 'Admin2024!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  console.log('Navigating to /platform/organizations...');
  await page.goto('https://dispatch-box-sb.web.app/platform/organizations', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  const orgs = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.bg-white, table tr, a[href*="platform/organizations/"]'));
    return {
      title: document.title,
      textSnippet: document.body.innerText.slice(0, 1500)
    };
  });

  console.log('Organizations on dispatch-box-sb:\n', orgs.textSnippet);
  await browser.close();
}

inspect();
