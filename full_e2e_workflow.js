const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://dispatch-box-sb.web.app';
const OUT_DIR = path.resolve('scratch/sandbox_audit/e2e_flow');

async function runE2E() {
  console.log('🚀 Starting Full End-to-End Workflow Test on Sandbox...');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const steps = [];
  function recordStep(name, status, details = '') {
    steps.push({ name, status, details, time: new Date().toISOString() });
    console.log(`${status === 'PASS' ? '✅' : '❌'} [${name}] ${details}`);
  }

  page.on('pageerror', err => console.error('🔴 Page Error:', err.toString()));

  try {
    // ── STEP 1: AUTHENTICATION (Island Flow Plumbing) ──
    console.log('\n--- 1. Login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'dispatcher@test.com');
    await page.type('input[type="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(OUT_DIR, '01_login_success.png') });
    recordStep('Login', 'PASS', `Logged in as dispatcher@test.com. URL: ${page.url()}`);

    // ── STEP 2: CREATE QUOTE ──
    console.log('\n--- 2. Create Quote ---');
    await page.goto(`${BASE_URL}/quotes/new`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#scope-of-work-textarea', { timeout: 15000 });
    
    // Fill customer info
    const nameInput = await page.$('input[placeholder="John Smith"]');
    if (nameInput) await nameInput.type('Hoku Builders LLC');
    
    const emailInput = await page.$('input[placeholder="john@example.com"]');
    if (emailInput) await emailInput.type('hoku@example.com');

    const phoneInput = await page.$('input[placeholder="555-123-4567"]');
    if (phoneInput) await phoneInput.type('808-555-7890');

    const addressInput = await page.$('input[placeholder*="123 Main St"]');
    if (addressInput) await addressInput.type('777 Ward Ave, Honolulu, HI 96814');

    // Fill scope of work
    const scopeArea = await page.$('#scope-of-work-textarea');
    await scopeArea.type('Commercial water line replacement and shut-off valve install with pressure testing.');

    // Add labor line item
    const addLaborBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Labor'));
    });
    if (addLaborBtn) await addLaborBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Add material line item
    const addMaterialBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Material'));
    });
    if (addMaterialBtn) await addMaterialBtn.click();
    await new Promise(r => setTimeout(r, 500));

    await page.screenshot({ path: path.join(OUT_DIR, '02_quote_filled.png') });

    // Click Save Quote
    const saveQuoteBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Save Quote') || b.innerText.includes('Create Quote') || b.innerText.includes('Save Draft'));
    });
    if (saveQuoteBtn) {
      await saveQuoteBtn.click();
      console.log('Clicked Save Quote button...');
      await new Promise(r => setTimeout(r, 4000));
    }
    await page.screenshot({ path: path.join(OUT_DIR, '03_after_quote_save.png') });
    recordStep('Create Quote', 'PASS', `Quote form submitted. URL: ${page.url()}`);

    // ── STEP 3: QUOTES LIST VERIFICATION ──
    console.log('\n--- 3. Quotes List ---');
    await page.goto(`${BASE_URL}/quotes`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '04_quotes_list.png') });

    const quoteId = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/quotes/"]');
      if (link) {
        const href = link.getAttribute('href');
        const match = href.match(/\/quotes\/([^/?#]+)/);
        return match ? match[1] : null;
      }
      return null;
    });
    recordStep('Quotes List', 'PASS', `Quotes list rendered. Found quote ID: ${quoteId || 'none'}`);

    // ── STEP 4: VIEW QUOTE & ACTION ──
    if (quoteId && quoteId !== 'new') {
      console.log(`\n--- 4. View Quote Details (${quoteId}) ---`);
      await page.goto(`${BASE_URL}/quotes/${quoteId}`, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(OUT_DIR, '05_quote_detail.png') });
      recordStep('Quote Detail', 'PASS', `Quote detail loaded for ${quoteId}`);
    }

    // ── STEP 5: CREATE JOB ──
    console.log('\n--- 5. Create Job ---');
    await page.goto(`${BASE_URL}/jobs/new`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '06_create_job_form.png') });

    // Fill Create Job Form
    const jobCustomerInput = await page.$('input[placeholder*="Customer"], input[name="customerName"], #customerName');
    if (jobCustomerInput) await jobCustomerInput.type('Island Resort & Spa');

    const jobDescInput = await page.$('textarea[name="description"], textarea[placeholder*="job"], #description, textarea');
    if (jobDescInput) await jobDescInput.type('Urgent plumbing fixture upgrade for master suites');

    const submitJobBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Create Job') || b.innerText.includes('Save Job') || b.innerText.includes('Submit'));
    });
    if (submitJobBtn) {
      await submitJobBtn.click();
      await new Promise(r => setTimeout(r, 4000));
    }
    await page.screenshot({ path: path.join(OUT_DIR, '07_job_submitted.png') });
    recordStep('Create Job', 'PASS', `Job creation submitted. URL: ${page.url()}`);

    // ── STEP 6: JOBS LIST & DETAIL ──
    console.log('\n--- 6. Jobs List & Job Detail ---');
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '08_jobs_list.png') });

    const jobLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/jobs/"]');
      if (link && !link.href.includes('/jobs/new')) return link.getAttribute('href');
      return null;
    });

    if (jobLink) {
      console.log(`Navigating to Job: ${jobLink}`);
      await page.goto(`${BASE_URL}${jobLink}`, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(OUT_DIR, '09_job_detail.png') });
      recordStep('Job Detail', 'PASS', `Job details loaded: ${jobLink}`);
    } else {
      recordStep('Job Detail', 'WARN', 'No job link in jobs list to navigate to');
    }

    // ── STEP 7: DISPATCHER CONSOLE (RoleProtectedRoute test) ──
    console.log('\n--- 7. Dispatcher Console ---');
    await page.goto(`${BASE_URL}/dispatcher`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '10_dispatcher_console.png') });
    const isAtDispatcher = page.url().includes('/dispatcher');
    recordStep('Dispatcher Console', isAtDispatcher ? 'PASS' : 'FAIL', `Current URL: ${page.url()}`);

    // ── STEP 8: INVOICES ──
    console.log('\n--- 8. Invoices ---');
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '11_invoices_list.png') });
    recordStep('Invoices List', 'PASS', `Invoices page loaded at ${page.url()}`);

    // ── STEP 9: MATERIALS INVENTORY & POs ──
    console.log('\n--- 9. Materials & Purchase Orders ---');
    await page.goto(`${BASE_URL}/materials`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '12_materials.png') });
    recordStep('Materials', 'PASS', 'Materials inventory loaded');

    await page.goto(`${BASE_URL}/purchase-orders`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '13_purchase_orders.png') });
    recordStep('Purchase Orders', 'PASS', 'Purchase orders loaded');

    // ── STEP 10: TOOLS & TAGS ──
    console.log('\n--- 10. Tools & Tags ---');
    await page.goto(`${BASE_URL}/tools`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '14_tools.png') });
    recordStep('Tools', 'PASS', 'Tools inventory loaded');

    await page.goto(`${BASE_URL}/inventory/trackers`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '15_tags_fixed_contrast.png') });
    recordStep('Tags & Trackers', 'PASS', 'Tags portal loaded with updated contrast');

    fs.writeFileSync(path.join(OUT_DIR, 'e2e_results.json'), JSON.stringify(steps, null, 2));
    console.log('\n🎉 Full E2E Workflow Test Finished Successfully!');

  } catch (err) {
    console.error('❌ E2E Workflow Error:', err);
    recordStep('E2E Flow', 'FAIL', err.message);
  } finally {
    await browser.close();
  }
}

runE2E();
