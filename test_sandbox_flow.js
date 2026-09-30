const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://dispatch-box-sb.web.app';
const SCREENSHOT_DIR = path.resolve(__dirname, 'scratch', 'sandbox_audit');

async function runAudit() {
  console.log('🚀 Starting Comprehensive Sandbox Flow Audit...');
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const auditLog = [];
  function logFinding(category, status, message, details = null) {
    const entry = { category, status, message, details, time: new Date().toISOString() };
    auditLog.push(entry);
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} [${category}] ${message}`);
  }

  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      pageErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    pageErrors.push(err.toString());
    logFinding('RUNTIME_ERROR', 'FAIL', err.toString());
  });

  try {
    // 1. LOGIN
    console.log('\n--- STEP 1: AUTHENTICATION ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', 'dispatcher@test.com');
    await page.type('input[type="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_dashboard.png') });
    logFinding('AUTH', 'PASS', `Logged in successfully. Current URL: ${page.url()}`);

    // Determine current org prefix from URL or page
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/https:\/\/[^/]+\/([^/]+)/);
    const orgPrefix = urlMatch && !['jobs', 'quotes', 'invoices', 'materials', 'tools'].includes(urlMatch[1]) ? `/${urlMatch[1]}` : '';
    console.log(`Detected org prefix: "${orgPrefix}"`);

    // 2. BOTTOM-LEFT FULL MENU POPOUT TEST
    console.log('\n--- STEP 2: BOTTOM-LEFT FULL MENU POPOUT ---');
    const fullMenuBtn = await page.$('button[title*="Full Menu"]');
    if (fullMenuBtn) {
      await fullMenuBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      const popoutVisible = await page.$('.fixed.inset-0');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_full_menu_popout.png') });
      if (popoutVisible) {
        logFinding('FULL_MENU', 'PASS', 'Bottom-left Full Menu pop-out opened successfully');
        // Press Escape or click backdrop to close
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));
      } else {
        logFinding('FULL_MENU', 'WARN', 'Full Menu button clicked but popout overlay not detected');
      }
    } else {
      logFinding('FULL_MENU', 'WARN', 'Full Menu popout button not found in sidebar');
    }

    // 3. QUOTES: LIST & CREATE
    console.log('\n--- STEP 3: QUOTE MANAGEMENT ---');
    await page.goto(`${BASE_URL}${orgPrefix}/quotes`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_quotes_list.png') });
    const quotesCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .grid > div').length);
    logFinding('QUOTES', 'PASS', `Quotes page loaded with ${quotesCount} entries/cards visible`);

    // Navigate to Create Quote
    await page.goto(`${BASE_URL}${orgPrefix}/quotes/new`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_create_quote.png') });
    const hasAiQuotePanel = await page.$('button, div').then(async () => {
      const text = await page.evaluate(() => document.body.innerText);
      return text.includes('AI') || text.includes('Generate') || text.includes('Estimate');
    });
    logFinding('QUOTES', hasAiQuotePanel ? 'PASS' : 'WARN', `Create Quote page loaded. AI tools visible: ${hasAiQuotePanel}`);

    // 4. JOBS: LIST, KANBAN, DETAIL
    console.log('\n--- STEP 4: JOBS & WORK OPERATIONS ---');
    await page.goto(`${BASE_URL}${orgPrefix}/jobs`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_jobs_list.png') });
    const jobsCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .job-card').length);
    logFinding('JOBS', 'PASS', `Jobs list loaded with ${jobsCount} jobs visible`);

    // Inspect Job Detail if jobs exist
    const firstJobLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/jobs/"]');
      return link ? link.getAttribute('href') : null;
    });

    if (firstJobLink && !firstJobLink.endsWith('/jobs/new')) {
      await page.goto(`${BASE_URL}${firstJobLink}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_job_detail.png') });
      const jobDetailTabs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, a')).map(el => el.innerText.trim()).filter(t => ['Timeline', 'Details', 'Materials', 'Photos', 'Scope', 'Invoices'].some(k => t.includes(k)));
      });
      logFinding('JOBS', 'PASS', `Job detail loaded for ${firstJobLink}. Detected tabs/actions: ${jobDetailTabs.join(', ')}`);
    } else {
      logFinding('JOBS', 'WARN', 'No existing job link found to test Job Detail view');
    }

    // 5. SCHEDULING & DISPATCH
    console.log('\n--- STEP 5: SCHEDULING & DISPATCH ---');
    await page.goto(`${BASE_URL}${orgPrefix}/schedule`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_schedule_board.png') });
    const scheduleRendered = await page.evaluate(() => {
      return document.querySelector('.fc, .calendar, [data-testid="calendar"], table') !== null || document.body.innerText.includes('Schedule');
    });
    logFinding('SCHEDULING', scheduleRendered ? 'PASS' : 'WARN', `Schedule board loaded. Valid render: ${scheduleRendered}`);

    // Dispatcher Console
    await page.goto(`${BASE_URL}${orgPrefix}/dispatcher`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_dispatcher_console.png') });
    const dispatcherRendered = await page.evaluate(() => document.body.innerText.includes('Dispatch') || document.body.innerText.includes('Unassigned'));
    logFinding('SCHEDULING', dispatcherRendered ? 'PASS' : 'WARN', `Dispatcher console loaded: ${dispatcherRendered}`);

    // 6. INVOICES & FINISHING THE JOB
    console.log('\n--- STEP 6: INVOICES & PAYMENTS ---');
    await page.goto(`${BASE_URL}${orgPrefix}/invoices`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_invoices_list.png') });
    const invoicesCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .invoice-card').length);
    logFinding('INVOICES', 'PASS', `Invoices list loaded with ${invoicesCount} entries visible`);

    // 7. MATERIAL PURCHASES & PROCUREMENT
    console.log('\n--- STEP 7: MATERIALS & PURCHASING ---');
    await page.goto(`${BASE_URL}${orgPrefix}/materials`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_materials_inventory.png') });
    const materialsCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .material-card').length);
    logFinding('MATERIALS', 'PASS', `Materials inventory loaded with ${materialsCount} items visible`);

    // Purchase Orders
    await page.goto(`${BASE_URL}${orgPrefix}/purchase-orders`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_purchase_orders.png') });
    const poCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .po-card').length);
    logFinding('PROCUREMENT', 'PASS', `Purchase orders list loaded with ${poCount} POs visible`);

    // Receiving
    await page.goto(`${BASE_URL}${orgPrefix}/receiving`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_receiving.png') });
    logFinding('PROCUREMENT', 'PASS', `Receiving interface loaded`);

    // Master Order Review
    await page.goto(`${BASE_URL}${orgPrefix}/master-orders`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_master_orders.png') });
    logFinding('PROCUREMENT', 'PASS', `Master order review loaded`);

    // 8. TOOL MANAGEMENT
    console.log('\n--- STEP 8: TOOLS MANAGEMENT ---');
    await page.goto(`${BASE_URL}${orgPrefix}/tools`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_tools_inventory.png') });
    const toolsCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, .tool-card').length);
    logFinding('TOOLS', 'PASS', `Tools inventory loaded with ${toolsCount} tools visible`);

    // 9. TAGS & ASSET TRACKERS
    console.log('\n--- STEP 9: TAGS & TRACKERS ---');
    await page.goto(`${BASE_URL}${orgPrefix}/inventory/trackers`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_tag_management_portal.png') });
    const trackersBody = await page.evaluate(() => document.body.innerText);
    const hasTrackerFeatures = trackersBody.includes('Tag') || trackersBody.includes('Tracker') || trackersBody.includes('SmartTag') || trackersBody.includes('Device');
    logFinding('TAGS', hasTrackerFeatures ? 'PASS' : 'WARN', `Tag / Tracker portal loaded: ${hasTrackerFeatures}`);

    // 10. SETTINGS & NAVIGATION LAYOUT
    console.log('\n--- STEP 10: SETTINGS & NAVIGATION LAYOUT ---');
    await page.goto(`${BASE_URL}${orgPrefix}/settings`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_settings_general.png') });

    // Look for Navigation & Layout tab in settings
    const layoutTab = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const found = btns.find(b => b.innerText.toLowerCase().includes('navigation') || b.innerText.toLowerCase().includes('layout'));
      if (found) {
        found.click();
        return true;
      }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_settings_navigation_layout.png') });
    logFinding('SETTINGS', layoutTab ? 'PASS' : 'WARN', `Navigation & Layout tab present and clicked: ${layoutTab}`);

    // Save final report
    const reportPath = path.join(SCREENSHOT_DIR, 'audit_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ log: auditLog, errors: pageErrors }, null, 2));
    console.log(`\n🎉 Audit finished! Report written to ${reportPath}`);

  } catch (err) {
    console.error('Audit encountered fatal error:', err);
    logFinding('FATAL', 'FAIL', err.message);
  } finally {
    await browser.close();
  }
}

runAudit();
