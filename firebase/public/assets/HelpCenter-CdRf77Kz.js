import{j as e,X as C,h as y,E as S,ct as j,x as P,o as D,U as R,P as E,F as M,C as N,cK as U,cL as F,cM as b,t as W,f as O,g as Q,aq as z}from"./ui-BXbKA1Ii.js";import{r as s}from"./vendor-DJjfIQIo.js";import{k as L,q as B,l as H,t as V}from"./firebase-C4qWKBT2.js";import{u as G,d as J}from"./index-Cl63X3Zf.js";const f=[{id:"getting-started",name:"Getting Started",icon:"Rocket",description:"First steps with DispatchBox"},{id:"jobs",name:"Jobs & Scheduling",icon:"Calendar",description:"Creating and managing service jobs"},{id:"communications",name:"Communications Hub",icon:"MessageSquare",description:"Unified inbox for all customer inquiries"},{id:"invoicing",name:"Invoicing & Quotes",icon:"FileText",description:"Billing your customers"},{id:"inventory",name:"Inventory",icon:"Package",description:"Materials and tools tracking"},{id:"customers",name:"Customers & Portal",icon:"Users",description:"Customer management and self-service portal"},{id:"addons",name:"Add-on Services",icon:"Puzzle",description:"Domain, Email, SMS, and AI Phone"},{id:"reports",name:"Reports & Analytics",icon:"BarChart2",description:"Business insights and data"},{id:"account",name:"Account & Billing",icon:"CreditCard",description:"Your plan, profile, and billing"}],Y=[{id:"gs-first-login",title:"Your First Login",category:"getting-started",content:`After signing up, you'll land on your dashboard. Here's what to do first:

1. **Complete your profile** ── Click your avatar in the top-right corner and select "Your Profile" to add your photo, phone number, and details.

2. **Set up your organization** ── Go to Organization Settings to add your company logo, set your primary color theme, and configure your email prefix.

3. **Explore the dashboard** ── Your dashboard shows today's jobs, upcoming appointments, and key business metrics at a glance.`,lastUpdated:"2026-03-11",keywords:["login","first","start","setup","begin","new"]},{id:"gs-onboarding-preferences-sync",title:"Simplified Onboarding & Bidirectional Sync",category:"getting-started",content:`When you sign up for DispatchBox, you are guided through a simplified, high-fidelity onboarding setup designed to get you operating instantly.

**What is configured during onboarding:**
1. **Standard Shift Hours** ── Configure your daily work hours (e.g., 08:00 AM to 05:00 PM). This instantly establishes the timeline limits for your dispatcher console and solopreneur calendars.
2. **Home Base / Dispatch Address** ── Set your shop, office, or home location. The AI route optimizer uses this as the starting anchor for all technician routes.
3. **Sales Tax Rate (%)** ── Configure your regional sales tax. This becomes the default rate applied to all quotes and invoices.
4. **Service Area ZIP Codes** ── Specify the target zip codes you service. DispatchBox auto-provisions your initial "Primary Service Area" zone instantly.
5. **Solopreneur Focus Areas** ── (For Individual Plans) Select your trade skills and certifications to auto-provision your field technician profile.

**Bidirectional Syncing (Always Updated):**
Any configuration entered during onboarding is saved directly to your core operational settings. You can edit these values later inside **Organization Settings (Financials)**, **Scheduling Preferences (Route)**, or **Service Zones** dashboards. Editing them inside these modules automatically propagates back to your company profile in real-time, ensuring a single source of truth across the entire app.`,lastUpdated:"2026-05-28",keywords:["onboarding","signup","sync","tax","address","shift","operating hours","preferences","zip codes","skills"]},{id:"gs-create-first-job",title:"Creating Your First Job",category:"getting-started",content:`To create a new service job:

1. Click **"New Job"** in the navigation bar.
2. Select or create a customer.
3. Fill in the job details: title, description, priority, and estimated duration.
4. Set the scheduled date and time.
5. Assign a technician (or leave unassigned for dispatch later).
6. Click **"Create Job"** to save.

The job will appear on your calendar and the assigned technician's schedule immediately.`,lastUpdated:"2026-03-11",keywords:["job","create","new","service","work order"]},{id:"gs-add-customers",title:"Adding Customers",category:"getting-started",content:`You can add customers in two ways:

**From the Contacts page:**
1. Navigate to **Contacts** in the sidebar.
2. Click **"Add Customer"**.
3. Fill in their name, email, phone, and address.

**While creating a job:**
1. In the New Job form, type a customer name.
2. If they don't exist, click **"Create new customer"**.
3. Fill in their details inline.

Customers automatically get access to the Customer Portal where they can view their jobs, invoices, and communicate with you.`,lastUpdated:"2026-03-11",keywords:["customer","client","add","contact","new"]},{id:"gs-navigation",title:"Navigating the App",category:"getting-started",content:`DispatchBox uses a **left sidebar** for navigation, organized into logical groups:

**Sidebar Sections:**
- **Work** â€” Dashboard, Jobs (work orders list), Calendar, Dispatch Console, and Kanban board.
- **Financial** â€” Invoices, Quotes, and Purchase Orders.
- **Inventory** â€” Materials and Tools tracking.
- **People** â€” Customers and Technicians.

**Key Features:**
- **New Job Button** â€” The prominent blue "+ New Job" button at the top of the sidebar lets you create jobs instantly.
- **Collapse/Expand** â€” Click the "Collapse" button at the bottom to shrink the sidebar to a slim icon rail for more screen space. Click again to expand.
- **Reports, Settings & Help** â€” Always visible at the bottom of the sidebar.

**Top Bar:**
- Shows your current page as a breadcrumb.
- Notification bell, Help icon, and your profile dropdown are on the right.
- Click your avatar for Profile, Organization Settings, Add-ons, and Sign Out.

**Mobile:** On phones and tablets, tap the hamburger menu (â˜°) in the top-left to open the sidebar as a slide-out drawer.`,lastUpdated:"2026-04-21",keywords:["navigate","menu","sidebar","find","where","collapse","expand","jobs"]},{id:"gs-customer-inquiries",title:"Customer Inquiries Dashboard",category:"getting-started",content:`When a visitor submits a service request through your **public website portal**, it appears instantly on your Admin Dashboard as a **Customer Inquiry**.\\n\\n**Where to Find Them:**\\nInquiries appear at the very top of the Corporate Admin Dashboard â€” above KPI cards and charts â€” so you never miss a lead.\\n\\n**Each Inquiry Shows:**\\n- Customer name, phone, email, and address\\n- Their service description\\n- Urgency badge (Normal or Emergency with pulse animation)\\n- Time since submission (e.g., "12 minutes ago")\\n- Whether they match an existing customer in your system\\n\\n**Quick Actions on Each Inquiry:**\\n1. **ðŸ“ž Call** â€” One-tap dial link to the customer's phone number.\\n2. **ðŸ“§ Send Quote** â€” Automatically creates a draft job and takes you straight to the Quote Builder with all customer details pre-filled.\\n3. **ðŸŽ« Create Job** â€” Creates a job record from the inquiry and opens the job detail page.\\n4. **ðŸ‘¤ Add Customer** â€” Takes you to the Contacts page with the customer's name, phone, email, and address auto-filled.\\n5. **âœ… Dismiss** â€” Marks the inquiry as acknowledged (not deleted â€” preserved for audit).\\n\\n**KPI Card:**\\nThe 4th KPI card on the dashboard shows the live count of pending inquiries with an amber highlight when there are active leads.\\n\\n**Tips:**\\n- Respond within 15 minutes for best conversion rates.\\n- Emergency requests show a red pulsing badge â€” prioritize these.\\n- The "Send Quote" button is the fastest path from lead to revenue.`,lastUpdated:"2026-04-14",keywords:["inquiry","inquiries","portal","lead","customer request","website","booking","ticket","pending","dashboard"]},{id:"jobs-calendar",title:"Using the Calendar",category:"jobs",content:`The Calendar view shows all scheduled jobs in a visual timeline.

**Views:** Switch between Day, Week, and Month views using the buttons at the top.

**Drag & Drop:** Drag jobs to reschedule them to different times or dates.

**Color Coding:** Jobs are color-coded by status â€” blue (scheduled), yellow (in progress), green (completed), red (cancelled).

**Quick Create:** Click any empty time slot to create a new job at that time.`,lastUpdated:"2026-03-11",keywords:["calendar","schedule","drag","drop","view","day","week","month"]},{id:"jobs-status",title:"Job Statuses Explained",category:"jobs",content:`Jobs progress through these statuses:

- **Pending** â€” Created but not yet scheduled or assigned.
- **Scheduled** â€” Has a date/time and assigned technician.
- **In Progress** â€” Technician has started work on-site.
- **Completed** â€” Work finished and signed off by customer.
- **Cancelled** â€” Job was cancelled.
- **On Hold** â€” Temporarily paused (waiting for parts, customer decision, etc.).

Technicians can update status from their mobile dashboard. Admins can change any job's status from the job detail page.`,lastUpdated:"2026-03-11",keywords:["status","pending","scheduled","progress","completed","cancelled"]},{id:"jobs-dispatch",title:"Dispatcher Console",category:"jobs",content:`The Dispatcher Console (available on Small Business and Enterprise plans) is your central command center for managing multiple technicians, assigning jobs, and optimizing field service operations.

**Dashboard Layout**
The console has four main panels:
- **Left** â€” Unscheduled Jobs queue (drag source)
- **Center** â€” Timeline Grid (drag target) or Map View
- **Right** â€” Tech Status sidebar (collapsible)
- **Top** â€” KPI stats bar with real-time metrics

**KPI Stats Bar**
A live stats strip below the header shows:
- **Unassigned** â€” Count of pending jobs not yet assigned (amber when > 0)
- **Scheduled Today** â€” How many jobs are scheduled for the selected date
- **In Progress** â€” Jobs currently being worked
- **Techs** â€” Total active technicians
- **Conflicts** â€” Overlapping schedule conflicts (red pulse when > 0)

**Unscheduled Jobs Panel (Left)**
All pending jobs appear here as draggable cards with:
- **Auto-Schedule Button** â€” Quickly schedule a job with a single click if the customer provided availability windows.
- **Priority badges** â€” Critical (red pulse), High (orange), Medium (blue), Low (gray)
- **Age indicators** â€” Green (today), Yellow (1-3 days old), Red (> 3 days old)
- **Search** â€” Filter by customer name, address, or description
- **Priority filter pills** â€” Quick-filter by All, Critical, High, Medium, or Low
- **Sort options** â€” By Priority (default), Oldest First, or Longest Duration
- **AI Insights** â€” Expand any card to see the AI-generated complexity, required skills, and needed tools
- **Quick Assign** â€” Hover over a card and click "Quick Assign Best Tech" to open the smart assignment modal

**Timeline Grid (Center)**
The visual scheduling timeline shows each technician as a row with time slots:
- **Capacity bars** â€” Each tech row shows a fill percentage (green < 60%, yellow 60-85%, red > 85%) and jobs-scheduled vs max-capacity count
- **Working hours overlay** â€” Non-working hours are grayed out based on each tech's availability settings
- **Current time line** â€” A vertical red line shows the current time (when viewing today)
- **Job blocks** â€” Color-coded: blue (scheduled), pulsing green (in progress), red (overdue), gray (completed)
- **Click-to-view** â€” Click any scheduled job block for a detailed popover showing customer info, AI recommendations, contact details, and status
- **Drag & drop** â€” Drag an unscheduled job from the left panel onto any time slot to schedule it. Conflict detection prevents overlapping assignments.

**Map View (Center)**
Toggle to map view to see technician routes and job locations on a live map. Each tech is color-coded with route lines.

**Tech Status Panel (Right)**
A collapsible sidebar showing each technician's real-time status:
- **Status indicators** â€” Available (green), On Job (blue pulse), At Capacity (red), Off Duty (gray)
- **Completion tracker** â€” "X/Y done" showing jobs completed vs total scheduled
- **Capacity bar** â€” Visual fill for the day
- **Current job** â€” Shows which customer the tech is currently serving
- **Next available** â€” Shows when the tech will be free
- **Send Next Job** â€” One-click button (on available techs) to auto-assign the highest priority unscheduled job
- **Filter tabs** â€” Filter by All, Free, or Busy

**Smart Tech Assignment Modal**
When assigning a job (via Quick Assign or drag), the system uses an AI scoring engine that ranks technicians on 5 weighted factors:
- **Skill Match (30%)** â€” Compares the tech's specialties to the job's required skills (with fuzzy matching)
- **Workload (25%)** â€” Fewer jobs today = higher score
- **Availability (20%)** â€” Checks weekly availability, vacation dates, and time slot gaps
- **Proximity (15%)** â€” Matches service areas and calculates distance from home location
- **Certifications (10%)** â€” Relevant, verified certifications boost the score

Each tech shows:
- A composite score (0-100) with visual breakdown bars
- Matched vs missing skills as color-coded badges
- Available time slots for the target day (click to select)
- Warnings like "At max capacity", "Outside service area", or "Limited availability"
- An **Auto-Assign Best Available** button that picks the top tech + earliest slot

**Date Navigation**
- Use the â—€ â–¶ arrows to move between days
- Click **Today** to jump back to the current date
- Keyboard shortcuts: â†� (previous day), â†’ (next day)

**Tech Filter**
Click the "X Techs" dropdown to show/hide specific technicians on the timeline. Includes All/None toggle and an "Add Tech" button to invite new technicians.

**Keyboard Shortcuts**
- **â†�** â€” Previous day
- **â†’** â€” Next day
- **T** â€” Toggle between Timeline and Map view

Access the Dispatcher Console from the **Dispatch Console** link in the sidebar under the Work section.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["dispatch","dispatcher","console","map","assign","route","location","GPS","timeline","schedule","drag","drop","tech","technician","capacity","KPI","score","matching","smart assign","auto schedule","quick assign","unscheduled","conflict","status","availability","skills","workload","keyboard shortcut"]},{id:"jobs-list",title:"Jobs / Work Orders List",category:"jobs",content:`The **Jobs** page is your central hub for viewing and managing all work orders. Access it from the **Jobs** link in the sidebar under the Work section.

**Page Overview**
At the top you'll see the total job count, the number of unassigned jobs, and a **+ New Job** button for quick creation.

**Status Tabs**
Filter jobs by status using the tabs: **All**, **Unscheduled**, **Scheduled**, **In Progress**, **Completed**, and **Cancelled**. Each tab shows a live count.

**Search & Priority Filters**
Below the tabs, you'll find:
- **Search bar** â€” Filter by customer name, address, job type, or description
- **Priority pills** â€” Quick-filter by All, Critical, High, Medium, or Low priorities with live counts

**Table Columns**
The sortable table displays:
- **Priority** â€” Color-coded badge (ðŸ”´ Critical, ðŸŸ  High, ðŸŸ¡ Medium, ðŸŸ¢ Low)
- **Customer** â€” Name and service address
- **Type** â€” Job type (HVAC, Plumbing, Electrical, etc.)
- **Status** â€” Color-coded status badge
- **Assigned Tech** â€” The technician name, or an **Assign** button for unassigned jobs
- **Duration** â€” Estimated job duration in minutes
- **Age** â€” Time since creation (color-coded: green = recent, red = aging)

**Assigning Technicians**
For unassigned jobs, click the blue **Assign** button in the Assigned Tech column. This opens the **Smart Tech Assignment Modal** â€” the same AI-powered ranking engine used in the Dispatcher Console. Technicians are scored and ranked based on skills, workload, availability, proximity, and certifications.

**Navigating to Job Details**
Click any row in the table to navigate to the full job detail page. Or click the **eye icon** in the Actions column.

**Summary Bar**
At the bottom of the table, a summary bar shows the total displayed count and quick stats for unassigned, scheduled, and in-progress jobs.

**When to Use Jobs vs. Dispatcher Console**
- Use the **Jobs page** for browsing all jobs across any status, searching, bulk oversight, and quick assignment
- Use the **Dispatcher Console** for visual timeline scheduling, drag-and-drop, and map-based routing`,lastUpdated:"2026-04-21",keywords:["jobs","work orders","list","table","filter","search","assign","unassigned","priority","sort","status","pending","work order management"]},{id:"jobs-one-click-booking",title:"Smart Scheduling & One-Click Booking",category:"jobs",content:`When a customer submits an inquiry or speaks to the AI voice agent, they often suggest dates and times that work for them (e.g., "next Tuesday morning" or "October 15th around 2 PM"). DispatchBox automatically parses these natural language requests into actionable scheduling chips.\\n\\n**How to use Smart Scheduling:**\\n1. Open the **Smart Tech Assignment Modal** by clicking "Assign" on any job that has customer availability.\\n2. At the top of the modal, you will see **Customer Suggested Times** displayed as clickable date chips.\\n3. Click any date chip to instantly jump to that specific day.\\n4. The "Available Slots" section will automatically refresh to show the specific time slots for the chosen day.\\n\\n**One-Click Booking:**\\nOnce you see the available time slots for the technician, hover over a slot. It will say "Book [Time]". Simply click the time slot button to instantly assign the technician to that exact time. This skips the extra confirmation step, allowing for lightning-fast dispatching.\\n\\n**Q: What if the customer just says "tomorrow"?**\\n**A:** DispatchBox's AI parser understands relative dates like "tomorrow" or "next week" based on when the ticket was created and accurately routes you to the correct day on the calendar.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["schedule","booking","one-click","assign","availability","parse","smart scheduling","customer suggested times","fast dispatch"]},{id:"inv-create",title:"Creating Invoices",category:"invoicing",content:`Invoices can be created in several ways:

**From a completed job:**
1. Open the job detail page.
2. Click **"Generate Invoice"**.
3. The invoice pre-fills with job costs, materials used, and labor.
4. Review and adjust line items as needed.
5. Click **"Send"** to email it to the customer.

**Standalone invoice:**
1. Go to **Invoices** in the navigation.
2. Click **"New Invoice"**.
3. Select a customer and add line items manually.`,lastUpdated:"2026-03-11",keywords:["invoice","bill","create","send","payment"]},{id:"inv-quotes",title:"Quotes & Estimates",category:"invoicing",content:`Create professional quotes for customers:

1. From a job detail page, click **"Create Quote"**.
2. Add line items with descriptions and pricing.
3. Set an expiration date.
4. Send the quote link to your customer.

Customers can view and accept quotes through their unique quote link. Accepted quotes can be converted to invoices with one click.`,lastUpdated:"2026-03-11",keywords:["quote","estimate","proposal","pricing"]},{id:"inv-ai-quotes",title:"How AI Auto-Quoting Works",category:"invoicing",content:`DispatchBox's AI Quote Generator gets smarter over time to ensure your estimates are accurate and profitable.

**1. Job History Calibration (Getting Smarter)**
When generating a new quote, the AI searches your organization's past completed jobs. It uses keyword matching on the description to find up to 5 similar jobs. It then compares the **actual time** it took to complete those jobs versus the **originally estimated time**. The AI uses this ratio to adjust its new labor time estimate. If your techs consistently finish a certain type of job faster (or slower) than initially assumed, the AI automatically calibrates future estimates to reflect your real-world performance.

**2. Parts & Inventory Matching**
Instead of just guessing prices, the AI cross-references its suggested parts against your actual **Materials** inventory.
- If a match is found, it uses your **real unit cost** and applies your specific \`materialMarkup\` percentage from your rate card.
- If the part is not in your inventory, it falls back to the AI's estimated retail cost.

**3. Equipment & Tools**
If the AI determines that specialty equipment is required that your company does not typically own, it checks your **Tools** database for daily or rental rates and adds those to the quote.

**4. Labor & Rate Cards**
Using the calibrated hours, the AI breaks down labor into logical phases (Diagnostic, Primary Repair, Testing & Cleanup) and prices them using the specific **base hourly rate** (or customer-specific tier rate) defined in your rate card.

**Fallback Behavior**
If you are a brand new company with no past jobs and an empty parts inventory, the AI will still successfully generate a complete draft quote using standard industry estimates for parts, labor time, and required tools.`,lastUpdated:"2026-04-30",keywords:["quote","AI","estimate","smarter","history","calibration","parts","inventory","labor","rate card","auto-quote"]},{id:"inv-ai-learning",title:"Making the AI Smarter with Editable Quotes",category:"invoicing",content:`DispatchBox's AI quote generation learns from your expertise. When the AI generates a quote or recommendation for a customer, you can edit it before sending.

**Editable Materials & Tools**
On the Inline AI Recommendation & Quote Panel (found in the Communications Hub and directly on individual Job Detail pages), the AI generates a list of suggested **Materials Needed** and **Tools Required**.
1. Click the **Edit** button next to the Materials & Tools section.
2. You can add new materials, change quantities, remove incorrect items, or mark tools as required.
3. Click **Save Changes**.

**How the AI Learns**
When you make manual adjustments and save them, the system stores your corrected version in the job's history. The next time this customer requests a similar service, the AI will pull the context from your *past edited jobs* to anticipate their needs more accurately.

**Q: Do these edits affect the line items on the actual quote?**
**A:** The edited materials and tools serve as the source of truth for the quote's scope. Make sure to save your changes so the AI remembers them for the future!`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["ai","quote","edit","materials","tools","learning","smarter","history","inline panel","job details"]},{id:"inv-quote-templates",title:"Flexible Quote Display Templates",category:"invoicing",content:`Customize how your customers see their quotes using Flexible Display Settings. When creating or editing a quote, find the **Quote Display Settings** section to adjust the presentation.

**Presentation Modes:**
- **Detailed Line Items** — Shows every part, labor, and service line item with its individual quantity and price. Best for transparent pricing.
- **Roll-up by Category** — Groups your line items by their category (e.g., Labor, Materials, Travel) and shows only category subtotals. Great for simpler presentations.
- **Single Price Summary** — Hides all line items and category subtotals. Displays just one single "Complete Service" line with the total cost. Ideal for fixed-bid jobs.

**Tax & Discount Controls:**
- **Display Tax & Custom Rates** — Toggle whether tax is calculated and displayed on the quote. When enabled, you can edit the **Tax Rate (%)** directly. The system pre-fills your organization's default tax rate, but you can adjust it inline to handle specific jurisdictions.
- **Discount Flexibility** — Add discounts as a fixed dollar amount ($) or a percentage (%) of the subtotal. You can also add an optional Reason (e.g., "First-time customer discount") that will be visible to the customer.

These settings are saved automatically when you save the quote. You can preview exactly how the customer will see the quote by viewing the saved quote before sending it.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["quote","template","display","settings","presentation mode","single price","roll-up","category","tax","discount","percentage","fixed"]},{id:"inv-materials",title:"Managing Materials",category:"inventory",content:`Track materials and parts used on jobs:

1. Go to **Materials** in the navigation.
2. Add items with name, SKU, unit cost, and current quantity.
3. Set **reorder points** to get alerts when stock is low.

**On jobs:** When closing out a job, technicians can log materials used. This automatically decrements your inventory and adds costs to the job.`,lastUpdated:"2026-03-11",keywords:["materials","parts","inventory","stock","reorder"]},{id:"inv-tools",title:"Tool Tracking",category:"inventory",content:`Keep track of your company's tools and equipment:

1. Go to **Tools** in the navigation.
2. Add tools with name, serial number, condition, and assigned technician.
3. Track tool check-out and check-in history.

Tools can be assigned to technicians and tracked across jobs for accountability.`,lastUpdated:"2026-03-11",keywords:["tools","equipment","track","assign"]},{id:"inventory-web-portal-order",title:"Vendor Portals & Direct Checkout",category:"inventory",content:`DispatchBox integrates online vendor portals with your material sourcing workflow, allowing you to copy credentials, promo codes, and bulk order list inputs in one click.

**Setting Up Web Portals & Credentials:**
When adding or editing a vendor in your inventory directory (under **Manage Vendors**):
1. Provide the **Website URL** (e.g., \`https://business.amazon.com\` or \`https://www.grainger.com\`).
2. Store the secure **Web Username** and **Web Password** for the portal. Browser password managers will automatically recognize these inputs to help you save credentials natively!
3. Add active **Discount Codes** (comma-separated list) and customized **Special Ordering Instructions** (e.g. gate codes, delivery times).

**Ordering from Purchase Orders Backlog:**
When evaluating competitive sourcing offers under the *Upcoming Job Materials* or *Stock Deficit Materials* tab in the **Purchase Orders** cockpit:
1. Select any deficit item in either the Upcoming Orders Backlog or Stock Deficits Backlog, and click **"Quick Web Order"** next to your chosen vendor option.
2. This launches the **Quick Checkout Helper Drawer** containing:
   - **Step 1:** Launch the vendor's portal directly in a new browser tab.
   - **Step 2:** Copy Username/Password for immediate copy-pasting.
   - **Step 3:** Access the bulk **TSV (Tab-Separated Values) SKU Table** to copy all deficit SKUs and quantities in one tab-delimited line for fast bulk upload directly into the vendor's bulk order form.
   - **Step 4:** Fast-copy active promo/discount codes.
3. Once complete, click **"Save as Draft PO"** or **"Complete & Mark Sent"** to automatically record the PO inside Firestore with a \`sent\` or \`draft\` status!`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["vendor","portal","checkout","amazon","grainger","password","promo code","discount","tsv","sku","purchase order","direct order"]},{id:"inventory-ai-sourcing",title:"AI Auto-Sourcing & Bulk Procurement",category:"inventory",content:`DispatchBox's AI Auto-Sourcing Agent enables dispatchers to resolve all material deficits across both active jobs and warehouse stock levels in a single click, completely automating the split-sourcing optimization process.

**Two Distinct Backlog Streams:**
1. **Required Parts & Materials for Orders (Top Panel):** Displays parts needed to fulfill upcoming scheduled and assigned work orders, protecting active job delivery schedules.
2. **Required Parts & Materials for Stock (Bottom Panel):** Displays materials needed to replenish your warehouse stock levels up to your configured minimum required levels, completely independent of active jobs.

**Five Advanced Sourcing Strategies:**
Before executing the Sourcing Agent, you can select from five distinct AI optimization metrics:
- **Optimal Winner:** Balances unit cost, delivery times, and vendor preference rules.
- **Lowest Cost:** Maximizes discount margins by selecting the cheapest unit price.
- **Fastest Shipping:** Prioritizes quick delivery to minimize job schedule delays.
- **Highest Quality:** Prioritizes materials rated for higher durability and longer lifespan.
- **Preferred Vendor:** Strictly honors your assigned preferred vendor settings.

**Executing Sourcing in a Single Click:**
- Click **⚡ Run AI Auto-Sourcing Agent** to launch the terminal console.
- Watch the real-time split-sourcing log trace routes, catalog matches, and optimization decisions.
- On completion, instantly review the resulting sent Purchase Orders created directly in Firestore!`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["ai","sourcing","auto-source","procurement","purchase order","backlog","deficit","vendor split","grainger","amazon","automatic order","bulk ordering","stock deficit","strategy"]},{id:"cust-directory",title:"Contact Directory & Lifecycle",category:"customers",content:`The Contact Directory provides a complete list of your contacts, automatically categorized to help your dispatching workflow:\\n\\n**New vs. Existing Contacts**\\nThe directory automatically splits your contacts into two distinct groups based on their billing history:\\n- **Existing Contacts** â€” Contacts who have completed jobs with payments and have a lifetime value (Total Spent > $0).\\n- **New Contacts** â€” Contacts who have been added to the system or submitted inquiries, but haven't yet been billed for any completed work (Total Spent = $0).\\n\\n**Custom Contact Types**\\nWhen adding a new contact, you can now define a free-form **Contact Type** (e.g., Customer, Lead, Vendor, Partner). The default type is "Customer".\\n\\n**Filtering & Sorting**\\nYou can quickly narrow down your list using the built-in search and filters:\\n- **Search** â€” Filter by name, email, phone, or address.\\n- **Type Filter** â€” Filter to show only specific contact types.\\n- **Sort By** â€” Order your contacts by Name (A-Z), Total Spent (High-Low), or alphabetically by Contact Type.\\n\\n**Managing Records**\\nYou can add new customers from this directory or while creating a job. To keep your database clean for troubleshooting or fixing issues, you can completely **Delete** a customer record from the actions menu on their profile.\\n\\n**Why This Helps:**\\nThis split and filtering allows dispatchers and sales teams to easily identify brand new leads who need nurturing, while keeping established, revenue-generating clients separate.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["directory","list","new customer","existing customer","lifecycle","total spent","revenue","filter","sort","contact type","vendor","lead","delete","archive"]},{id:"cust-portal",title:"Customer Portal",category:"customers",content:`Each organization gets a customer-facing portal where your customers can:

- **View jobs** â€” See their scheduled, in-progress, and completed jobs.
- **View invoices** â€” Access and pay invoices online.
- **Send messages** â€” Communicate with your team.
- **Accept quotes** â€” Review and approve estimates.

Customers access the portal via a unique link. They log in with their email and a verification code â€” no password needed.`,lastUpdated:"2026-03-11",keywords:["portal","customer","self-service","access","login"]},{id:"addon-domain",title:"Custom Domain Setup",category:"addons",content:`Give your business a professional web presence:

1. Go to **Add-ons & Services** from the profile menu.
2. Enable **Custom Domain**.
3. Search for and register your domain (e.g., "billsplumbing.com").
4. DNS is configured automatically.

Your customer portal will be accessible at your custom domain. Cost: $14.99/month includes domain registration and DNS management.`,lastUpdated:"2026-03-11",keywords:["domain","website","URL","custom","DNS"]},{id:"addon-email",title:"Business Email",category:"addons",content:`Get professional email addresses at your custom domain (requires Custom Domain):

- **Starter** ($4.99/mo) â€” 2 email aliases (e.g., info@yourdomain.com, support@yourdomain.com)
- **Professional** ($9.99/mo) â€” 5 aliases + catch-all forwarding

All emails are forwarded to your existing email address. No new inbox to manage â€” just a professional "from" address for your business.`,lastUpdated:"2026-03-11",keywords:["email","forwarding","alias","professional","inbox"]},{id:"addon-sms",title:"Text Communications",category:"addons",content:`Send and receive SMS messages with your customers:

- **Basic** ($24.99/mo) â€” Dedicated phone number, 500 messages/month, appointment reminders.
- **Professional** ($49.99/mo) â€” 2,000 messages/month + automated follow-ups.
- **Enterprise** ($99.99/mo) â€” Unlimited messages + priority support.

Set up from **Add-ons & Services**, then manage conversations in the **Communications** portal.`,lastUpdated:"2026-03-11",keywords:["SMS","text","message","phone","communication"]},{id:"addon-ai-phone",title:"AI Voice Agent",category:"addons",content:`Let AI handle your phone calls 24/7 with Amy, your AI receptionist:

**Plans:**
- **Starter** ($49.99/mo) â€” AI answers calls, takes messages, books appointments.
- **Professional** ($99.99/mo) â€” Custom voice, call routing, integrates with your calendar.
- **Enterprise** ($199.99/mo) â€” Multi-line support, advanced routing, analytics dashboard.

**Configuration Options:**
Customize your AI agent directly from the **AI Phone Agent** tab under the **Business Profile** section.
- **Dynamic Call Workflows**: Create multiple, custom call workflows by defining specific intents (e.g., "Requesting a Quote," "Scheduling an Appointment"). For each intent, you can provide custom instructions on what data to collect and how the AI should behave. The AI will dynamically adjust to the caller's intent.
- **Human Transfer Number**: If a caller is frustrated, asks for a human, or has an emergency, the AI will immediately transfer the call to this number.
- **Automated Follow-Up (After Call)**: Have the system automatically text or email the caller right after the call ends. You can choose to always use SMS, always use Email, or dynamically use the caller's preferred method.

**How Amy Handles Calls:**

When a customer calls, Amy greets them with examples of how she can help: "I can help you schedule a service, get a quote, or check on an existing job." Then she collects info one question at a time:

1. **Name** â€” "Sure thing! Can I get your name?"
2. **Issue/Description** â€” "What's going on that you need help with?" (She requires specifics, not just "service call.")
3. **Address** â€” "What's the address or area for the service?" (General area â€” exact address confirmed via follow-up.)
4. **Contact Preference** â€” "What's the best way to reach you â€” call, text, or email?" Collects details based on preference.
5. **Availability (Service Only)** â€” "What days and times work best for you?" (Skipped for quote requests).
6. **Confirmation** â€” Reads back details once, then tells them what to expect:
   - Service requests: "We will reach out to you via [text/call/email] about your service."
   - Quotes: "We will reach out to you via [text/call/email] during normal business hours once the quote is ready."
7. **Ticket Created** â€” Immediately after the caller confirms. Service requests generate Jobs, while Quote requests generate a Quote Inquiry ticket for human review.

**Key Features:**
â€¢ **Fast responses** â€” Amy responds within 2 seconds of the caller finishing.
â€¢ **Natural Pauses & Spelling** â€” Amy dynamically waits for the caller to finish speaking, making it easy to spell out complex information like email addresses.
â€¢ **Smart follow-up** â€” Uses the caller's preferred contact method for all follow-ups.
â€¢ **Automated Callbacks** â€” If a caller gets disconnected or goes silent due to poor connection, Amy will automatically schedule and initiate a callback 5 minutes later to pick up exactly where you left off.
â€¢ **Graceful address handling** â€” If unclear, moves on and confirms during follow-up.
â€¢ **Emergency Triage & Human Handoff** â€” Immediate transfer to your fallback number during emergencies or upon request.

**Q: What if Amy can't understand the caller?**
**A:** She rephrases questions naturally. For persistent confusion, she moves on and flags it.

**Q: What happens after a ticket is created?**
**A:** It appears in your Jobs dashboard. Depending on your Auto Follow-Up settings, the customer is immediately notified. Your team reaches out via the caller's preferred method for the next step.

Set up your agent by clicking **AI Voice Agent** under the **Comms** section in the left sidebar navigation.`,lastUpdated:"2026-05-01",keywords:["AI","phone","agent","receptionist","call","answering","Amy","callback","email spelling","navigation","transfer","quote"]},{id:"addon-ai-admin",title:"AI Voice Management Dashboard",category:"addons",content:`Manage and troubleshoot your AI Voice Agent directly from the AI Voice Management dashboard (accessible to Site Admins under **Platform > AI Voice**).

**Configuring the Data Collection Phase**
We've incorporated industry best practices into the AI profiles to ensure the highest data quality and customer satisfaction:
- **Call Flow Profiles:** Organizations can now select from different AI conversation templates directly from their **AI Voice Agent** configuration page (under Communications). Each profile provides a description of its flow.
- **Required Fields:** Define a precise list of fields the AI must collect. This acts as a checklist, ensuring no required information is skipped.
- **Step-by-Step Confirmation:** Enable this to force the AI to confirm each individual piece of information as it receives it. This prevents frustrating miscommunications.
- **Fallback Communication:** Enable this option to automatically offer the caller a text or email interaction if the AI fails to understand them after the max retry limit.

**Call History & Transcripts**
The **Call History** tab gives you a real-time feed of all inbound sessions. Click on any row to expand the details, where you can view:
- The AI's summary of the issue
- The specific data points extracted (name, address, etc.)
- A full transcript of the conversation with distinct tags for Caller and AI Agent

**Converting Calls**
Directly from a session's Call History, you can click **Create Job** or **Create Quote** to instantly jumpstart a workflow using the collected data.`,lastUpdated:"2026-05-01",keywords:["admin","dashboard","voice","history","transcript","collection","confirmation","fallback","profile","template"]},{id:"reports-overview",title:"Reports Dashboard",category:"reports",content:`The Reports page provides business insights:

- **Revenue Summary** — Track income by day, week, or month with trend charts.
- **Technician Utilization** — See how busy your team is and identify capacity.
- **Job Completion Rates** — Track on-time completion and customer satisfaction.

Use the date range picker to view any time period. Export data as CSV for your accountant.`,lastUpdated:"2026-03-11",keywords:["report","analytics","revenue","chart","data","export"]},{id:"acct-plans",title:"Plans & Pricing",category:"account",content:`DispatchBox offers three plans:

- **Individual** — For solo technicians. Basic scheduling, invoicing, and customer management.
- **Small Business** — For growing teams. Adds dispatcher console, team management, calendar views, and more.
- **Enterprise** — For larger organizations. Unlimited technicians, custom integrations, dedicated support.

Upgrade anytime from **Organization Settings**. Changes take effect immediately.`,lastUpdated:"2026-03-11",keywords:["plan","pricing","upgrade","subscription","tier"]},{id:"acct-org-settings",title:"Organization Settings",category:"account",content:`Configure your organization from the profile menu → **Organization Settings**:

- **Company Info** — Name, email prefix, from name.
- **Branding** — Upload your company logo and hero background image directly (drag & drop or click), set primary/secondary colors, choose fonts, and add social links.
- **Email Signature** — Use the **Visual Signature Builder** to create a professional, branded email signature with your logo, social links, and company tagline. The signature is automatically appended to all outbound emails.
- **Auto-Reply** — Customize automated email responses.
- **Default Tax Rate** — Set your organization's default tax rate (e.g., 4.712% for Hawaii GET). This rate is the **centralized source of truth** for all quote and invoice tax calculations. It is automatically applied to AI-generated quotes, manually created quotes, and the Inline AI Quote Panel. Technicians can still override the rate on individual quotes when needed.
- **Plan Management** — View current plan and upgrade options.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["settings","organization","company","branding","configure","upload","logo","signature","email signature"]},{id:"po-workflow",title:"Purchase Orders & Backlog Sourcing",category:"inventory",content:`Manage your purchasing and deficits directly in DispatchBox:

1. **Materials & Stock Backlog Pipeline**: The dashboard dynamically segregates unfulfilled deficits into two distinct, high-visibility queues:
   - **Required Parts & Materials for Orders** — Dynamically compiled from approved quotes and active work orders, detailing parts specifically promised to scheduled job slots.
   - **Required Parts & Materials for Stock** — Automatically calculated against minimum warehouse inventory thresholds and tools marked as "needs replacement" or "missing" on the active roster.

2. **Split Procurement**: Run independent manual or AI-assisted ordering procedures to prevent warehouse shortages while ensuring client-promised work orders are fulfilled on time.

3. **Vendor Web Orders & Credentials**: When placing manual or automated orders, vendors configured with digital store web portals will launch the integrated web helper dashboard. Keep web logon credentials and discount promo codes securely stored for lightning-fast, unified browser placement.`,lastUpdated:"2026-05-23",keywords:["purchase orders","PO","vendor","shopping cart","buy","parts","deficit","stock backlog","job materials"]},{id:"vendor-ai-sourcing",title:"AI Procurement & Auto-Sourcing Strategies",category:"inventory",content:`DispatchBox AI continuously monitors your entire catalog and unfulfilled deficits to optimize purchasing:

- **Interactive Sourcing Criteria**: Customize the Auto-Sourcing algorithm by toggling the primary optimization strategy card on your backlog panel:
  - **Optimal Priority** — Balances cost, transit speed, and preferred distributor status to find the ideal compromise.
  - **Lowest Cost** — Scours active catalogs and online backstops to prioritize the cheapest unit rates and minimize invoice expenses.
  - **Fastest Shipping** — Prioritizes next-day delivery distributors to guarantee urgent tool replacements and work-order parts arrive on-site tomorrow.
  - **Highest Quality** — Sorts by component ratings and fleet durability records to order verified premium materials.
  - **Preferred Vendor** — Directs purchase volume to your designated primary vendor arrangements first.

- **Split AI Auto-Sourcing**: Clicking "Run AI Auto-Sourcing Agent" instantly evaluates every item in both queues, splits them into optimized orders based on your selected strategy, generates multi-vendor purchase orders, and logs real-time terminal outputs.`,lastUpdated:"2026-05-23",keywords:["AI","vendor","price","sourcing","cost","savings","criteria","strategy","optimization","split order"]},{id:"inventory-locations",title:"Inventory Locations (Trucks & Warehouses)",category:"inventory",content:`Track exactly where your materials and tools are:

1. In the **Materials** or **Tools** tab, you'll see a **Location** column.
2. Use the location tabs at the top to filter between "Warehouse A", "Van 1", etc.
3. **Transfers:** Easily select items and transfer them from a Main Warehouse to a specific Technician's Van.
4. This ensures your techs never arrive on-site missing a critical part.`,lastUpdated:"2026-04-03",keywords:["locations","warehouse","van","truck","transfer"]},{id:"batch-invoicing",title:"Batch Invoicing & Editing",category:"invoicing",content:`Speed up your billing workflow and handle disputes:

**Batch Invoicing:**
1. Go to **Jobs** and filter by "Completed" status.
2. Select multiple jobs using the checkboxes.
3. Click **"Batch Invoice"** to instantly generate individual invoices for all selected jobs.

**Unlock & Edit Invoices:**
1. If a customer disputes a sent invoice, open it and click **"Unlock to Edit"**.
2. Add a discount line item or modify charges.
3. Click **"Save and Resend"** to update their Customer Portal view.`,lastUpdated:"2026-04-03",keywords:["batch","invoice","multiple","edit","unlock","dispute"]},{id:"customer-rate-cards",title:"Customer Rate Cards",category:"customers",content:`Offer VIP pricing to specific clients or commercial accounts:

1. Open a customer's profile in the CRM.
2. Navigate to the **Pricing Details** or **Rate Card** section.
3. Set a specific **Hourly Labor Rate** or a flat **Material Discount** just for them.
4. Whenever a job is booked for this customer, invoices and quotes will automatically pull via their negotiated Rate Card instead of your standard prices.`,lastUpdated:"2026-04-03",keywords:["rate card","discount","VIP","commercial","hourly","pricing"]},{id:"tech-resume-parsing",title:"AI Resume Parsing for Technicians",category:"getting-started",content:`Onboard new technicians in seconds:

1. Go to the **Technicians** management page.
2. Click the **Upload Resume** icon (magic sparkle).
3. Upload a PDF or Word document of their resume.
4. DispatchBox AI will analyze their work history and auto-generate their Profile, pre-populating their **Skills**, Certifications, and Experience level.
5. This directly feeds into smart-dispatching!`,lastUpdated:"2026-04-03",keywords:["resume","CV","tech","technician","hire","skills","AI"]},{id:"website-builder",title:"Website & Portal Builder",category:"addons",content:`Transform your Customer Portal into a fully branded Website:

**Share Your Portal**
At the top of the Branding tab you'll find your Customer Portal URL and Service Email with one-click copy buttons.

**Logos & Imagery**
- Upload your **Company Logo** and **Hero Background Image** via drag & drop.

**Colors & Typography**
- **10 Quick Theme presets** (Ocean, Sunset, Forest, Royal, etc.)
- **3 color pickers**: Primary, Secondary, and Accent
- **10 font families**: Inter, Poppins, Montserrat, Playfair Display, and more

**Button & Layout**
- Button Style: Rounded, Pill, or Square
- Custom Button Text, Header Subtitle, and Business Tagline

**Full-Screen Website Builder**
Click **"Launch Website Builder"** to open a full-screen editor with a 3-step flow:

***Step 1 â€” Choose Your Theme:***
Pick from 6 visual website themes that control how your site looks:
- **Classic Business** â€” Clean, centered layout with bordered cards
- **Modern Dark** â€” Bold dark hero with frosted glass cards
- **Bold & Colorful** â€” Split hero with vivid color accents
- **Clean Minimal** â€” Spacious white design with flat cards
- **Warm & Personal** â€” Serif headings with warm tones
- **Professional Edge** â€” Compact, data-driven dark header

Each theme shows a live mini-preview using your brand color. Themes are non-destructive â€” changing your theme only changes the visual style, never your content.

***Step 2 â€” Choose Your Pages:***
Select which content groups to include on your website:
- **Home** (Hero, About, CTA) â€” always included
- **Services** (Service listings, Stats)
- **Portfolio** (Gallery, Before & After)
- **Trust & Reviews** (Testimonials, Certifications)
- **Info & FAQ** (FAQ, Hours, Service Areas)
- **Team** (Team member profiles)

Page groups are additive â€” sections from selected groups are created without overwriting anything that already exists.

***Step 3 â€” Edit Sections:***
The main editor features:
- **Grouped sidebar** â€” Sections organized by page group with collapsible headers
- **Section editor** â€” Full editing panel for titles, descriptions, and sub-items
- **Section ideas** â€” 14 quick-add section suggestions with descriptions
- **Reorder, toggle, delete** â€” Use the sidebar controls on hover

**Public Portal Design**
The portal is designed as a lead-generation landing page:
- **Hero + Booking Form** â€” The service request form sits prominently beside the hero text on desktop (stacked on mobile). Customers can immediately submit a request.
- **Trust Signals** â€” "Licensed & Insured" and "Free Estimates" badges appear below the hero.
- **Call Now Button** â€” One-tap calling from the hero area and header.
- **CTA Strip** â€” A gradient call-to-action strip at the bottom with "Request Service Now" and direct phone buttons that scroll back to the form.
- **Dark Mode Header** â€” The header automatically matches the theme color mode (dark themes get a dark glass header).

Your active theme badge appears in both the builder top bar and the compact summary on the Branding tab.

Your public website is live at **/p/your-org-slug**.`,lastUpdated:"2026-04-14",keywords:["website","builder","portal","layout","theme","classic","bold","minimal","modern","dark","warm","professional","section","about","services","gallery","faq","testimonials","cta","team","hours","certifications","stats","pages","ideas","page groups","booking form","request service","lead generation"]},{id:"addons-integrations",title:"Ticketing System Integrations",category:"addons",content:`Connect your existing helpdesk or ITSM platform to pull tickets directly into DispatchBox.

**Supported Platforms:**
- ServiceNow (Incidents & Service Requests)
- Salesforce Service Cloud (Cases)
- Zendesk Support (Tickets)
- Jira Service Management (Issues)
- Freshdesk (Tickets)
- HubSpot Service Hub (Tickets)
- ConnectWise Manage (Service Tickets)

**How to Connect:**
1. Go to **Communications Hub** â†’ **Integrations** tab.
2. Click a platform card to start the setup.
3. Enter your connection credentials (Instance URL, API Key, etc.).
4. Click **Test Connection** to verify.
5. Configure **Sync Criteria** â€” choose which tickets to pull by category, priority, status, or assignment group.
6. Set a **Sync Frequency** (real-time, every 5/15/30 min, or hourly).
7. Click **Connect & Import Tickets**.

**Managing Imported Tickets:**
- Imported tickets appear in the Imported Tickets panel with source badge, priority, and requester info.
- Click **Convert to Job** to create a DispatchBox job from any ticket â€” customer info and description are auto-filled.
- Use the source filter dropdown to view tickets from a specific platform.
- Tickets that have been converted show a green "Job Created" badge with a link to the job.

**Tips:**
- Use narrow sync criteria (specific categories + high priorities) to avoid importing noise.
- The "Test Connection" button verifies credentials before saving.
- You can pause/resume any integration using the toggle switch.
- Removing an integration keeps previously imported tickets for audit purposes.`,lastUpdated:"2026-04-14",keywords:["integration","servicenow","salesforce","zendesk","jira","freshdesk","hubspot","connectwise","ticket","sync","import","ITSM","helpdesk","connect"]},{id:"comms-hub",title:"Communications Hub & Inbox",category:"communications",content:`The Communications Hub is your central nerve center for all customer interactions.

**Inbox Tab (Default)**
A real-time unified feed showing all incoming customer requests from every channel:
- **Portal Forms** â€” Customers filling out the service request form on your website
- **Phone Calls** â€” Call-ins converted to text tickets by your AI Phone Agent or dispatcher
- **Emails** â€” Customer email inquiries
- **Integration Tickets** â€” Imported from ServiceNow, Salesforce, Zendesk, etc.

Each item shows a source badge, priority level, time stamp, and customer contact info.

**Enabling AI Auto-Quote Generation**
AI auto-quoting is **off by default**. To enable it:
1. Go to **Communications Hub** â†’ **Overview** tab
2. Find the **AI Auto-Quote Generation** card
3. Toggle it **on**

Once enabled, when a customer submits a request via your website portal:
1. A **job is automatically created** in the background
2. **AI analyzes** the service request to determine materials, tools, labor hours, and complexity
3. A **complete draft quote** is generated with line items including:
   - Diagnostic & assessment labor
   - Repair/service labor (named based on the type of work, e.g., "Replacement â€” Labor")
   - Testing, cleanup & final inspection
   - Materials cross-referenced against your company inventory for real costs (with your configured markup)
   - Equipment/tool rental fees for specialty tools
   - Service call / trip charge (if enabled in your rate card)
4. The quote total is shown as a badge on the **Review AI Quote** button

> **Note:** When auto-quoting is enabled, portal form submissions take approximately 15â€“20 seconds to complete as the AI analysis and quote generation run.

**Primary Action: Review AI Quote**
When an auto-generated quote is ready, the primary action button becomes:
- **âœ¨ Review AI Quote $X** (indigo-purple gradient) â€” Expands an **inline recommendation & quote panel** directly on the inbox card with no page navigation required. The dollar amount badge shows the current draft total.
- **Add Customer** â€” Register the requestor in your customer database
- **Dismiss** â€” Archive the inquiry

**Inline AI Recommendation & Quote Panel**
Clicking "Review AI Quote" expands a rich, interactive panel right below the inquiry:

***AI Analysis:***
- **Diagnosis** â€” What the AI determined is wrong based on the customer description
- **Recommended Resolution** â€” Step-by-step repair plan with specific instructions
- **Safety Notes** â€” Warnings for electrical, gas, or hazardous work
- **Tools Required** â€” Each tool tagged as "âœ“ has" (in your inventory) or "âœ— needs" (must source)

***Editable Scope of Work:***
Click **Edit** next to the scope header to modify the auto-generated scope text before sending.

***Cost Breakdown Summary:***
Four color-coded category cards showing totals for **Labor** (blue), **Materials** (green), **Equipment** (purple), and **Travel** (amber) at a glance.

***Quote Line Items (Fully Editable):***
Each line shows a type icon, description, quantity, unit price, and total. Hover any row to reveal:
- **Edit** (pencil icon) â€” Makes description, quantity, and unit price inline-editable. Totals recalculate in real time.
- **Delete** (trash icon) â€” Remove a line item.
- **+ buttons** at top right â€” "+ Labor", "+ Material", "+ Tool", "+ Travel" to add new lines.
- Optional items are tagged "(optional)" and excluded from the base total.

***Action Buttons:***
- **Save Changes** â€” Persist your edits to the draft quote
- **Full Quote Editor** â€” Open the full-page quote builder for advanced editing (overrun protection, agreements, etc.)
- **Send Quote to Customer** (green button) â€” Saves edits, marks the quote as "sent", and acknowledges the inquiry

**Fallback: Generate AI Recommendation**
If no auto-quote exists yet, the panel shows a **"Generate AI Recommendation"** button. Clicking it:
1. Creates a job from the inquiry
2. Runs AI analysis on the service request
3. Generates a complete draft quote with all line items
4. Loads the inline panel with results â€” ready to review and send

**Job Detail â€” Next Steps**
Once a job is created (either manually or via auto-quote), the job detail page shows a **Next Steps** panel with these actions:
- **Generate AI Quote** â€” Auto-create a detailed AI quote with labor, materials, and equipment
- **Create Manual Quote** â€” Build a quote from scratch using the quote builder
- **Perform Inspection** â€” Move the job directly to In Progress for on-site inspection before quoting
- **Skip Quote** â€” Bypass the quoting step entirely and proceed directly to scheduling or work

All buttons provide instant feedback via toast notifications.

**How AI Pricing Works**
The system prices quotes using multiple data sources:
- **Labor rates** from your rate card (base hourly rate or customer-specific rate tier)
- **Materials** are matched against your company inventory for actual costs â€” AI-estimated costs are used as fallback when items aren't in your inventory
- **Markup** is applied from your rate card settings (default 30%)
- **Equipment** fees use your configured equipment day rate or defaults
- **Job history** â€” past similar completed jobs are analyzed to calibrate hour estimates based on actual vs. estimated durations
- **Tax** calculated from your organization's **Default Tax Rate** in Organization Settings

Emergency items show a red banner and are surfaced first.

**Filtering**
Use the source dropdown to filter by Portal Forms, Phone Calls, Emails, or Integration Tickets.

**Other Tabs:**
- **Overview** â€” Dashboard cards, AI Auto-Quote toggle, quick links to AI Phone Agent, SMS, and Integrations
- **Integrations** â€” Connect external ticketing systems (ServiceNow, Salesforce, Zendesk, Jira, Freshdesk, HubSpot, ConnectWise)
- **Email & Phone** â€” Configure contact email, support phone, and team cell numbers
- **Portal** â€” Toggle your public customer portal on/off and configure its URL slug

Access Communications Hub from the **Comms** section in the left sidebar.`,lastUpdated:"2026-04-21",keywords:["communications","hub","inbox","unified","portal","phone","email","ticket","inquiry","dispatcher","create job","quote","ai quote","auto quote","work estimate","customer","call-in","comms","estimate","rate card","materials","review","edit","auto-generate","draft","toggle","enable","disable","perform inspection","skip quote","next steps","inline","diagnosis","resolution","send quote","line items","editable"]},{id:"email-triage",title:"Smart Inbound Email Triage",category:"communications",content:`DispatchBox can automatically process inbound emails sent to your service email address and intelligently route them into the right workflow.

**How It Works**
When someone emails your service address (e.g., acmeplumbing@dispatch-box.com), DispatchBox AI analyzes the email and classifies it into one of three lanes:

1. **Trusted Customer (Auto-Create)** -- If the sender is a known customer in your system, a support ticket is created automatically with AI-extracted details (issue description, urgency, suggested fixes). If Auto-Quote is enabled, a Job and AI Quote are also generated instantly.

2. **Unknown Sender (Intake Form)** -- If the sender is not recognized, they receive a branded, professional email with a secure link to a short intake form. The form pre-fills AI-parsed data so the sender just needs to confirm their name, phone, and address.

3. **Spam / Irrelevant (Discard)** -- Marketing, newsletters, auto-replies, and non-service-related emails are silently discarded.

**Email Forwarding**
When enabled, every non-spam inbound email is forwarded to your personal inbox. To enable: Organization Settings > Email Settings > Toggle Forward Inbound Emails on > Enter your email > Save.

**Reply-As Proxy**
When enabled alongside forwarding, you can reply to forwarded emails from your personal inbox and the reply will be sent to the customer from your dispatch-box address -- not your personal email. The customer never sees your personal email. All replies are logged as activity on the ticket.

**Intake Form for New Contacts**
The intake form is a public, branded page that uses your company logo, pre-fills AI-parsed data, requires name/phone/address, and expires after 48 hours.

**Configuration (Organization Settings > Email Settings):**
- Triage Mode -- SMART (3-lane AI) or ALWAYS_CREATE
- Forward Inbound Emails -- Toggle forwarding
- Reply-As Proxy -- Send replies from dispatch-box address
- Auto-Quote on Email -- Auto-generate AI Quote for trusted senders
- Spam Filter -- Toggle AI spam filtering

**Tips:**
- Reply-As Proxy works with any email client (Gmail, Outlook, Apple Mail)
- Add known customers to Contacts so they are auto-recognized
- Enable Auto-Quote for full email to ticket to job to quote automation`,lastUpdated:"2026-04-24",keywords:["email","triage","inbound","smart","intake","form","spam","filter","unknown","trusted","auto-create","ticket","AI","classification","intake form","new customer","lead","onboarding","forwarding","forward","reply","proxy","reply-as","dispatch-box","personal email"]},{id:"inbound-voice-sms",title:"Inbound Calls & Text Messages",category:"communications",content:`When customers call or text your dedicated business number, DispatchBox automatically creates a job visible in your Job Intake Dashboard.

**Voice Calls â€” Smart Multi-Turn Intake**
When a customer calls your provisioned number:
1. The AI Phone Agent (Amy) answers and begins a natural, multi-turn conversation.
2. Amy systematically collects: **caller name**, **service address**, **issue description**, **urgency level**, and **preferred availability** â€” one question at a time.
3. The conversation is stored in a session so Amy remembers everything said across turns.
4. Once all key information is gathered, Amy confirms the details and creates a **ticket** and **job** with structured data.
5. If Auto-Quote is enabled, an AI-generated quote is also created instantly.

**Talk to a Human (Call Transfer)**
If a caller wants to speak with a real person, Amy can transfer them instantly:
- **When enabled**: Amy offers "or speak with someone directly" in her greeting. If the caller requests a person at any point, Amy says "Let me connect you" and forwards the call via Twilio Dial.
- **When disabled**: Callers who request a person are offered voicemail instead.
- **Configuration**: Communications Hub > Overview > Talk to a Human toggle > Enter your forward number > Save.
- The forward number is typically a dispatcher, office manager, or on-call tech.

**Text Messages (SMS)**
When a customer texts your number:
1. DispatchBox analyzes the message intent (new ticket, status check, or cancellation).
2. For new service requests, a **ticket** and **job** are created automatically.
3. The customer receives an instant reply confirming their ticket number.
4. The job appears in the Job Intake Dashboard with source "sms".

**Organization-Aware Routing**
Each provisioned phone number is linked to a specific organization. When a call or text arrives:
- The system looks up which organization owns the receiving number.
- Tickets and jobs are scoped to that organization.
- Reply messages are sent from the organization's own number.

**A2P 10DLC Compliance**
When you provision a new phone number, DispatchBox automatically:
- Creates a Twilio Messaging Service with centralized webhooks.
- Adds your number to the Messaging Service sender pool.
- Registers an A2P Brand and Campaign for carrier-compliant texting.

Carrier approval typically takes 2-3 weeks. A daily background job monitors the status and updates your dashboard automatically.`,lastUpdated:"2026-04-25",keywords:["voice","call","SMS","text","inbound","phone","AI","ticket","job","intake","A2P","10DLC","compliance","multi-turn","Amy","session","smart","transfer","human","forward","dial","talk to a person"]},{id:"ai-outbound-callback",title:"AI Outbound Callback & Scheduling",category:"communications",content:`After a quote is generated, DispatchBox can automatically call the customer back to share the quote, approve it on the spot, and schedule their appointment -- all in one seamless AI-powered call.

**Two-Step Callback Greeting**
When Amy calls a customer, the conversation flows in two distinct steps to avoid overwhelming the customer:

**Step 1 â€” Availability Check:**
- â€œHi, this is Amy from [Company Name]. Iâ€™m calling about [work requested]. Is [Customer First Name] available?â€�
- Amy pauses and waits for the customer to confirm before continuing.
- If the customer is not available (says â€œnoâ€�, â€œbusyâ€�, â€œcall back laterâ€�), Amy politely texts the quote link and ends the call.

**Step 2 â€” Quote Presentation & Options:**
Once the customer confirms availability, Amy reads the quote details using the technicianâ€™s configured **Presentation Mode**, then presents the options.

**Quote Presentation Matches Your Display Setting**
When Amy reads the quote during a callback, she respects the **Presentation Mode** that the technician set on the quote.

- **Single Price Summary** â€” â€œYour approved quote total is $950.â€�
- **Roll-up by Category** â€” â€œYour quote includes $300 for labor and $650 for materials, for a total of $950.â€�
- **Detailed Line Items** â€” Individual items with quantities and prices (up to 5; if more, summarized).

**Four Response Options**
1. **â€œTell me the detailsâ€�** â€” Amy reads the full quote breakdown **without approving**.
2. **â€œApproveâ€� / â€œYesâ€� / â€œGo aheadâ€�** â€” Amy approves the quote, then starts customer-driven scheduling.
3. **â€œText it to meâ€� / â€œEmail itâ€�** â€” Amy immediately texts the quote link.
4. **â€œHave someone call me to discussâ€�** â€” Creates a follow-up task for a real person.

**Customer-Driven Scheduling**
After approval, Amy does NOT dump random time slots. Instead:
1. Amy confirms the approval: â€œGreat! Your quote has been approved. Letâ€™s get you scheduled.â€�
2. Amy asks: â€œ**What day of the week works best for you?**â€�
3. The customer responds with their preference (e.g., â€œMondayâ€�, â€œTomorrowâ€�, â€œmorningâ€�).
4. Amy checks the **assigned technicianâ€™s actual schedule** for that day and presents available windows.
5. If the requested day isnâ€™t available, Amy tells them which days ARE open and asks again.
6. Customer selects a time slot.
7. **Booking Confirmation** — Amy always repeats back: 'Just to confirm, I have you down for [day/time]. Is that correct?' The appointment is only booked after the customer confirms.
8. If the customer says it's wrong, Amy re-reads the options.
9. SMS fallback after multiple attempts.

This two-step confirmation prevents mishears from going straight to the calendar â€” not random slots.

**Important: No Auto-Approval**
Asking for quote details does NOT approve the quote.

**Smart Conversation Handling**
- **Greetings**: Re-prompts with options
- **Detail requests**: Reads quote WITHOUT approving
- **Approvals**: Triggers approval + customer-driven scheduling
- **Declines**: Gracefully ends the call
- **Change requests**: Logs for technician review
- **Unclear Responses**: Re-prompts instead of guessing

**How It Works**
1. A job is created (from voice call, text, email, or portal).
2. A dispatcher reviews the quote and clicks â€œSend Quote to Customerâ€� with Voice selected.
3. The customer is added to the callback queue.
4. DispatchBox calls the customer during local business hours (8 AM â€“ 6 PM).
5. Amy asks if available, asks about quote interest, then shares the quote and options.
6. If approved, Amy asks what day works, finds matching tech availability, confirms the selection, and books.

**Callback Mode**
- **Full Callback** (with_quote) â€” AI shares quote AND schedules.
- **Schedule Only** (schedule_only) â€” AI calls to schedule without quote amount.
- **No Callback** (none) â€” Automated outbound calls disabled.

**SMS Fallback**
If the customer doesnâ€™t answer or respond:
- SMS with the quote review link is sent automatically.
- They can approve directly from their phone.

**Tips:**
- Scheduling uses the assigned techâ€™s real availability, not random slots
- Customers pick the day; Amy finds the windows
- Amy always confirms the selection before booking
- All sessions are logged for audit
- Dispatchers can see callback status on the job detail view`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["outbound","callback","scheduling","appointment","time slot","AI","phone","auto","quote","approved","SMS","fallback","technician","schedule","callback mode","customer driven","day preference","tech availability","Amy","discuss","human","text","approve","presentation mode"]},{id:"quote-inquiry-workflow",title:"Quote Inquiry Workflow",category:"communications",content:`When a customer contacts you for a quote (via phone, email, or portal), DispatchBox creates a **Quote Inquiry** instead of a standard Service Job.

**How It Works**
1. **Intake** â€” The AI Voice Agent or Smart Triage identifies the intent as a Quote Request. The AI collects the issue and address, but skips asking for availability since the quote must be approved first.
2. **Review** â€” The inquiry appears in the Communications Hub with a blue **Quote Inquiry** badge (differentiating it from standard Service Requests).
3. **AI Quoting** â€” If AI Auto-Quote is enabled, a draft quote is generated directly on the inquiry.
4. **Editing & Sending** â€” Click **Review AI Quote** to open the inline panel. Edit the materials and labor, then click **Send Quote to Customer**.
5. **Pending Callback Queue** â€” When you send an approved quote, you can check the "Queue AI Voice Callback" box. This adds the customer to the callback queue so the AI can proactively follow up with them during their time zone's normal business hours to secure the booking.

**Converting Quotes to Jobs**
Once a quote is approved by the customer (or if you manually decide to proceed), click **Create Job** from the inquiry. The system will automatically convert the inquiry to a scheduled job and link the existing quote to the new job, preserving all history.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["quote","inquiry","intent","callback","voice","AI","queue","workflow","conversion"]},{id:"job-completion-auto-invoice",title:"Job Completion & Automatic Invoice",category:"invoicing",content:`When you complete a job using the **Job Completion Wizard**, DispatchBox now automatically generates a **draft invoice** from the finalized costs.

**How It Works**
1. Open a job and click **"Complete Job"** to launch the wizard.
2. Walk through the steps: scan or select parts used, capture customer signature, add final notes.
3. When you click **"Complete & Submit"**, the system:
   - Marks the job as completed
   - Deducts parts from your inventory
   - Logs all inventory transactions
   - **Automatically creates a Draft Invoice** with all line items

**What Goes on the Invoice**
The auto-generated invoice includes:
- **Parts** â€” Each part used, priced at the customer-facing unit price (or cost if no price set)
- **Labor** â€” Hours worked at the tracked hourly rate
- **Mileage** â€” Travel charges if mileage was logged on the job
- **Other Charges** â€” Any additional fees recorded in the job cost tracker

**After Completion**
- The invoice is created as **"Draft"** status â€” you can review and adjust before sending.
- The job's detail page shows a linked invoice ID for easy navigation.
- Navigate to **Invoices** to review, edit, and send the draft to your customer.

**If no billable items exist** (e.g., a free warranty visit), no invoice is created â€” the job simply completes.

**Tips:**
- Set customer-facing prices (unitPrice) on your materials for accurate invoicing
- Track labor hours during the job using the Cost Tracker tab for automatic labor line items
- The invoice links back to the source job for complete audit trail`,lastUpdated:"2026-04-27",keywords:["job","complete","finish","invoice","auto","automatic","draft","wizard","parts","labor","mileage","cost","billing","inventory"]},{id:"scheduled-reports",title:"Scheduled Reports",category:"reports",content:`Set up automated reports that are generated and delivered to your email or phone on a schedule.

**Setting Up a Report**
1. Go to **Reports** in the sidebar.
2. Click **"Schedule Report"** or find the scheduling section.
3. Choose a report type, delivery method, format, and frequency.
4. Reports run automatically every 15 minutes (checking if they're due).

**Available Report Types (11 Total)**

- **Revenue Trend** â€” Daily revenue from invoices over the selected period with invoice counts per day.
- **Tech Utilization** â€” Completed jobs, revenue generated, and total hours worked per technician.
- **Job Pipeline** â€” Breakdown of all jobs by status (pending, scheduled, in progress, completed, cancelled).
- **Jobs by Category** â€” Distribution of jobs across categories (repair, maintenance, installation, etc.).
- **Jobs by Source** â€” Where your jobs come from: web portal, phone, SMS, email, or manual entry.
- **Invoice Aging** â€” Unpaid invoices grouped by age buckets (0-30, 31-60, 61-90, 90+ days) with balance details.
- **Customer Leaderboard** â€” Top 20 customers ranked by total revenue and invoice count.
- **Quote Conversion** â€” Approval rate, decline rate, pending count, expired count, and total quote values.
- **Profitability** â€” Weekly revenue vs. costs with calculated profit and margin percentages.
- **Average Job Metrics** â€” Average duration and value per job category for completed work.
- **Inventory Alerts** â€” Materials below their minimum stock threshold, sorted by urgency.

**Delivery Methods**
- **Email** â€” Report file attached directly to the email via SendGrid.
- **SMS** â€” Report uploaded to secure storage; a 7-day download link is texted to your phone.

**File Formats**
- **CSV** â€” Spreadsheet-compatible, opens in Excel or Google Sheets.
- **Excel (.xlsx)** â€” Native Excel workbook.
- **PDF** â€” Formatted document for printing or sharing.

**Frequency Options**
- **Daily** â€” Run once per day at your chosen time(s).
- **Weekly** â€” Run on selected days of the week.
- **Monthly** â€” Run on specific days of the month.

**Advanced Settings**
- **Multiple times per day** â€” Schedule a report to run at 8 AM and 5 PM.
- **Date range** â€” Reports default to the last 30 days. Set a custom lookback period in report parameters.
- **Pause/Resume** â€” Toggle reports active or inactive without deleting them.

**Tips:**
- Start with a weekly Revenue Trend and Invoice Aging report for quick financial oversight
- Use the Customer Leaderboard monthly to identify your most valuable accounts
- Quote Conversion reports help you optimize your pricing and response times`,lastUpdated:"2026-04-27",keywords:["report","schedule","automated","email","SMS","revenue","utilization","pipeline","aging","profitability","quote conversion","customer leaderboard","inventory alerts","CSV","Excel","PDF","daily","weekly","monthly"]},{id:"ai-voice-receptionist",title:"AI Voice Receptionist (Amy)",category:"addons",content:`Your AI phone receptionist, Amy, answers inbound calls on your dedicated business number and handles customer intake automatically.

**How It Works**
1. A customer calls your DispatchBox phone number.
2. Amy greets them by your company name and offers to help schedule a service, check on a job, speak with someone directly (if call forwarding is configured), or take a message.
3. Amy follows a **Strict Call Structure** to ensure no details are missed before ending the call:
   - **Name Collection**
   - **Issue Description**
   - **Service Address**
   - **Contact Preference**
   - **Availability**
4. Once all key information is gathered, Amy **Mandatorily Recaps** the information clearly: "To recap, you need [service] at [address] around [dates]." She then politely ends the call with "Thank you, and we will reach out to you... Goodbye."

**Smart Caller Recognition**
If the caller's phone number matches an existing customer in your database, Amy:
- Greets them by name
- Uses the address on file (no need to ask again unless the service is at a different location)
- Focuses on understanding the new issue quickly

**No-Response Handling**
If a caller goes silent, Amy doesn't hang up immediately:
- **First 10 seconds** â€” Amy says "I'm still here! Take your time."
- **After 20 seconds** â€” Amy asks "Are you still there?"
- **After 30 seconds** â€” Amy says it sounds like there may be connection issues and promises to call back in 5 minutes.
- **5-Minute Callback** â€” Amy automatically calls the customer back, mentions the possible connection issues from the earlier call, and picks up where the conversation left off with all previously collected information intact.

**Talk to a Human**
If your organization has a call forwarding number configured (set in Organization Settings), callers can ask to speak with someone directly and Amy will transfer the call.

**Voicemail Fallback**
If the caller explicitly asks to leave a message, Amy transfers to voicemail recording.

**What Gets Created**
After a successful call, Amy creates:
- A **support ticket** with the caller's info, issue description, service address, and urgency level.
- Because of the structured intake, the **caller name and address** automatically propagate to your Communications Hub and Customer Inquiries dashboards.
- A **job** linked to the ticket for scheduling
- If auto-quoting is enabled, an **AI-generated quote** is attached

**Tips:**
- Make sure your organization name is set correctly â€” Amy uses it in the greeting
- Configure a call forwarding number in Organization Settings if you want callers to be able to reach a human
- The callback feature ensures you never lose a lead, even if the connection drops`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["voice","phone","call","AI","Amy","receptionist","inbound","callback","retry","ticket","speech","greeting","forwarding","voicemail","knowledge","learning","training","FAQ","questions","address","required","fast","response","recap"]},{id:"ai-voice-management",title:"Platform AI Voice Management",category:"addons",content:`Site Administrators can centrally manage AI Voice settings and review call data across all tenants.

**Voice Profiles**
Create and edit global \`ai_voice_profiles\`. Each profile defines:
- **Greeting** â€” The initial script the AI uses to answer calls.
- **Data Collection** â€” Required fields to gather (name, address, issue) and retry limits.
- **Confirmation** â€” The final script used before ending the call.
- **Behavior** â€” AI tone and call hand-off or transfer conditions.

**Customer Search & Assignment**
Use the **Customer Search** tab to locate an organization and assign them a specific AI Voice Profile. This allows you to deploy custom profiles for different industries or VIP clients.

**Call History Audit & Actions**
The **Call History** tab provides real-time access to all \`voice_sessions\` across the platform. You can search by phone number or Organization ID to review full call transcripts, AI summaries, and call statuses for troubleshooting.
- **Expand Details** â€” Click on any session to see the full transcript, AI summary, and collected data fields.
- **Direct Conversion** â€” If a call didn't automatically convert to a job or quote, you can manually trigger "Create Job" or "Create Quote" directly from the expanded session view to ensure no leads are lost.

**System Configuration**
The **System Config** tab controls global timeouts and defaults, such as the 15-second Twilio Gather timeout that prevents premature "no-speech" errors.

**Access**
Navigate to **Platform > AI Voice** from the sidebar (restricted to Site Admins).`,lastUpdated:"2026-04-30",keywords:["voice","admin","management","platform","profiles","history","transcripts","system config","tenant","convert","job","quote"]},{id:"inv-pdf-email",title:"Invoice PDF Download & Email Delivery",category:"invoicing",content:`DispatchBox supports full invoice delivery â€” download as PDF or send directly to your customer's email.

**Download PDF**
On any invoice detail page, click **"Download PDF"** to generate a professional PDF document. The PDF includes:
- Your invoice number and status badge
- Bill-to customer details
- Line items with quantities, unit prices, and totals
- Subtotal, tax, payments applied, and balance due
- Footer with generation date

The PDF downloads instantly to your device â€” no cloud processing needed.

**Send Invoice by Email**
Click **"Send & Lock"** on a draft invoice to:
1. Validate the customer has an email address
2. Send a branded HTML email via SendGrid with the full line-item breakdown
3. Lock the invoice from further editing
4. Mark it as "Sent"

The email includes:
- Your company name and branding colors in a gradient header
- Large "Amount Due" callout
- Full line-item table with descriptions and amounts
- Payment history (if partial payments exist)
- Balance due summary

**Email Audit Trail**
Every sent invoice is logged in the system with the recipient email, timestamp, and sender for compliance.

**Troubleshooting:**
- *"Cannot send: customer has no email"* â€” Add an email to the customer record first
- *Invoice already locked?* â€” Use "Unlock to Edit" to make changes, then resend`,lastUpdated:"2026-04-29",keywords:["invoice","PDF","download","email","send","lock","delivery","sendgrid","branded","template"]},{id:"inv-overdue",title:"Overdue Invoice Detection",category:"invoicing",content:`DispatchBox automatically flags invoices as **overdue** when they pass their due date.

**How It Works**
Any invoice with a status of "Sent" or "Partial" that has a due date in the past is automatically displayed as **OVERDUE** with a red pulsing badge â€” no manual action required.

**Where You'll See It**
- **Invoices List** â€” The status column shows a pulsing red "overdue" badge
- **Invoice Detail** â€” The status badge in the header changes to red with "OVERDUE"

**Important Notes**
- The overdue status is computed in real-time from the due date â€” it's not stored in the database
- Paid and voided invoices are never flagged as overdue
- Setting a due date on your invoices enables this automatic detection

**Tips:**
- Set due dates when creating invoices (e.g., Net 30, Net 60) to activate overdue tracking
- Use the Invoices list to quickly spot overdue items and follow up
- Consider sending a reminder email to customers with overdue balances`,lastUpdated:"2026-04-29",keywords:["overdue","past due","late","payment","due date","delinquent","aging","unpaid","outstanding"]},{id:"inv-lifecycle",title:"Invoice Lifecycle & Statuses",category:"invoicing",content:`Each invoice progresses through a defined lifecycle:

**Status Flow:**
- **Draft** (yellow) â€” Created but not yet sent. Fully editable. Generated automatically from job completion or created manually.
- **Sent** (blue) â€” Delivered to the customer via email. Locked from editing.
- **Partial** (orange) â€” Some payments received but balance remains.
- **Paid** (green) â€” Fully paid. Balance is zero.
- **Overdue** (red, pulsing) â€” Sent or Partial invoice past its due date.
- **Void** (red, strikethrough) â€” Cancelled. Shown with reduced opacity.

**Key Actions:**
- **Send & Lock** â€” Emails the invoice and locks it
- **Download PDF** â€” Generates a downloadable PDF
- **Record Payment** â€” Log a check, cash, or card payment against the invoice
- **Unlock to Edit** â€” Re-opens a locked invoice for corrections
- **Mark as Paid** â€” Quick action from the invoice list
- **Void Invoice** â€” Cancels the invoice permanently

**Auto-Generated Invoices**
When a job is completed via the Job Completion Wizard, a draft invoice is automatically created with all parts, labor, mileage, and other charges. Navigate to the invoice from the job detail page's linked invoice ID.`,lastUpdated:"2026-04-29",keywords:["invoice","lifecycle","status","draft","sent","paid","void","partial","overdue","workflow","lock","unlock"]},{id:"inv-upfront-payment-policy",title:"Upfront Payment & Paid Estimate Policy",category:"invoicing",content:`Protect your business by requiring upfront deposits or paid estimate fees before service begins.

**Setting Up Your Policy**
1. Go to **Organization Settings â†’ Financial**.
2. Enable the **Upfront Payment Policy** toggle.
3. Choose your **Default Deposit Rule**:
   - **No Default** â€” set deposits per-quote manually
   - **Always Require** â€” 50% of every quote total
   - **New Customers Only** â€” deposits only for first-time customers
   - **Over $ Threshold** â€” require deposits when the quote exceeds your set dollar amount
   - **100% of Materials/Parts** â€” collect the full materials cost upfront
   - **Paid Estimate** â€” charge a flat fee for on-site evaluations

4. Set your **Deposit Percentage**, **Threshold Amount**, or **Paid Estimate Fee** depending on the selected rule.
5. Write a **Payment Disclaimer** that will be shown to customers on the payment form.
6. Click **Save Changes**.

**How It Works**
When you create a new quote, the deposit rule is auto-applied based on your organization's policy. Technicians can override the deposit condition per-quote if needed.

After the customer approves the quote, they'll see a prominent **"Pay Now"** button linking to a secure Stripe Checkout page. Payment is collected instantly and recorded on both the quote and linked job.

**Q: Will the deposit be deducted from the final invoice?**
**A:** Yes â€” when you convert an approved quote to an invoice, the system automatically deducts the paid deposit from the balance due.

**Q: What if the customer doesn't pay the deposit?**
**A:** The quote and job remain in their current status. The technician can follow up manually or resend the payment link.`,lastUpdated:"2026-05-07",keywords:["deposit","upfront","payment","paid estimate","policy","stripe","checkout","prepay","materials","threshold","new customer"]},{id:"inv-customer-deposit-payment",title:"Customer Deposit Payment Flow",category:"invoicing",content:`When a deposit or paid estimate fee is required, customers receive a secure payment link via text or email.

**Customer Experience**
1. Customer receives a link to the quote page (QuoteView).
2. After approving the quote, a **"Pay Deposit"** banner appears with the amount and a link to the payment page.
3. The payment page shows:
   - Your company branding and logo
   - Quote summary and scope of work
   - Deposit/paid estimate amount breakdown
   - A legal disclaimer from your organization settings
   - A **"Pay Now"** button powered by Stripe
4. After clicking **Pay**, the customer is redirected to Stripe's hosted checkout.
5. Upon successful payment, the page updates in real-time to confirm receipt.

**For Technicians & Dispatchers**
Once the deposit is paid:
- The **Quote** is marked with a green "Deposit Paid" badge
- The linked **Job** record is updated with the payment reference
- When you **convert the quote to an invoice**, the deposit is automatically deducted from the balance due and shown as "Deposit Applied (via Stripe)" in the payment history

**Payment Security**
All payments are processed through **Stripe Checkout** â€” card details never touch your servers. Stripe handles PCI compliance automatically.

**Troubleshooting**
- *Customer says payment failed* â€” Check the Stripe Dashboard for declined transactions
- *Deposit not showing as paid* â€” The webhook may be delayed; refresh the quote page in a few seconds
- *Need to refund a deposit* â€” Process the refund directly through your Stripe Dashboard`,lastUpdated:"2026-05-07",keywords:["deposit","payment","customer","stripe","checkout","paid estimate","refund","link","text","email","secure"]},{id:"quote-change-requests",title:"Quote Change Requests & Revisions",category:"invoicing",content:`Customers can request changes to a quote before approving it. DispatchBox supports this through multiple channels â€” the web quote page, AI voice callback, and the admin Quotes Management panel.

**Customer Channels for Requesting Changes**

1. **Web Quote Page** â€” On the customer-facing quote page, if the quote is not yet approved, the customer sees an **"Approve"**, **"Propose Changes"**, and **"Decline"** button. Clicking "Propose Changes" opens a text box where they can describe what they'd like changed.

2. **AI Voice Callback** â€” When Amy calls the customer with a quote, the customer can verbally request changes (e.g., "Can we just do the sink?" or "That's too much, can you lower the price?"). Amy records the request, sets the quote to "Tech Review," texts the customer a link to the current quote, and notifies the technician.

**What Happens Internally**
When a customer submits a change request (via web or phone):
- The quote status changes to **"tech_review"** (displayed as "Needs Review" in your Quotes list)
- The customer's message is logged in the **Communication History** on the quote
- If the request came via AI voice, Amy texts the customer the quote link for reference

**Technician / Dispatcher Response Options**

From the **Quotes** page, you'll see a banner when quotes need review. Each "Needs Review" quote shows:
- The customer's change request message
- Two quick-action buttons: **"Revise Quote"** and **"View Details"**

From the **Quote Detail** page (click into any tech_review quote), you get a full response panel:

1. **Revise & Resend Quote** â€” Opens the quote editor pre-populated with the current line items. Make your changes, then click "Send to Customer" to push the updated quote back to the customer. The previous version is archived for history.

2. **Send Reply (No Price Change)** â€” Add a message to the customer explaining why the quote stands as-is, then send it back for re-approval without changing any line items. The quote status returns to "Sent."

3. **Trigger AI Callback** â€” Schedule an AI callback to the customer to discuss the quote over the phone. Useful when the customer's request is unclear or needs a conversational follow-up.

**Communication History**
All messages between customer and tech are displayed in a chat-style history on the quote page. Customer messages appear on the right (blue), technician messages on the left (white). This ensures complete transparency for everyone.

**Quote Versioning**
When you revise and resend a quote, the system automatically:
- Archives the previous version in a "previousVersions" array
- Increments the version number
- Timestamps the revision

**Q: Can a customer submit multiple change requests?**
**A:** Yes â€” if the tech sends a revised quote and the customer still wants changes, they can click "Propose Changes" again, triggering another review cycle.

**Q: Can the AI accept change requests during the callback?**
**A:** Yes â€” if the customer says something like "can we change," "that's too expensive," "remove," "just the sink," etc., Amy will log the request and set the quote to tech review.

**Q: What statuses can a quote have?**
**A:** Draft â†’ Sent â†’ Viewed â†’ Approved / Declined / Tech Review (change requested). From Tech Review, the tech sends it back as Sent after revising or replying.`,lastUpdated:"2026-05-08",keywords:["quote","change","request","revision","modify","tech review","propose changes","callback","voice","revise","resend","negotiate","price","dashboard","notification","banner"]},{id:"quote-communication-history",title:"Quote Communication History & Status Tracking",category:"invoicing",content:`Every quote includes a **Communication History** section that tracks all messages and status changes between customers and technicians in a visual timeline.

**Message Types**

1. **Customer Messages** â€” Shown as blue chat bubbles on the right side, these are change requests or comments from the customer.

2. **Technician Messages** â€” Shown as white chat bubbles on the left side, these are replies from the tech or dispatcher.

3. **Status Changes** â€” Shown as centered gray pills with an amber dot, these automatically record when the quote changes hands. Each status change shows:
   - A description of what happened (e.g., "Quote revised and resent by John")
   - A **"Waiting for..."** badge indicating who needs to act next

**"Waiting for" Indicators**

The communication history shows who has the ball in their court:
- **â�³ Waiting for Customer** (blue badge) â€” The tech has sent or updated the quote; it's the customer's turn to review and respond
- **â�³ Waiting for Technician** (amber badge) â€” The customer has requested changes; the tech needs to revise or reply

These indicators appear both in the timeline history and as a current status badge at the bottom of the Communication History section.

**Adding Revision Comments**

When editing an existing quote, a **"Reply to Customer"** (or "Add a Note") section appears above the save buttons:
- If the quote is in tech_review status, the customer's latest change request is displayed for context
- Type your response explaining the changes you made
- The comment is automatically added to the communication history when you save

**Automatic Tracking**

Status change entries are added automatically whenever:
- A customer proposes changes â†’ "Change requested by customer â€” awaiting technician review"
- A tech revises and resends â†’ "Quote revised and resent by [Name] â€” awaiting customer response"
- A tech replies without price change â†’ "Technician replied â€” awaiting customer response"

**Q: Do I have to add a comment when revising a quote?**
**A:** No, it's optional. But it's recommended â€” the customer can see your explanation in the communication history.

**Q: Can the customer see the "Waiting for" indicators?**
**A:** Yes, both parties see the full communication history including all status changes.`,lastUpdated:"2026-05-08",keywords:["communication","history","status","tracking","waiting","timeline","comment","revision","note","message","customer","technician"]},{id:"portal-ai-quote-generation",title:"AI Quote Generation from Portal Submissions",category:"invoicing",content:`When a customer submits a **Quote Request** through your public portal, DispatchBox instantly confirms the request and generates an AI draft quote in the background for your review.

**How It Works**

1. Customer fills out your portal's quote request form.
2. The form submits **instantly** (2-3 seconds) — creating a ticket, generating a tracking code, and returning a confirmation.
3. The customer receives a **confirmation email** with their tracking code.
4. **In the background**, DispatchBox's AI analyzes the request and generates a draft quote with:
   - **Labor line items** — diagnostic time, repair work, testing & cleanup
   - **Material line items** — matched against your inventory with vendor pricing
   - **Equipment charges** — specialized tools if needed
   - **Tax** — automatically calculated from your organization's default tax rate
5. The draft quote appears in your **Intake Dashboard** for review. **It is NOT sent to the customer automatically.**

**Tech Review Workflow**
1. Go to **Intake** or **Communications Hub** to see the new ticket.
2. Click **"Review AI Quote"** to see the AI-generated estimate.
3. Adjust line items, labor hours, materials, or pricing as needed.
4. Click **"Send to Customer"** when ready — only then does the customer receive the quote.

**Customer-Facing Quote View**
When a customer views their quote (after you send it), the view is customer-friendly:
- Technical repair steps and AI diagnosis details are **hidden**
- Only the customer's original service description is shown as the "Scope of Work"
- Line item totals, tax, and grand total are clearly displayed
- The customer can Approve, Request Changes, or Decline

**Quote Recovery**
If the background AI quote generation fails for any reason, you'll see a prompt in the AI Recommendation panel:
- Click **"Generate Quote"** to retry quote creation manually
- The ticket is always created successfully — only the AI analysis might need retry

**Tax Rate Configuration**
AI quotes use your organization's default tax rate. To set this:
1. Go to **Organization Settings** → **Rate Card**
2. Set the **Default Tax Rate** percentage (e.g., 4.712% for your service area)
3. All future AI quotes will automatically apply this rate

**Tips:**
- Portal submissions return in under 5 seconds — no more long loading screens
- AI quotes are always drafts — they require your approval before the customer sees them
- You can edit any line item before sending the quote
- The tracking code works immediately — the customer can check status before the quote is ready`,lastUpdated:"2026-05-27",keywords:["portal","AI","quote","generate","automatic","labor","materials","tax","customer view","scope","recovery","timeout","line items","estimate","background","async","instant","fast","review","approval"]},{id:"comms-call-transcript-viewer",title:"Viewing Call Transcripts & AI Details",category:"communications",content:`Every phone call handled by your AI Voice Agent is recorded as a full transcript. You can view the transcript and AI-extracted details from multiple places â€” the Communications Hub inbox, the Admin Dashboard, and directly inside the AI Quote review panel.

**How to View Transcripts**
1. Go to **Communications Hub** â†’ **Inbox** tab.
2. Look for ticket cards with a **"View Transcript & Details"** link (shown in indigo text with an expand arrow).
3. Click anywhere on the ticket card to expand the detail panel.
4. Click again to collapse it.

**What You'll See**
The expanded panel shows two sections:

***AI Extracted Details:***
A grid showing the key data points the AI collected during the call:
- **Name** â€” The caller's name
- **Description** â€” What they need help with
- **Address** â€” Service location
- **Contact Preference** â€” How they want to be reached (call, text, or email)
- **Intent** â€” Whether it's a service request or quote request
- **Availability** â€” When they're available for service

Internal fields (prefixed with underscores) are automatically hidden for a clean view.

***Call Transcript:***
A chat-style conversation log showing the full back-and-forth between the caller and the AI agent. Messages from the **AI Agent** appear on the left (purple), and messages from the **Caller** appear on the right (blue).

**Transcript Inside the AI Quote Panel**
When you click **"Review AI Quote"** from the Admin Dashboard or Communications Hub, the quote panel now includes a built-in **Call Transcript** section:
- Located between the **Customer Details** and **AI Diagnosis** sections
- Shows the total message count as a badge (e.g., "14 messages")
- Click the header to expand/collapse the transcript without leaving the quote view
- Chat-style bubbles: AI Agent messages on the left (purple), Caller messages on the right (blue)
- Timestamps are shown for each message when available
- Scrollable container (max 288px) for long conversations

This allows dispatchers and technicians to review the full call context â€” what the customer actually said â€” while simultaneously editing the AI-generated quote. No more switching between views.

**For Acknowledged & Completed Tickets**
When viewing tickets that have already been acted on, the expanded panel also shows:
- **View Job** button â€” Links directly to the associated job
- **View Quote** button â€” Links to the quote (if an AI quote was generated)

This makes it easy to trace any call back to the work it generated.

**For Pending Tickets**
Pending tickets also show the full **AI Quote Review Panel** below the transcript, allowing you to review and send the AI-generated quote in one place.

**Tips:**
- All voice call tickets show the expand link â€” even old ones
- The transcript is saved permanently to the ticket record
- Use transcripts to verify what the customer actually said vs. what was extracted
- Portal form submissions and email tickets may not have transcripts
- The inline transcript in the quote panel is especially useful when calibrating AI-generated line items against the customer's actual description`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["transcript","call","details","view","expand","history","AI","voice","collected","extracted","conversation","log","inbox","communications","timestamp","quote panel","inline","dashboard"]},{id:"ai-voice-quote-callback",title:"AI Voice Quote Callbacks",category:"communications",content:`When a customer requests a quote via phone, Amy (your AI agent) can call them back to present the quote details and facilitate approval â€” all hands-free.

**How It Works â€” The 3-Step Flow**

1. **Identity Verification** â€” Amy calls and asks: "Am I speaking with [Name]?" before sharing financial details.

2. **Quote Interest** â€” Once confirmed: "Would you like to hear the details now, or would you prefer I text or email it?"

3. **Quote Presentation** â€” Amy reads the quote based on your Presentation Mode (Single Price, Category Rollup, or Detailed Line Items). Discounts are automatically mentioned.

**Customer Response Options**
- **Approve** â€” Quote approved, then Amy starts **customer-driven scheduling**
- **Text/Email** â€” Amy sends the quote link via SMS
- **Questions or Changes** â€” Amy captures feedback and routes to technician
- **Human Discussion** â€” Amy queues a human callback
- **Decline** â€” Gracefully ends the call

**Customer-Driven Scheduling (After Approval)**
When a customer approves, Amy does NOT immediately list random time slots. Instead:
1. Amy confirms: "Your quote has been approved. Let's get you scheduled."
2. Amy asks: "**What day of the week works best for you?**"
3. Customer says their preference (e.g., "Monday", "tomorrow", "morning")
4. Amy checks the **assigned technician's actual schedule** for matching availability
5. Amy presents 1-3 time windows that match the customer's preference
6. If the requested day isn't available, Amy tells them which days ARE open
7. Customer can request a different day at any point

This ensures scheduling is driven by the customer's needs, verified against real tech availability.

**Review-First Workflow**
Callbacks are set to **"Awaiting Review"** by default â€” they won't call automatically. Trigger from the dashboard after reviewing.

**Questions & Changes Routing**
Customer feedback is saved as a Customer Note, quote set to "Tech Review", and the customer gets a text link for reference.

**Tips:**
- Scheduling uses the assigned tech's real schedule, not random slots
- Customers pick their preferred day first
- Names default to "there" if unclear
- All transcripts are saved and viewable in Communications Hub`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["callback","voice","quote","AI","Amy","phone","call","approval","review","discount","questions","changes","identity","verification","technician","presentation","outbound","customer driven","scheduling","day preference","tech schedule"]},{id:"unified-communications-hub",title:"Unified Communications Hub (Customer Detail)",category:"customers",content:'The **Unified Communications** tab on the Customer Detail page consolidates ALL communication history with a customer into a single searchable, filterable timeline.\\n\\n**What It Shows**\\nThe hub aggregates data from six different sources into one chronological view:\\n- **Phone Calls** â€” AI voice sessions (inbound & outbound callbacks) with full expandable transcripts\\n- **Text Messages (SMS)** â€” All sent and received text messages\\n- **Emails** â€” Every outbound email (automated and manual) with type labels (e.g., Quote Sent, Auto Reply, Proxy Reply), sender name, subject, and delivery status\\n- **Quote Interactions** â€” Quote-related notes, approval records, and change requests\\n- **Internal Notes** â€” Internal communication notes from ticket workflows\\n- **Automated Messages** â€” Scheduled follow-ups, reminders, and surveys\\n\\n**Search & Filter**\\n- **Search bar** â€” Search across all message content, titles, and summaries\\n- **Filter pills** â€” One-click filters: All, Calls, Emails, Texts, Quotes\\n- Each filter shows a count badge so you know how many records exist per type\\n\\n**Expandable Transcripts**\\nFor AI voice calls, click any call entry to expand the full transcript in a chat-style view with AI messages on the left and customer messages on the right.\\n\\n**Status Badges**\\nColor-coded badges: Sent, Pending, Completed, Scheduled, Approved, Failed, Cancelled, or Logged.\\n\\n**Deep Links**\\nEntries linked to jobs or quotes include a "View" link navigating directly to the associated record.\\n\\n**How to Access**\\n1. Navigate to **Customers** in the sidebar\\n2. Click on any customer\\n3. Select the **Communications** tab\\n4. The timeline loads automatically with all history\\n\\n**Tips:**\\n- Data is fetched lazily â€” only loads when you open the Communications tab\\n- All phone number variants are matched (with/without +1 prefix)\\n- The timeline is sorted newest-first by default\\\\n- Automated emails (confirmations, intake links, proxy replies) are logged here automatically',lastUpdated:new Date().toISOString().split("T")[0],keywords:["communications","hub","timeline","history","customer","search","filter","transcript","call","email","sms","text","quote","unified","detail"]},{id:"platform-comms-monitor",title:"Platform Communications Monitor",category:"addons",content:`The **Communications Monitor** is a Site Admin tool for tracking email deliverability, SMS health, and voice call activity across all organizations on the platform.

**How to Access**
From the **Site Administration** page, click the purple **Comms Monitor** button in the header. Or navigate directly to **/platform/comms-monitor**.

**Email Events Tab**
Shows real-time webhook events from SendGrid:
- **Bounces** (red) — The recipient's mail server rejected the email.
- **Spam Reports** (rose) — A recipient marked the email as spam.
- **Unsubscribes** (amber) — A recipient clicked the unsubscribe link.
- **Delivered / Opened / Clicked** (green/blue) — Successful delivery engagement.
- Click any row to expand full bounce details, classification, and response.

**Email Logs Tab**
Shows every email sent by the system with status:
- **Sent** — Delivered to SendGrid successfully.
- **Failed** — SendGrid rejected or errored. Expand for error details.
- **Skipped (Suppressed)** — Address is on the suppression list, email was not sent.

**Suppressions Tab**
Lists all email addresses that have been auto-blocked due to bounces, spam complaints, or unsubscribes.
- **Blocked** — Active suppression; no emails will be sent to this address.
- **Cleared** — Previously suppressed, manually removed by admin.
- Click **Unsuppress** to re-enable email delivery to an address.

**Voice & Calls Tab**
Shows all AI voice sessions across organizations:
- Caller phone, customer name, org, intent, and status.
- Expand any row to view the full conversation transcript.

**Stats Bar**
Four summary cards at the top show current counts: Bounces/Issues, Delivered, Suppressed Addresses, and Voice Sessions.

**Tips:**
- Search works across all tabs — filter by email address, org, status, or phone number.
- Bounces automatically suppress the address to protect domain reputation.
- Check this page after large email campaigns to catch delivery issues early.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["communications","monitor","email","bounce","spam","suppression","webhook","sendgrid","voice","calls","platform","admin","deliverability"]},{id:"automated-email-notifications",title:"Automated Email Notifications & Communication Tracking",category:"communications",content:`DispatchBox automatically sends branded email notifications at key moments in the service lifecycle — and every single email is recorded in the customer's **Communication History** for a complete audit trail.\\n\\n**Unified Email Tracking**\\n\\nEvery outbound email — whether triggered automatically or sent manually — is logged in two places:\\n- **Global Email Logs** — A platform-wide record visible in the Communications Monitor for deliverability tracking.\\n- **Customer Communication History** — Each email is stored under the customer's organization record so it appears on the **Communications** tab of the Customer Detail page.\\n\\nThis means quote notifications, ticket confirmations, auto-replies, proxy replies, and intake form emails all appear in one unified timeline alongside calls, texts, and notes.\\n\\n**Email Type Labels**\\n\\nEach logged email is tagged with a descriptive type so you can quickly identify what triggered it:\\n- **Quote Sent** — Quote delivery to a customer\\n- **Quote Approved** — Approval notification to the technician\\n- **Quote Declined** — Decline notification to the technician\\n- **Quote Change Request** — Customer change request notification\\n- **New Ticket** — New service request alert to the team\\n- **Auto Reply** — Automated response to an inbound email\\n- **Intake Form** — Intake link sent to an unknown sender\\n- **Proxy Reply** — Reply forwarded through the dispatch-box address\\n- **Custom Email** — Manually composed email from the Email Inbox\\n\\nThese labels appear as badges in the Communications timeline, making it easy to filter and search.\\n\\n**Customer-Facing Emails (Automatic)**\\n\\n1. **Request Confirmation** — When a customer submits a service request (via portal, phone, email, or AI voice), they immediately receive a branded confirmation email with:\\n   - A summary of their request\\n   - A "What happens next?" section explaining the process\\n   - Your company name, logo, and brand colors\\n\\n2. **Quote Delivery** — When you send a quote to a customer (from the Inline AI Quote Panel, Quote Editor, or Communications Hub), they receive a professional HTML email with:\\n   - Quote number and estimated total\\n   - Scope of work summary\\n   - A prominent "View Full Quote →" button linking to their interactive quote page\\n   - Your company branding and colors\\n\\n3. **Job Status Updates** — When a job status changes to Scheduled, In Progress, or Completed, the customer receives a status notification email.\\n\\n**Technician / Dispatcher Emails (Automatic)**\\n\\n1. **New Service Request** — When any new ticket is created (from any source), the organization's owner, admin, or dispatcher receives an email with the source, customer info, urgency, and a "View in Dashboard" button.\\n\\n2. **Quote Approved ✅** — Instant email when a customer approves a quote, including the total and a link to schedule the job.\\n\\n3. **Quote Declined ❌** — Notification with the customer's decline reason (if provided) and a link to the quote.\\n\\n4. **Quote Change Request 🔄** — When a customer proposes changes, the tech gets an email with the customer's request text and a "Review & Respond" button.\\n\\n5. **Job Assignment** — When a technician is assigned to a job, they receive an email with location, priority, schedule, and description.\\n\\n**Branding & Sender Identity**\\n\\nAll emails use your organization's configured branding:\\n- **Company name** and **logo** in the header\\n- **Primary color** for headers and buttons\\n- **From address** uses your configured outbound email (or falls back to service@dispatch-box.com)\\n- **From name** uses your company name\\n\\nConfigure these in **Organization Settings → Branding** and **Email Settings**.\\n\\n**Email Logging & Deliverability**\\n\\nEvery email sent is logged with full metadata including: recipient, subject, sender name, email type, direction (outbound), HTML body, and delivery status (sent, failed, skipped). If an email address is on the suppression list (due to bounces or spam complaints), the system automatically skips delivery and logs it as "suppressed" to protect your domain reputation.\\n\\n**Viewing the Audit Trail**\\n\\n1. Navigate to **Customers** in the sidebar.\\n2. Click on any customer.\\n3. Select the **Communications** tab.\\n4. Use the **Emails** filter pill to see only email correspondence.\\n5. Each entry shows the email type badge, subject, sender, timestamp, and delivery status.\\n\\n**Q: Are auto-replies and intake emails also tracked?**\\n**A:** Yes — every automated response (including intake form links sent to unknown senders and proxy replies forwarded through dispatch-box) is recorded in the customer's communication history.\\n\\n**Q: Can I disable customer confirmation emails?**\\n**A:** Not currently — they're part of the automated service pipeline. They only send when the customer provided an email address.\\n\\n**Q: What if the email fails to send?**\\n**A:** The quote or request still processes normally. Email delivery is a non-blocking side-effect — if SendGrid is down, the customer can still access their quote via the direct link. The failure is logged for troubleshooting.\\n\\n**Q: How do I check if an email was delivered?**\\n**A:** Site Admins can view all email logs in the **Platform Communications Monitor** (Platform → Comms Monitor). Organization users can see delivery status on each email entry in the customer's Communications tab.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["email","notification","automated","confirmation","quote","request","approval","decline","change request","branding","sendgrid","delivery","technician","customer","trigger","tracking","audit","history","log","communication","unified","auto-reply","proxy","intake"]},{id:"email-aliases",title:"Email Aliases (Multi-Address Routing)",category:"communications",content:'**Email Aliases** let you create multiple inbound email addresses that all route to the same organization. This is perfect for department-based routing like support, billing, or emergency.\\n\\n**How It Works**\\n\\nEvery organization gets a primary email prefix (e.g., `hitopplumbers@dispatch-box.com`). With aliases, you can add additional addresses like:\\n- `support.hitopplumbers@dispatch-box.com`\\n- `billing.hitopplumbers@dispatch-box.com`\\n- `emergency.hitopplumbers@dispatch-box.com`\\n\\nAll of these route to the same organization and go through the same AI triage pipeline. The key difference: each ticket is **tagged** with the alias name (e.g., `sourceAlias: "support"`) so you can filter and prioritize accordingly.\\n\\n**Setting Up Aliases**\\n\\n1. Go to **Organization Settings → Email Settings**\\n2. Scroll to the **Email Aliases** section\\n3. Type a new alias prefix (e.g., `support.hitopplumbers`) and click **Add** or press Enter\\n4. Click **Save Changes** at the bottom\\n\\nAliases must be globally unique across all organizations. They follow the same naming rules as primary prefixes: lowercase letters, numbers, dots, and hyphens only.\\n\\n**Alias Naming Patterns**\\n\\n| Pattern | Example | Best For |\\n|---------|---------|----------|\\n| department.company | support.hitopplumbers | Department routing |\\n| location.company | maui.hitopplumbers | Multi-location businesses |\\n| service.company | plumbing.hitopplumbers | Service-type routing |\\n\\n**How Tickets Are Tagged**\\n\\nWhen an email arrives at an alias address, the resulting ticket includes a `sourceAlias` field. For example, an email to `support.hitopplumbers@dispatch-box.com` creates a ticket with `sourceAlias: "support"`. This enables future filtering and auto-assignment rules.\\n\\n**Tips**\\n- Aliases work with all existing features: AI triage, auto-reply, forwarding, and proxy reply\\n- You can add aliases to your business cards, website, and marketing materials for different departments\\n- Remove an alias anytime by clicking the ✕ button next to it in Email Settings',lastUpdated:new Date().toISOString().split("T")[0],keywords:["email","alias","aliases","multi-address","routing","department","support","billing","emergency","prefix","inbound","dispatch-box"]},{id:"email-inbox",title:"Email Inbox",category:"communications",content:`The **Email Inbox** gives you a built-in email client to manage all inbound and outbound messages directly within DispatchBox — no need to switch to Gmail or Outlook.

## Accessing the Inbox

Navigate to **Comms → Email** in the sidebar. The inbox opens with a three-panel layout:

- **Left panel**: Folder navigation (Inbox, Sent Items, Deleted Items, Archive), mailbox sub-filters, Compose button, and Email Settings.
- **Center panel**: Searchable, sortable email list with unread indicators and folder context.
- **Right panel**: Full reading pane with reply, archive, delete, and restore actions.

## Folder Navigation

The left sidebar organizes your emails into standard folders:

| Folder | Contents |
|--------|----------|
| **Inbox** | All inbound emails that are not deleted or archived. Unread count badge shown. |
| **Sent Items** | All outbound emails you've sent (compose and replies). |
| **Deleted Items** | Emails moved to trash via soft-delete. Can be restored or permanently deleted. |
| **Archive** | Emails you've archived to keep your inbox clean. |

Click any folder to filter the email list. The center panel header shows the active folder name and count.

## Mailbox Sub-Filters

When viewing the **Inbox** folder, a "Mailboxes" section appears below the folders showing each configured alias. Select a specific mailbox (e.g., "support", "billing") to see only emails sent to that address, or use **All Mailboxes** to see everything. Unread counts are shown per-mailbox.

## Sorting

A sort toolbar sits above the email list. Sort your emails by:
- **Date** (default) — Newest first, toggle to oldest first.
- **From** — Alphabetical by sender name (A→Z or Z→A).
- **Subject** — Alphabetical by subject line (A→Z or Z→A).

Click a sort option to activate it. Click the same option again to **toggle sort direction** — an arrow icon shows whether you're sorting ascending (↑) or descending (↓).

## Search

Use the **global search bar** at the top of the email list to instantly search across all email fields:
- Sender name and email address
- Recipient (To) address
- Subject line
- Email body text
- Mailbox alias name

Results filter in real time as you type. Click the **×** button to clear the search.

## Advanced Filtering

Click the **Filter** button (sliders icon) next to the search bar to expand the advanced filter panel. You can filter by:

| Filter | Description |
|--------|-------------|
| **From** | Matches sender name or email address |
| **To** | Matches recipient email address |
| **Subject** | Matches subject line keywords |
| **Date Range** | Select a start and/or end date to narrow results to a specific time window |
| **Has Attachments** | Toggle to show only emails that include file attachments (shown with a 📎 icon in the list) |

All filters are additive — applying multiple filters narrows results further. A **badge count** on the Filter button shows how many filters are active.

### Filter Chips

When the filter panel is collapsed but filters are active, a **chip bar** appears showing each active filter as a removable pill (e.g., "From: john", "After: 2026-05-01"). Click the **×** on any chip to remove that specific filter, or click **Clear all** to reset everything.

## Composing New Emails

Click the **Compose** button at the top of the left panel to start a new email. 
You can choose which address to send from by selecting one of your configured aliases from the **From** dropdown (e.g., \`support@yourco.dispatch-box.com\` vs \`billing@yourco.dispatch-box.com\`). Sent emails are securely delivered and a copy is saved to your organization's Sent Items folder.

The Compose window features a **Rich Text Editor**, allowing you to professionally format your emails with bold, italics, lists, and links.

## File Attachments

You can attach files to both composed emails and replies:
- Click the **paperclip icon** or drag-and-drop files into the compose area.
- Upload progress is shown per file.
- Attachments are stored in Firebase Storage and included in the outbound email via SendGrid.
- Emails with attachments show a **📎 paperclip icon** in the email list for quick identification.

## Reading & Managing Emails

- **Star** important emails for quick reference.
- **Archive** emails you've handled — they move to the Archive folder.
- **Delete** emails — they move to the Deleted Items (Trash) folder instead of being permanently removed.
- **Mark Unread** to flag an email for follow-up.
- **View Ticket** jumps directly to the linked job/ticket if one was auto-created.

## Trash & Restore

When you delete an email, it is **soft-deleted** (moved to trash), not permanently removed. From the **Deleted Items** folder:
- Click an email to view it in the reading pane.
- Click the **Restore** button (green) to move it back to the inbox.
- Click the **Delete** button (red trash icon) to **permanently delete** the email — a confirmation prompt will appear.

## Replying

Click **Reply** at the bottom of the reading pane to compose a response. Replies are sent automatically from the same alias address that the customer originally sent their email to. Your organization's email signature is appended automatically if configured.

## Resizable Panels

The Email Inbox uses a **three-panel layout**: sidebar, email list, and reading pane. You can **drag the dividers** between any two panels to resize them — make the email list wider for scanning subjects, or expand the reading pane for long messages. Hover over the thin border between panels to see the resize cursor, then click and drag.

## Email Settings

Click **Email Settings** at the bottom of the left sidebar to access branding and signature configuration:
- **Company Name** — Appears in email headers.
- **Sender Display Name** — How your name appears in recipients' email clients.
- **Brand Color** — Used for email template accents and gradient headers.
- **Logo URL** — Displayed in email headers and footers. A preview renders below the field.

### Visual Signature Editor

The signature editor provides a **structured form** for building a professional email signature — no HTML knowledge needed. Fields include:

| Field | Purpose |
|-------|---------|
| **Full Name** | Your name, displayed prominently |
| **Title / Role** | Job title shown under your name |
| **Company** | Company name |
| **Phone** | Phone number with 📞 icon |
| **Email** | Email address with ✉️ icon |
| **Website** | Company URL with 🌐 icon |
| **Logo / Photo** | An image URL for your signature photo or company logo |
| **Tagline** | An optional italic tagline at the bottom |

Changes are rendered in **real time** in the Email Preview section above. Toggle the signature on or off with the **Enable email signature** switch. Click **Save Changes** to persist.

### Delivery Status

Sent emails that fail to deliver (e.g., due to a temporary provider issue) are still saved in your **Sent Items** folder with a red **⚠ Failed** badge. This ensures you always have a record of attempted communications.

Settings are saved directly to your organization's configuration and apply to all outbound communications.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["email","inbox","mailbox","read","reply","compose","send","archive","star","search","inbound","outbound","messages","folder","sent","trash","deleted","restore","sort","branding","settings","signature","filter","from","to","subject","date","attachments","advanced","chips","resize","panels","drag","delivery","failed"]},{id:"portal-appointment-scheduling",title:"Portal Intents & Appointment Scheduling",category:"customers",content:`Your public portal now supports **four distinct customer intents** — matching the same workflow your AI Voice Agent uses. Customers no longer need to sign in for any of these actions.

## The Four Intents

On your public portal, visitors see a booking card with four tabs:

| Tab | Purpose |
|-----|--------|
| **Request** | General service inquiry — submit a description and get a callback. |
| **Quote** | Request a free estimate. Automatically triggers job + quote generation. |
| **Schedule** | Book an available appointment slot via a 4-step wizard. |
| **Manage** | Look up existing appointments by phone number. |

## Requesting a Service

Fill in name, phone, address, description, and urgency. The system creates a ticket and (if enabled) auto-generates a job and quote. You'll receive a **tracking code** you can use to check status.

## Getting a Free Quote

Same form as Request, but the backend tags it as a quote request and always triggers auto-quote generation regardless of org settings. The customer gets a tracking code linked to their quote.

## Scheduling an Appointment (4 Steps)

1. **Your Information** — Name, phone, email, address, issue description.
2. **Pick a Date & Time** — Select a date; the system checks real-time technician availability and shows Morning (8 AM–12 PM) / Afternoon (12 PM–5 PM) slots.
3. **Service Agreement** — Acknowledge waiver, CC on file policy, and terms.
4. **Confirm** — Review and submit. Final availability re-check prevents double-bookings.

## Managing Appointments

Click the **Manage** tab and enter your phone number. The system looks up all recent bookings associated with that number and displays them with status, date, and a **View Details** link that opens the tokenized resource viewer.

## Tracking Codes

After any submission, you receive an 8-character tracking code (e.g., **KXPV7N3R**). This code can be:
- Entered at \`/t/KXPV7N3R\` to view your ticket, appointment, or quote status.
- Shared over the phone, via SMS, or email for easy access.
- Used without any login or account.

## Availability Logic

- Each technician handles up to **2 morning** + **2 afternoon** jobs/day.
- Fully booked slots are grayed out.
- Days off show a warning message.

**Q: Can customers book same-day appointments?**
**A:** No — the earliest available date is tomorrow, up to 60 days out.

**Q: What happens to the tracking code?**
**A:** It expires after 90 days. The customer can always look up their appointments again via the Manage tab.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["portal","appointment","scheduling","booking","availability","time slot","guest","waiver","prerequisites","calendar","public portal","quote","manage","intent","tracking code"]},{id:"tokenized-access-system",title:"Tokenized Access & Tracking Codes",category:"customers",content:`DispatchBox uses **tokenized access links** to give customers frictionless access to their tickets, quotes, appointments, and invoices — no login required.

## How It Works

When a resource is created through any channel (portal, AI voice, email, SMS), the system generates an **8-character tracking code** like \`KXPV7N3R\`. This code:

- Is embedded in all outbound communications (emails, SMS, AI callbacks).
- Can be entered at \`yourdomain.com/t/KXPV7N3R\` to access the resource.
- Is read-aloud-friendly (no ambiguous characters like 0/O or 1/I/L).

## Supported Resource Types

| Type | What the Customer Sees |
|------|------------------------|
| **Ticket** | Status, description, linked quote if available. |
| **Quote** | Full quote with line items, approve/decline options. |
| **Appointment** | Scheduled date, time slot, reschedule contact info. |
| **Invoice** | Balance due, payment link. |
| **Job** | Job status, scheduling info, assigned technician. |

## Security Features

- **Scoped permissions**: Each token only grants access to specific actions (view, approve, reschedule, pay).
- **Expiry**: Tokens expire after 90 days by default.
- **Phone verification**: Sensitive actions (approvals, payments) can require phone number verification.
- **Access logging**: Every token access is recorded in an audit trail.
- **Status control**: Tokens can be consumed, expired, or revoked.

## Outbound Token Distribution

Tokens are automatically embedded in every outbound customer communication:

| Channel | What Gets a Token | Example |
|---------|-------------------|----------|
| **Quote Email** | The "View & Approve" CTA button links to \`/t/TOKEN\` instead of raw IDs. | One-click quote approval from email. |
| **Invoice Email** | "View Invoice Online" CTA + visible tracking code in the email body. | Customers can view/pay invoices without login. |
| **Ticket Confirmation** | Includes a tracking code block + "Track Your Request" button. | Customers check status anytime. |
| **SMS (New Ticket)** | Reply includes tracking code and a short token link. | \`Your tracking code: KXPV7N3R. View status: .../t/KXPV7N3R\` |
| **SMS (Auto-Quote)** | Quote link uses token URL instead of raw Firestore ID. | \`Your quote is ready! View and approve: .../t/TOKEN\` |
| **AI Voice** | Phone-created tickets generate tokens; quote SMS/email uses token links. | Callers can track their request via portal. |
| **Appointment Reminders** | SMS and email reminders include a "View Appointment" token link. | Manage or reschedule from the reminder. |

## Where Tokens Are Generated

- **Public Portal**: After any service request, quote, or appointment booking.
- **AI Voice Agent**: When tickets are created from phone calls.
- **Quote/Invoice Emails**: When techs send quotes or invoices to customers.
- **SMS Flows**: When new tickets or auto-quotes are created via inbound SMS.
- **Appointment Reminders**: When scheduled reminders fire for upcoming appointments.
- **Manage Appointments**: Legacy bookings get tokens auto-generated on lookup.

## Graceful Fallback

If token generation fails for any reason (e.g., temporary Firestore issue), the system falls back to direct resource links. This ensures emails and SMS are always delivered — never blocked by token errors.

## For Administrators

Tokens are stored in the \`access_tokens\` Firestore collection. Each token document includes the resource type, ID, org, customer info, permissions, and a full access log. Tokens are also back-linked to their source resource (e.g., the quote or invoice document stores its \`accessToken\` field).

**Q: What if a customer loses their tracking code?**
**A:** They can use the "Manage" tab on your portal to look up bookings by phone number. New tokens are generated automatically.

**Q: Can I revoke a token?**
**A:** Yes — update the token's status to "revoked" in Firestore. The customer will see a "link revoked" message.

**Q: Do tokens work for both email and SMS?**
**A:** Yes — the same \`/t/TOKEN\` URL works universally. Emails include styled CTA buttons and tracking code blocks; SMS includes a short text link.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["token","access","tracking code","tokenized","link","no login","frictionless","share","SMS","email","quote","invoice","appointment","ticket","outbound","distribution","reminder"]},{id:"customer-photo-uploads",title:"Customer Photo Uploads",category:"customers",content:`Customers can now attach photos directly from the public portal when submitting service requests or scheduling appointments — no login required.

## How Customers Upload Photos

1. On your public portal, the customer fills out the service request or appointment form as usual.
2. Below the description field, they'll see an **"Attach Photos"** section.
3. They can click to browse or drag-and-drop up to **5 images** (max 10 MB each).
4. Thumbnail previews appear instantly — they can remove any photo before submitting.
5. Photos upload automatically when the form is submitted.

## Where Technicians See Customer Photos

Once a customer submits photos, they appear in the **Job Detail → Photos** tab with an **orange "Customer"** badge. This makes it easy for techs to distinguish customer-provided images from their own before/after/issue photos.

Customer photos are stored securely in Firebase Storage under a dedicated portal uploads path and are linked to both the ticket and the auto-created job.

## File Requirements

| Constraint | Limit |
|------------|-------|
| **Max files per submission** | 5 |
| **Max file size** | 10 MB per file |
| **Accepted formats** | JPEG, PNG, GIF, WebP, BMP |

## Security

- Photos are uploaded to a **write-only public path** — customers cannot browse or read other uploads.
- Only authenticated staff (technicians, dispatchers, admins) can view the uploaded images.
- Each photo is scoped to the organization and ticket token for tenant isolation.

**Q: Can customers upload photos after submitting a request?**
**A:** Currently, photos can only be attached during the initial submission. Future updates may allow adding photos via the tracking code link.

**Q: Do customer photos count against the job's photo gallery?**
**A:** Yes — they appear alongside technician photos in the Job Detail Photos tab, categorized under the "Customer" type with an orange badge.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["photo","upload","image","picture","attachment","customer","portal","before","issue","technician","job photos","drag drop"]},{id:"email-signature-builder",title:"Email Signature Builder",category:"account",content:`Create a professional, branded email signature that is automatically appended to every outbound email — compose replies, automated notifications, quote deliveries, and more.

## Accessing the Signature Builder

1. Go to **Organization Settings → Email Settings**
2. Scroll to the **Email Signature** section
3. Toggle the signature **on** to enable it

## Visual Builder Mode (Default)

The Visual Builder provides structured fields so you don't need to write any HTML:

| Field | Description |
|-------|-------------|
| **Name** | Your full name or the company representative name |
| **Title** | Job title (e.g., "Owner", "Service Manager") |
| **Company** | Your company/organization name |
| **Phone** | Business phone number |
| **Email** | Contact email address |
| **Website** | Company website URL |
| **Logo URL** | Direct link to your logo image (or use the Upload button) |
| **Social Links** | Up to 4 social media profile URLs (LinkedIn, Facebook, Instagram, Twitter/X) |
| **Tagline** | A short company tagline or motto |
| **Brand Color** | Hex color used for accent lines and link styling |

## Uploading a Logo

Click the **Upload Logo** button (camera icon) to upload an image directly from your computer. The logo is stored in Firebase Storage under your organization's namespace and the URL is automatically filled in. Supported formats: JPEG, PNG, GIF, WebP.

## Live Preview

As you fill in the fields, a **live HTML preview** renders below the form showing exactly how your signature will appear in emails. The preview updates in real time as you type.

## Raw HTML Mode

For advanced users, click **"Raw HTML"** to switch to a code editor where you can paste or write custom HTML for your signature. This gives you full control over layout, styling, and formatting.

## How It Works

When a signature is enabled:
- All outbound emails (compose, reply, automated notifications, quote emails, etc.) automatically include your signature at the bottom
- The backend renders the structured data into a professional HTML signature with your logo, social icons, and brand colors
- If you use Raw HTML mode, that HTML is injected directly

## Tips

- Use a **square or horizontal logo** for best results (recommended max width: 150px)
- Keep your tagline short — one line works best in email clients
- Test your signature by sending a compose email to yourself
- The signature is organization-wide — all users in your org share the same outbound signature
- Social links render as clickable icon buttons in the email footer`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["signature","email signature","branding","logo","builder","visual","HTML","social links","tagline","brand color","compose","outbound","footer"]},{id:"ai-quote-pricing-transparency",title:"AI Quote Pricing Transparency",category:"jobs",content:`When DispatchBox generates an AI quote for a job, each material line item now shows exactly where the pricing comes from — giving dispatchers and technicians full confidence in the numbers before sending a quote to the customer.

## Price Source Badges

Each material line item displays a colored badge indicating its pricing source:

| Badge | Meaning |
|-------|----------|
| **Vendor** (green) | Price sourced from a vendor in your materials inventory. Shows the vendor name (e.g., "Ferguson Supply"). |
| **Inventory** (blue) | Price from your company's materials inventory (no specific vendor assigned). |
| **AI Estimate** (amber) | Price estimated by AI based on typical retail pricing. Should be verified before sending. |
| **Fallback** (red) | Default placeholder price ($25). Replace with an actual price before sending the quote. |

## Markup & Cost Breakdown

For material items, the unit price column now shows a secondary line with the complete cost breakdown:
- **cost $X.XX +Y%** — Displays the raw base cost and your organization's markup percentage (e.g., \`cost $10.00 +20%\`) so you see how the final billing price is derived.
- This helps you quickly verify that the profit margin is correct.

## Inline Tax Customization

You can now toggle tax calculations and edit the tax rate directly inline on the quote panel:
- **Display Tax** — Toggle whether tax is calculated and displayed in the totals section.
- **Tax Rate (%)** — Adjust the custom tax percentage inline to handle specific client jurisdictions. The system pre-fills your organization's default tax rate.

## Product Links

Each material line item includes a clickable link to verify pricing:
- **"View Product"** — If the material has a vendor with a product URL, this links directly to the vendor's product page
- **"Look Up Price"** — If no vendor URL exists, this opens a Google Shopping search for the item name so you can quickly verify the AI's price estimate

## Stock Level Indicators

When a material is matched to your inventory, a stock badge appears:
- **Green** — Sufficient stock (more than 5 units)
- **Amber** — Low stock (5 or fewer units remaining)
- **Red** — Out of stock (0 units)

## How Pricing Priority Works

The system determines material prices using this priority order:
1. **Preferred vendor cost** — If the material has a preferred vendor with pricing, that cost is used
2. **Any vendor cost** — If no preferred vendor, the first vendor with a valid cost is used
3. **Inventory cost** — Falls back to the material's own unit cost in inventory
4. **AI estimate** — If no inventory match, uses the AI's retail price estimate
5. **Fallback** — If all else fails, uses a $25 default (flagged in red)

## Tips

- Always review **AI Estimate** and **Fallback** items before sending a quote
- Click **"Look Up Price"** on AI-estimated items to verify against current market pricing
- Add vendor pricing to your materials inventory to automatically get accurate quotes
- The markup percentage comes from your organization's Rate Card settings`,lastUpdated:"2026-05-22",keywords:["ai quote","pricing","transparency","vendor","inventory","markup","price source","badge","stock","estimate","fallback","material","cost","google shopping"]},{id:"materials-procurement-backlog",title:"Job Materials Procurement & Backlog",category:"inventory",content:`DispatchBox's Job Materials Procurement Pipeline automates sourcing and purchasing for your approved quotes and work orders. Accessible via the **Purchase Orders** page under the **Materials Backlog** tab.

## 1. Aggregated Materials Backlog
The backlog panel automatically aggregates and groups all needed materials from:
- **Approved Quotes** — Material line items for scheduled or in-progress jobs.
- **Technician Work Requests** — Specific parts requested by technicians on-site directly from their mobile app.

## 2. AI-Driven Vendor Selection
The system evaluates available suppliers and recommends the best vendor based on unit cost, historical shipping performance, and current lead times.

## 3. Availability Validator & Lead Time Checks
We cross-reference expected delivery times with job schedules:
- **On-Time (Green)** — Arrives before the scheduled appointment.
- **Late / Risk (Red)** — Arrives after the job start. Warning flags are shown so you can choose alternative vendors or expedite delivery.
- **Unscheduled (Amber)** — The job lacks a scheduled date. Helpful prompts guide you to schedule the job so timelines can be validated.

## 4. Add to Order
Instead of manual entry, select any needed part in the backlog and click **"Add to Order"**. This lets you:
- Create a brand new draft Purchase Order (PO) for the recommended vendor.
- Append the materials directly to an existing draft PO for that vendor, consolidating shipments and saving on shipping fees.

## 5. Review & Place Orders with Vendor Integration
Once your draft PO is compiled, open the PO details page. You can now place the order directly with the vendor:
- **Real Credentials Integration** — Input your actual vendor account number, API key, or portal credentials directly, or use credentials saved in Organization Settings.
- **Sandbox Environment Switch** — Easily toggle between **Sandbox (Testing)** and **Production (Real Order)** to test integrations safely before committing funds.
- **Confirm & Place Order** — Send the order immediately via supplier APIs (e.g. Ferguson, Johnstone, or automated email integrations).

## 6. Live Audit Logs & Email Alerts
- **PO Audit Logs** — Every placement attempt logs a rich status entry in the PO details page, recording the user, timestamp, vendor response, transaction ID, and mode (Sandbox vs. Production).
- **Automated Notifications** — The system immediately fires email alerts to procurement admins and managers once an order is successfully placed, complete with product links and tracking summaries.

Once materials are received, click **"Mark Received"** on the PO details page to automatically update your warehouse or truck inventory levels!`,lastUpdated:"2026-05-22",keywords:["procurement","backlog","purchase orders","PO","vendor","materials","parts","shipping","lead time","validator","add to order","place order","ferguson","johnstone","credentials","sandbox","audit logs","notification"]},{id:"quote-terms-conditions",title:"Quote Terms & Conditions (Liability Protection)",category:"invoicing",content:`Every quote sent to a customer includes comprehensive **Terms & Conditions** that protect the technician, the service provider, and the business from legal liability.\\n\\n**What's Included**\\nThe Terms & Conditions are organized into six sections, automatically generated based on the **Jurisdiction State** set on the quote:\\n\\n1. **Payment** — Deposit requirements, payment-on-completion terms.\\n2. **Scope of Work** — Access requirements, additional work authorization, quote validity period, and concealed/unforeseen conditions clause.\\n3. **Warranty** — 90-day workmanship warranty, manufacturer pass-through warranty, warranty exclusions (misuse, neglect, acts of nature), and express disclaimer of implied warranties.\\n4. **Liability & Indemnification** — Limitation of total liability to the contract amount, exclusion of consequential/punitive damages, pre-existing condition disclaimers, code compliance notice, and customer indemnification clause.\\n5. **General Provisions** — Cancellation policy, force majeure, photo documentation notice, dispute resolution (binding arbitration), and entire agreement clause.\\n6. **Jurisdiction-Specific Notices** — Auto-generated based on the state selected on the quote.\\n\\n**Jurisdiction-Specific Protections**\\nThe system automatically adds required legal notices based on the state:\\n- **Right to Cancel Notice** — Required in most US states for home solicitation contracts (CA, TX, FL, NY, etc.)\\n- **Mechanics Lien Notice** — Required in states like CA, TX, FL, AZ, WA for home improvement work\\n- **Home Improvement License Notice** — Required in CA, CT, MD, NJ, NY, PA, VA, TN, LA, HI\\n- **State-Specific Notices** — California CSLB notice, Texas DTPA notice, Florida lien statute, Hawaii RICO notice\\n\\n**Key Legal Protections for Technicians**\\n- **Liability Cap** — Total liability is capped at the amount paid for services\\n- **Consequential Damages Exclusion** — No liability for lost profits, business interruption, or property damage not being serviced\\n- **Pre-existing Conditions** — Not responsible for wear, corrosion, or failure independent of work performed\\n- **Customer Indemnification** — Customer holds provider harmless for misuse, failure to follow recommendations, inaccurate info, or undisclosed conditions\\n- **Warranty Disclaimer** — Services provided "as is" beyond the express workmanship warranty\\n\\n**Setting the Jurisdiction**\\nWhen creating or editing a quote:\\n1. Scroll to the **Agreement** section\\n2. Select the applicable **State** from the dropdown\\n3. The Terms & Conditions will automatically adjust to include that state's required notices\\n\\n**Important Notes**\\n- These terms are displayed to the customer before they can approve a quote\\n- The customer must check "I have read and agree to the terms and conditions" before approving\\n- All liability-related clauses use conspicuous formatting (bold/uppercase) as required by most state courts\\n- Terms version is tracked on each quote for audit purposes\\n\\n**Q: Are these terms legally enforceable?**\\n**A:** These terms follow standard industry best practices and are drafted to be enforceable in most US jurisdictions. However, contract law varies by state. We recommend having a qualified attorney review the terms for your specific jurisdiction and business type.\\n\\n**Q: Can I customize the terms?**\\n**A:** The terms are currently auto-generated based on the jurisdiction. Custom terms will be available in a future update.\\n\\n**Q: What if my state isn't listed?**\\n**A:** All 50 US states are supported. The core protections (liability cap, warranty, indemnification) apply universally. State-specific notices are added for states with explicit requirements.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["terms","conditions","liability","protection","indemnification","warranty","disclaimer","legal","jurisdiction","state","mechanics lien","right to cancel","force majeure","consequential damages","arbitration","technician protection"]},{id:"comms-reply-all",title:"Using Reply All and Unified Inbox",category:"communications",content:`DispatchBox's unified Communications Hub lets you maintain full context of customer threads and communicate with multiple recipients seamlessly.

**Reply vs. Reply All:**
- **Reply** ── Only emails the primary sender of the email thread.
- **Reply All** ── Emails the primary sender and all carbon copied (CC) recipients. This keeps all relevant customers, managers, or partners in the loop directly via their emails.

**Unified Inbox Feed:**
Outbound sent email replies are automatically synchronized and visible directly inside your primary **Inbox** view, forming a chronological conversation timeline of incoming and outgoing messages.

**Customer Portal Synchronization:**
All incoming and outgoing emails (including carbon copies) are linked instantly to each customer's communication history. Customers can securely review the entire back-and-forth thread on their self-service Customer Portal under the **Messages** tab in real-time.`,lastUpdated:"2026-05-28",keywords:["email","reply all","reply","cc","carbon copy","inbox","messages","portal","sync","communications"]},{id:"comms-alias-signatures-resize",title:"Alias-Specific Signatures & Customizing the Email Grid",category:"communications",content:`DispatchBox lets you customize your professional identity for each email address you use, and dynamically adjust your workspace for maximum efficiency.

**Alias-Specific Signatures:**
If your organization has multiple email aliases (e.g. support@yourcompany.com, invoices@yourcompany.com, primary inbox), you can configure independent signatures for each address:
1. Click your **profile avatar** in the top-right corner and choose **Organization Settings**.
2. Scroll to the **Email Signature** visual editor section.
3. Use the **Configure Signature For Address** dropdown to select the address you want to configure.
4. Design the signature inline using your name, title, logo, and phone number.
5. Click **Save Changes**.

When sending replies or composing emails from that address, DispatchBox automatically appends the unique signature you designed for it.

**Sorting & Resizing Columns in the Email List:**
- **Sort by To Field** ── A new sortable "To" column is visible in your email lists. Click the **To** column header to quickly toggle between sorting in ascending or descending alphabetical order.
- **Stretchable Columns** ── You can easily customize the width of your columns (From, To, Subject, Date) by hovering your mouse over any column border header. Click and **drag the border** left or right to customize your workspace. Your custom column widths will automatically save in your browser's local storage and persist between sessions.`,lastUpdated:"2026-05-28",keywords:["email","signature","alias","resize","drag","columns","to","sort","mailbox","settings"]},{id:"comms-forwarding-threads",title:"Email Forwarding & Chronological Conversation Threads",category:"communications",content:`DispatchBox makes keeping track of customer conversations simple. The system compiles every single historical email exchanged with a customer into a single, unified conversation thread and allows direct forwarding.

**Chronological Conversation Threads:**
- **Unified History** ── When viewing any email in your Reading Pane, the system automatically groups all historical inbound and outbound emails exchanged with that specific customer.
- **Chronological Order** ── Messages render in oldest-to-newest order down the page, providing a complete narrative of the conversation.
- **Collapsible Cards** ── Past messages are neatly packaged in expandable and collapsible cards. Simply click on a message header to expand it to view its full HTML body, headers, and attachments inline.
- **Selected Auto-Expand** ── The message you selected from the email list is expanded automatically by default.

**Forwarding Emails:**
- **Forward Action** ── Click the **Forward** button next to "Reply All" inside the active message view.
- **Custom Recipient** ── Enter any email address in the **Forward To** input field.
- **Original Attachments** ── Any attachments that came with the original email will be automatically forwarded along with the email. You can also attach new files to the forward.
- **Forwarded Header** ── Standard forwarded headers detailing the original From, Date, Subject, and To recipients are automatically generated and appended at the top of the message body.`,lastUpdated:"2026-05-29",keywords:["forward","email forwarding","forwarding","thread","conversation thread","chronological","expand","collapse","attachments"]}],K=[{id:"vid-getting-started",title:"Getting Started with DispatchBox",description:"A quick tour of the dashboard, sidebar navigation, and key business metrics at a glance.",category:"getting-started",duration:"0:45",videoUrl:"/videos/tutorial-dashboard.webp",lastUpdated:"2026-04-08"},{id:"vid-create-job",title:"Creating & Managing Jobs",description:"How to create new service jobs using the sidebar, fill in details, and assign technicians.",category:"jobs",duration:"0:40",videoUrl:"/videos/tutorial-creating-jobs.webp",lastUpdated:"2026-04-08"},{id:"vid-calendar",title:"Calendar & Scheduling",description:"Master the calendar view with day, week, and month modes for scheduling your team.",category:"jobs",duration:"0:35",videoUrl:"/videos/tutorial-calendar.webp",lastUpdated:"2026-04-08"},{id:"vid-invoicing",title:"Invoicing & Getting Paid",description:"Create invoices, filter by status, view details, and send to customers for payment.",category:"invoicing",duration:"0:50",videoUrl:"/videos/tutorial-invoicing.webp",lastUpdated:"2026-04-08"},{id:"vid-materials",title:"Materials Inventory",description:"Track materials and parts across locations â€” filter by truck, warehouse, and manage stock levels.",category:"inventory",duration:"0:40",videoUrl:"/videos/tutorial-materials.webp",lastUpdated:"2026-04-08"},{id:"vid-tools",title:"Tool Tracking",description:"Keep track of company tools and equipment â€” assignments, conditions, and check-in/check-out.",category:"inventory",duration:"0:45",videoUrl:"/videos/tutorial-tools.webp",lastUpdated:"2026-04-08"},{id:"vid-customers",title:"Customer Management",description:"Manage your customer database â€” search contacts, view profiles, job history, and rate cards.",category:"customers",duration:"0:45",videoUrl:"/videos/tutorial-customers.webp",lastUpdated:"2026-04-08"}],x={Rocket:U,Calendar:N,FileText:M,Package:E,Users:R,BarChart2:D,CreditCard:P,Puzzle:j},te=()=>{const{user:c}=G(),[n,v]=s.useState(""),[r,w]=s.useState(null),[m,T]=s.useState(null),[p,k]=s.useState("docs"),[A,I]=s.useState(K),[d,u]=s.useState(null);s.useEffect(()=>{(async()=>{try{if(!(c==null?void 0:c.organizationId))return;const o=await L(B(H(J,"help_videos"),V("title")));if(!o.empty){const l=o.docs.map(i=>({id:i.id,...i.data()}));I(l)}}catch{}})()},[c]),s.useEffect(()=>{const t=a=>{a.key==="Escape"&&u(null)};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[]);const h=s.useMemo(()=>{let t=Y;if(r&&(t=t.filter(a=>a.category===r)),n.trim()){const a=n.toLowerCase();t=t.filter(o=>o.title.toLowerCase().includes(a)||o.content.toLowerCase().includes(a)||o.keywords.some(l=>l.toLowerCase().includes(a)))}return t},[n,r]),g=s.useMemo(()=>{let t=A;if(r&&(t=t.filter(a=>a.category===r)),n.trim()){const a=n.toLowerCase();t=t.filter(o=>o.title.toLowerCase().includes(a)||o.description.toLowerCase().includes(a))}return t},[n,r,A]),q=s.useMemo(()=>{const t={};return h.forEach(a=>{t[a.category]||(t[a.category]=[]),t[a.category].push(a)}),t},[h]);return e.jsxs("div",{className:"min-h-screen bg-gray-50",children:[d&&e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm",onClick:()=>u(null),children:e.jsxs("div",{className:"relative w-full max-w-5xl mx-4",onClick:t=>t.stopPropagation(),children:[e.jsxs("button",{onClick:()=>u(null),className:"absolute -top-12 right-0 text-white/80 hover:text-white transition flex items-center gap-2 text-sm",children:[e.jsx("span",{children:"Close"}),e.jsx(C,{className:"w-5 h-5"})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("h3",{className:"text-white text-xl font-bold",children:d.title}),e.jsx("p",{className:"text-white/60 text-sm mt-1",children:d.description})]}),e.jsx("div",{className:"bg-black rounded-xl overflow-hidden shadow-2xl",children:e.jsx("img",{src:d.videoUrl,alt:d.title,className:"w-full h-auto",style:{imageRendering:"auto"}})}),e.jsxs("div",{className:"mt-4 bg-white/10 backdrop-blur rounded-xl p-4 max-h-48 overflow-y-auto",children:[e.jsx("p",{className:"text-white/50 text-xs uppercase tracking-wide font-semibold mb-2",children:"📝 Narration Script — Use with ElevenLabs or Google Vids"}),e.jsx("p",{className:"text-white/80 text-sm leading-relaxed",children:$(d.id)})]})]})}),e.jsx("div",{className:"bg-gradient-to-br from-blue-700 via-amber-700 to-blue-800 text-white",children:e.jsxs("div",{className:"max-w-5xl mx-auto px-4 py-12",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center",children:e.jsx(y,{className:"w-7 h-7"})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold",children:"Help Center"}),e.jsx("p",{className:"text-blue-200 text-sm",children:"Find answers, watch tutorials, get the most out of DispatchBox"})]})]}),e.jsxs("div",{className:"relative mt-6 max-w-2xl",children:[e.jsx(S,{className:"absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300"}),e.jsx("input",{type:"text",value:n,onChange:t=>v(t.target.value),placeholder:"Search help articles and videos...",className:"w-full pl-12 pr-10 py-3.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/20 transition text-lg"}),n&&e.jsx("button",{onClick:()=>v(""),className:"absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white",children:e.jsx(C,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"flex flex-wrap gap-2 mt-6",children:[e.jsx("button",{onClick:()=>w(null),className:`px-4 py-1.5 rounded-full text-sm font-medium transition ${r?"bg-white/15 text-white hover:bg-white/25":"bg-white text-blue-700"}`,children:"All Topics"}),f.map(t=>{const a=x[t.icon]||y;return e.jsxs("button",{onClick:()=>w(r===t.id?null:t.id),className:`px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${r===t.id?"bg-white text-blue-700":"bg-white/15 text-white hover:bg-white/25"}`,children:[e.jsx(a,{className:"w-3.5 h-3.5"}),t.name]},t.id)})]})]})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 -mt-4",children:e.jsx("div",{className:"bg-white rounded-t-xl shadow-lg border border-gray-200",children:e.jsxs("div",{className:"flex border-b border-gray-200",children:[e.jsxs("button",{onClick:()=>k("docs"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${p==="docs"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(F,{className:"w-4 h-4"}),"Documentation",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:h.length})]}),e.jsxs("button",{onClick:()=>k("videos"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${p==="videos"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(b,{className:"w-4 h-4"}),"Video Tutorials",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:g.length})]})]})})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 pb-12",children:e.jsx("div",{className:"bg-white rounded-b-xl shadow-lg border border-t-0 border-gray-200 min-h-[400px]",children:p==="docs"?e.jsx("div",{className:"p-6",children:h.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(S,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No articles found"}),e.jsx("p",{className:"text-sm mt-1",children:"Try a different search term or category"})]}):Object.entries(q).map(([t,a])=>{const o=f.find(i=>i.id===t),l=x[(o==null?void 0:o.icon)||""]||y;return e.jsxs("div",{className:"mb-6 last:mb-0",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(l,{className:"w-5 h-5 text-blue-600"}),e.jsx("h2",{className:"text-lg font-bold text-gray-900",children:(o==null?void 0:o.name)||t}),e.jsxs("span",{className:"text-xs text-gray-400 ml-1",children:["— ",o==null?void 0:o.description]})]}),e.jsx("div",{className:"space-y-1",children:a.map(i=>e.jsxs("div",{className:"border border-gray-100 rounded-lg overflow-hidden hover:border-blue-200 transition",children:[e.jsxs("button",{onClick:()=>T(m===i.id?null:i.id),className:"w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition",children:[e.jsx("span",{className:"font-medium text-gray-800",children:i.title}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("span",{className:"text-xs text-gray-400 hidden sm:inline",children:[e.jsx(W,{className:"w-3 h-3 inline mr-1"}),i.lastUpdated]}),m===i.id?e.jsx(O,{className:"w-4 h-4 text-gray-400"}):e.jsx(Q,{className:"w-4 h-4 text-gray-400"})]})]}),m===i.id&&e.jsx("div",{className:"px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50",children:e.jsx("div",{className:"prose prose-sm max-w-none text-gray-700 whitespace-pre-line",children:i.content})})]},i.id))})]},t)})}):e.jsxs("div",{className:"p-6",children:[g.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(b,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No videos found"}),e.jsx("p",{className:"text-sm mt-1",children:"Videos are being produced — check back soon!"})]}):e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:g.map(t=>{const a=f.find(l=>l.id===t.category),o=!!t.videoUrl;return e.jsxs("div",{className:`group border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200 ${o?"cursor-pointer":""}`,onClick:()=>o&&u(t),children:[e.jsxs("div",{className:"relative bg-gradient-to-br from-slate-800 to-slate-900 h-40 flex items-center justify-center overflow-hidden",children:[o?e.jsx("img",{src:t.videoUrl,alt:t.title,className:"w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"}):null,e.jsx("div",{className:"absolute inset-0 flex items-center justify-center",children:e.jsx("div",{className:"w-14 h-14 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform",children:e.jsx(z,{className:"w-6 h-6 text-blue-600 ml-0.5"})})}),e.jsx("span",{className:"absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono",children:t.duration}),o&&e.jsx("span",{className:"absolute top-2 left-2 bg-green-500/90 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider",children:"Walkthrough"})]}),e.jsxs("div",{className:"p-4",children:[e.jsx("h3",{className:"font-semibold text-gray-900 mb-1 line-clamp-2",children:t.title}),e.jsx("p",{className:"text-sm text-gray-500 line-clamp-2 mb-3",children:t.description}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-400",children:[e.jsx("span",{className:"bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium",children:(a==null?void 0:a.name)||t.category}),e.jsxs("span",{children:["Updated ",t.lastUpdated]})]})]})]},t.id)})}),e.jsx("div",{className:"mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(b,{className:"w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0"}),e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-blue-900",children:"Narrated versions coming soon!"}),e.jsx("p",{className:"text-sm text-blue-700 mt-1",children:"These walkthroughs currently show silent screen recordings. Professional voiceover narration is being added — check back soon for the full tutorial experience."})]})]})})]})})})]})};function $(c){return{"vid-getting-started":"Welcome to DispatchBox! This is your main dashboard — the command center for your business. At the top, you'll see your key metrics: total revenue, open tickets, and active technicians. Below that, the Revenue Trend chart shows your monthly performance, while the Job Status Distribution gives you a real-time breakdown of where all your work orders stand. On the left is your sidebar — your main navigation. It's organized into logical groups: Work, Financial, Inventory, and People. You can collapse it anytime to get more screen space, or expand it to see the full labels. Let's explore each section.","vid-create-job":"Creating a new job is easy. Click the blue 'New Job' button at the top of the sidebar — it's always visible no matter where you are in the app. This opens the job creation form. Start by entering a title — something descriptive like 'Water Heater Replacement.' Add details in the description field so your technician knows what to expect on site. You can assign a customer from your contacts, set the priority level, and schedule the job. When you're ready, hit save and the job will appear on your dashboard and calendar.","vid-calendar":"The Calendar gives you a visual overview of all your scheduled jobs. Use the view toggles at the top to switch between Day, Week, and Month views. Navigate forward and back using the arrow buttons. Jobs show up as colored blocks — you can see the customer name, job title, and assigned technician at a glance. This is your go-to view for managing your team's daily workload and spotting scheduling conflicts.","vid-invoicing":"The Invoicing section is where you manage your billing. You'll see a list of all invoices with their status — Draft, Sent, Paid, or Overdue. Use the tabs at the top to filter by status. Click on any invoice to see the full details including line items, totals, and payment history. You can create invoices directly from completed jobs, add custom line items, and send them to your customers via email. The search bar at the top helps you quickly find any invoice.","vid-materials":"Materials Inventory helps you track all your parts and supplies. At the top, you'll see three key metrics: Total Items in stock, items running Low on Stock, and your total Inventory Value. Use the location tabs — All Locations, Truck, Warehouse, At Supplier — to filter by where your materials are stored. The search bar lets you find specific items quickly. Each material shows its category, quantity, location, and cost. You can adjust quantities with the plus and minus buttons right from the list.","vid-tools":"The Tools section lets you manage all your company equipment. Each tool shows its name, category, current assignment, and condition status. You can track which technician has which tool, when it was last serviced, and whether it needs maintenance. Click the edit button on any tool to update its details. This keeps your expensive equipment accounted for and helps prevent losses.","vid-customers":"Customer Management is where you keep all your client information organized. Search for any customer by name, email, or phone. Click on a customer to see their full profile — including contact details, service address, job history, and billing information. You can see all past and current jobs for each customer, making it easy to provide personalized service with full context of your relationship."}[c]||"Narration script coming soon for this tutorial."}export{te as HelpCenter};
