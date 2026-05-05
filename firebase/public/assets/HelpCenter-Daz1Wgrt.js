import{j as e,X as C,g as y,z as A,cG as q,w as P,n as D,U as N,P as M,F as U,c as E,cH as F,cI as R,cJ as b,s as O,e as W,f as B,an as H}from"./ui-DErz98EJ.js";import{r as s}from"./vendor-DJjfIQIo.js";import{h as L,q as z,j as Q,v as J}from"./firebase-B2ntIllQ.js";import{u as G,d as V}from"./index-Ceo8Uv_C.js";const f=[{id:"getting-started",name:"Getting Started",icon:"Rocket",description:"First steps with DispatchBox"},{id:"jobs",name:"Jobs & Scheduling",icon:"Calendar",description:"Creating and managing service jobs"},{id:"communications",name:"Communications Hub",icon:"MessageSquare",description:"Unified inbox for all customer inquiries"},{id:"invoicing",name:"Invoicing & Quotes",icon:"FileText",description:"Billing your customers"},{id:"inventory",name:"Inventory",icon:"Package",description:"Materials and tools tracking"},{id:"customers",name:"Customers & Portal",icon:"Users",description:"Customer management and self-service portal"},{id:"addons",name:"Add-on Services",icon:"Puzzle",description:"Domain, Email, SMS, and AI Phone"},{id:"reports",name:"Reports & Analytics",icon:"BarChart2",description:"Business insights and data"},{id:"account",name:"Account & Billing",icon:"CreditCard",description:"Your plan, profile, and billing"}],Y=[{id:"gs-first-login",title:"Your First Login",category:"getting-started",content:`After signing up, you'll land on your dashboard. Here's what to do first:

1. **Complete your profile** — Click your avatar in the top-right corner and select "Your Profile" to add your photo, phone number, and details.

2. **Set up your organization** — Go to Organization Settings to add your company logo, set your primary color theme, and configure your email prefix.

3. **Explore the dashboard** — Your dashboard shows today's jobs, upcoming appointments, and key business metrics at a glance.`,lastUpdated:"2026-03-11",keywords:["login","first","start","setup","begin","new"]},{id:"gs-create-first-job",title:"Creating Your First Job",category:"getting-started",content:`To create a new service job:

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
- **Work** — Dashboard, Jobs (work orders list), Calendar, Dispatch Console, and Kanban board.
- **Financial** — Invoices, Quotes, and Purchase Orders.
- **Inventory** — Materials and Tools tracking.
- **People** — Customers and Technicians.

**Key Features:**
- **New Job Button** — The prominent blue "+ New Job" button at the top of the sidebar lets you create jobs instantly.
- **Collapse/Expand** — Click the "Collapse" button at the bottom to shrink the sidebar to a slim icon rail for more screen space. Click again to expand.
- **Reports, Settings & Help** — Always visible at the bottom of the sidebar.

**Top Bar:**
- Shows your current page as a breadcrumb.
- Notification bell, Help icon, and your profile dropdown are on the right.
- Click your avatar for Profile, Organization Settings, Add-ons, and Sign Out.

**Mobile:** On phones and tablets, tap the hamburger menu (☰) in the top-left to open the sidebar as a slide-out drawer.`,lastUpdated:"2026-04-21",keywords:["navigate","menu","sidebar","find","where","collapse","expand","jobs"]},{id:"gs-customer-inquiries",title:"Customer Inquiries Dashboard",category:"getting-started",content:`When a visitor submits a service request through your **public website portal**, it appears instantly on your Admin Dashboard as a **Customer Inquiry**.\\n\\n**Where to Find Them:**\\nInquiries appear at the very top of the Corporate Admin Dashboard — above KPI cards and charts — so you never miss a lead.\\n\\n**Each Inquiry Shows:**\\n- Customer name, phone, email, and address\\n- Their service description\\n- Urgency badge (Normal or Emergency with pulse animation)\\n- Time since submission (e.g., "12 minutes ago")\\n- Whether they match an existing customer in your system\\n\\n**Quick Actions on Each Inquiry:**\\n1. **📞 Call** — One-tap dial link to the customer's phone number.\\n2. **📧 Send Quote** — Automatically creates a draft job and takes you straight to the Quote Builder with all customer details pre-filled.\\n3. **🎫 Create Job** — Creates a job record from the inquiry and opens the job detail page.\\n4. **👤 Add Customer** — Takes you to the Contacts page with the customer's name, phone, email, and address auto-filled.\\n5. **✅ Dismiss** — Marks the inquiry as acknowledged (not deleted — preserved for audit).\\n\\n**KPI Card:**\\nThe 4th KPI card on the dashboard shows the live count of pending inquiries with an amber highlight when there are active leads.\\n\\n**Tips:**\\n- Respond within 15 minutes for best conversion rates.\\n- Emergency requests show a red pulsing badge — prioritize these.\\n- The "Send Quote" button is the fastest path from lead to revenue.`,lastUpdated:"2026-04-14",keywords:["inquiry","inquiries","portal","lead","customer request","website","booking","ticket","pending","dashboard"]},{id:"jobs-calendar",title:"Using the Calendar",category:"jobs",content:`The Calendar view shows all scheduled jobs in a visual timeline.

**Views:** Switch between Day, Week, and Month views using the buttons at the top.

**Drag & Drop:** Drag jobs to reschedule them to different times or dates.

**Color Coding:** Jobs are color-coded by status — blue (scheduled), yellow (in progress), green (completed), red (cancelled).

**Quick Create:** Click any empty time slot to create a new job at that time.`,lastUpdated:"2026-03-11",keywords:["calendar","schedule","drag","drop","view","day","week","month"]},{id:"jobs-status",title:"Job Statuses Explained",category:"jobs",content:`Jobs progress through these statuses:

- **Pending** — Created but not yet scheduled or assigned.
- **Scheduled** — Has a date/time and assigned technician.
- **In Progress** — Technician has started work on-site.
- **Completed** — Work finished and signed off by customer.
- **Cancelled** — Job was cancelled.
- **On Hold** — Temporarily paused (waiting for parts, customer decision, etc.).

Technicians can update status from their mobile dashboard. Admins can change any job's status from the job detail page.`,lastUpdated:"2026-03-11",keywords:["status","pending","scheduled","progress","completed","cancelled"]},{id:"jobs-dispatch",title:"Dispatcher Console",category:"jobs",content:`The Dispatcher Console (available on Small Business and Enterprise plans) is your central command center for managing multiple technicians, assigning jobs, and optimizing field service operations.

**Dashboard Layout**
The console has four main panels:
- **Left** — Unscheduled Jobs queue (drag source)
- **Center** — Timeline Grid (drag target) or Map View
- **Right** — Tech Status sidebar (collapsible)
- **Top** — KPI stats bar with real-time metrics

**KPI Stats Bar**
A live stats strip below the header shows:
- **Unassigned** — Count of pending jobs not yet assigned (amber when > 0)
- **Scheduled Today** — How many jobs are scheduled for the selected date
- **In Progress** — Jobs currently being worked
- **Techs** — Total active technicians
- **Conflicts** — Overlapping schedule conflicts (red pulse when > 0)

**Unscheduled Jobs Panel (Left)**
All pending jobs appear here as draggable cards with:
- **Auto-Schedule Button** — Quickly schedule a job with a single click if the customer provided availability windows.
- **Priority badges** — Critical (red pulse), High (orange), Medium (blue), Low (gray)
- **Age indicators** — Green (today), Yellow (1-3 days old), Red (> 3 days old)
- **Search** — Filter by customer name, address, or description
- **Priority filter pills** — Quick-filter by All, Critical, High, Medium, or Low
- **Sort options** — By Priority (default), Oldest First, or Longest Duration
- **AI Insights** — Expand any card to see the AI-generated complexity, required skills, and needed tools
- **Quick Assign** — Hover over a card and click "Quick Assign Best Tech" to open the smart assignment modal

**Timeline Grid (Center)**
The visual scheduling timeline shows each technician as a row with time slots:
- **Capacity bars** — Each tech row shows a fill percentage (green < 60%, yellow 60-85%, red > 85%) and jobs-scheduled vs max-capacity count
- **Working hours overlay** — Non-working hours are grayed out based on each tech's availability settings
- **Current time line** — A vertical red line shows the current time (when viewing today)
- **Job blocks** — Color-coded: blue (scheduled), pulsing green (in progress), red (overdue), gray (completed)
- **Click-to-view** — Click any scheduled job block for a detailed popover showing customer info, AI recommendations, contact details, and status
- **Drag & drop** — Drag an unscheduled job from the left panel onto any time slot to schedule it. Conflict detection prevents overlapping assignments.

**Map View (Center)**
Toggle to map view to see technician routes and job locations on a live map. Each tech is color-coded with route lines.

**Tech Status Panel (Right)**
A collapsible sidebar showing each technician's real-time status:
- **Status indicators** — Available (green), On Job (blue pulse), At Capacity (red), Off Duty (gray)
- **Completion tracker** — "X/Y done" showing jobs completed vs total scheduled
- **Capacity bar** — Visual fill for the day
- **Current job** — Shows which customer the tech is currently serving
- **Next available** — Shows when the tech will be free
- **Send Next Job** — One-click button (on available techs) to auto-assign the highest priority unscheduled job
- **Filter tabs** — Filter by All, Free, or Busy

**Smart Tech Assignment Modal**
When assigning a job (via Quick Assign or drag), the system uses an AI scoring engine that ranks technicians on 5 weighted factors:
- **Skill Match (30%)** — Compares the tech's specialties to the job's required skills (with fuzzy matching)
- **Workload (25%)** — Fewer jobs today = higher score
- **Availability (20%)** — Checks weekly availability, vacation dates, and time slot gaps
- **Proximity (15%)** — Matches service areas and calculates distance from home location
- **Certifications (10%)** — Relevant, verified certifications boost the score

Each tech shows:
- A composite score (0-100) with visual breakdown bars
- Matched vs missing skills as color-coded badges
- Available time slots for the target day (click to select)
- Warnings like "At max capacity", "Outside service area", or "Limited availability"
- An **Auto-Assign Best Available** button that picks the top tech + earliest slot

**Date Navigation**
- Use the ◀ ▶ arrows to move between days
- Click **Today** to jump back to the current date
- Keyboard shortcuts: ← (previous day), → (next day)

**Tech Filter**
Click the "X Techs" dropdown to show/hide specific technicians on the timeline. Includes All/None toggle and an "Add Tech" button to invite new technicians.

**Keyboard Shortcuts**
- **←** — Previous day
- **→** — Next day
- **T** — Toggle between Timeline and Map view

Access the Dispatcher Console from the **Dispatch Console** link in the sidebar under the Work section.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["dispatch","dispatcher","console","map","assign","route","location","GPS","timeline","schedule","drag","drop","tech","technician","capacity","KPI","score","matching","smart assign","auto schedule","quick assign","unscheduled","conflict","status","availability","skills","workload","keyboard shortcut"]},{id:"jobs-list",title:"Jobs / Work Orders List",category:"jobs",content:`The **Jobs** page is your central hub for viewing and managing all work orders. Access it from the **Jobs** link in the sidebar under the Work section.

**Page Overview**
At the top you'll see the total job count, the number of unassigned jobs, and a **+ New Job** button for quick creation.

**Status Tabs**
Filter jobs by status using the tabs: **All**, **Unscheduled**, **Scheduled**, **In Progress**, **Completed**, and **Cancelled**. Each tab shows a live count.

**Search & Priority Filters**
Below the tabs, you'll find:
- **Search bar** — Filter by customer name, address, job type, or description
- **Priority pills** — Quick-filter by All, Critical, High, Medium, or Low priorities with live counts

**Table Columns**
The sortable table displays:
- **Priority** — Color-coded badge (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low)
- **Customer** — Name and service address
- **Type** — Job type (HVAC, Plumbing, Electrical, etc.)
- **Status** — Color-coded status badge
- **Assigned Tech** — The technician name, or an **Assign** button for unassigned jobs
- **Duration** — Estimated job duration in minutes
- **Age** — Time since creation (color-coded: green = recent, red = aging)

**Assigning Technicians**
For unassigned jobs, click the blue **Assign** button in the Assigned Tech column. This opens the **Smart Tech Assignment Modal** — the same AI-powered ranking engine used in the Dispatcher Console. Technicians are scored and ranked based on skills, workload, availability, proximity, and certifications.

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
- **Display Tax Toggle** — Choose whether to show Tax as a separate line item or hide it from the summary.
- **Discount Flexibility** — Add discounts as a fixed dollar amount ($) or a percentage (%) of the subtotal. You can also add an optional Reason (e.g., "First-time customer discount") that will be visible to the customer.

These settings are saved automatically when you save the quote. You can preview exactly how the customer will see the quote by viewing the saved quote before sending it.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["quote","template","display","settings","presentation mode","single price","roll-up","category","tax","discount","percentage","fixed"]},{id:"inv-materials",title:"Managing Materials",category:"inventory",content:`Track materials and parts used on jobs:

1. Go to **Materials** in the navigation.
2. Add items with name, SKU, unit cost, and current quantity.
3. Set **reorder points** to get alerts when stock is low.

**On jobs:** When closing out a job, technicians can log materials used. This automatically decrements your inventory and adds costs to the job.`,lastUpdated:"2026-03-11",keywords:["materials","parts","inventory","stock","reorder"]},{id:"inv-tools",title:"Tool Tracking",category:"inventory",content:`Keep track of your company's tools and equipment:

1. Go to **Tools** in the navigation.
2. Add tools with name, serial number, condition, and assigned technician.
3. Track tool check-out and check-in history.

Tools can be assigned to technicians and tracked across jobs for accountability.`,lastUpdated:"2026-03-11",keywords:["tools","equipment","track","assign"]},{id:"cust-directory",title:"Contact Directory & Lifecycle",category:"customers",content:`The Contact Directory provides a complete list of your contacts, automatically categorized to help your dispatching workflow:\\n\\n**New vs. Existing Contacts**\\nThe directory automatically splits your contacts into two distinct groups based on their billing history:\\n- **Existing Contacts** — Contacts who have completed jobs with payments and have a lifetime value (Total Spent > $0).\\n- **New Contacts** — Contacts who have been added to the system or submitted inquiries, but haven't yet been billed for any completed work (Total Spent = $0).\\n\\n**Custom Contact Types**\\nWhen adding a new contact, you can now define a free-form **Contact Type** (e.g., Customer, Lead, Vendor, Partner). The default type is "Customer".\\n\\n**Filtering & Sorting**\\nYou can quickly narrow down your list using the built-in search and filters:\\n- **Search** — Filter by name, email, phone, or address.\\n- **Type Filter** — Filter to show only specific contact types.\\n- **Sort By** — Order your contacts by Name (A-Z), Total Spent (High-Low), or alphabetically by Contact Type.\\n\\n**Managing Records**\\nYou can add new customers from this directory or while creating a job. To keep your database clean for troubleshooting or fixing issues, you can completely **Delete** a customer record from the actions menu on their profile.\\n\\n**Why This Helps:**\\nThis split and filtering allows dispatchers and sales teams to easily identify brand new leads who need nurturing, while keeping established, revenue-generating clients separate.`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["directory","list","new customer","existing customer","lifecycle","total spent","revenue","filter","sort","contact type","vendor","lead","delete","archive"]},{id:"cust-portal",title:"Customer Portal",category:"customers",content:`Each organization gets a customer-facing portal where your customers can:

- **View jobs** — See their scheduled, in-progress, and completed jobs.
- **View invoices** — Access and pay invoices online.
- **Send messages** — Communicate with your team.
- **Accept quotes** — Review and approve estimates.

Customers access the portal via a unique link. They log in with their email and a verification code — no password needed.`,lastUpdated:"2026-03-11",keywords:["portal","customer","self-service","access","login"]},{id:"addon-domain",title:"Custom Domain Setup",category:"addons",content:`Give your business a professional web presence:

1. Go to **Add-ons & Services** from the profile menu.
2. Enable **Custom Domain**.
3. Search for and register your domain (e.g., "billsplumbing.com").
4. DNS is configured automatically.

Your customer portal will be accessible at your custom domain. Cost: $14.99/month includes domain registration and DNS management.`,lastUpdated:"2026-03-11",keywords:["domain","website","URL","custom","DNS"]},{id:"addon-email",title:"Business Email",category:"addons",content:`Get professional email addresses at your custom domain (requires Custom Domain):

- **Starter** ($4.99/mo) — 2 email aliases (e.g., info@yourdomain.com, support@yourdomain.com)
- **Professional** ($9.99/mo) — 5 aliases + catch-all forwarding

All emails are forwarded to your existing email address. No new inbox to manage — just a professional "from" address for your business.`,lastUpdated:"2026-03-11",keywords:["email","forwarding","alias","professional","inbox"]},{id:"addon-sms",title:"Text Communications",category:"addons",content:`Send and receive SMS messages with your customers:

- **Basic** ($24.99/mo) — Dedicated phone number, 500 messages/month, appointment reminders.
- **Professional** ($49.99/mo) — 2,000 messages/month + automated follow-ups.
- **Enterprise** ($99.99/mo) — Unlimited messages + priority support.

Set up from **Add-ons & Services**, then manage conversations in the **Communications** portal.`,lastUpdated:"2026-03-11",keywords:["SMS","text","message","phone","communication"]},{id:"addon-ai-phone",title:"AI Voice Agent",category:"addons",content:`Let AI handle your phone calls 24/7 with Amy, your AI receptionist:

**Plans:**
- **Starter** ($49.99/mo) — AI answers calls, takes messages, books appointments.
- **Professional** ($99.99/mo) — Custom voice, call routing, integrates with your calendar.
- **Enterprise** ($199.99/mo) — Multi-line support, advanced routing, analytics dashboard.

**Configuration Options:**
Customize your AI agent directly from the **AI Phone Agent** tab under the **Business Profile** section.
- **Callback Workflow Mode**: Choose how the AI handles requests: 
  - *Take Message Only*: The AI collects basic info and tells the caller someone will get back to them.
  - *Schedule Service*: The AI collects full details (name, address, issue, dates) and confirms scheduling.
  - *Collect Details for Quote*: The AI collects details and asks the caller to text photos so a quote can be generated.
- **Human Transfer Number**: If a caller is frustrated, asks for a human, or has an emergency, the AI will immediately transfer the call to this number.
- **Automated Follow-Up (After Call)**: Have the system automatically text or email the caller right after the call ends. You can choose to always use SMS, always use Email, or dynamically use the caller's preferred method.

**How Amy Handles Calls:**

When a customer calls, Amy greets them with examples of how she can help: "I can help you schedule a service, get a quote, or check on an existing job." Then she collects info one question at a time:

1. **Name** — "Sure thing! Can I get your name?"
2. **Issue/Description** — "What's going on that you need help with?" (She requires specifics, not just "service call.")
3. **Address** — "What's the address or area for the service?" (General area — exact address confirmed via follow-up.)
4. **Contact Preference** — "What's the best way to reach you — call, text, or email?" Collects details based on preference.
5. **Availability** — "What days and times work best for you?"
6. **Confirmation** — Reads back details once, then tells them what to expect:
   - Service requests: "Someone from our team will be reaching out shortly to get you scheduled."
   - Quotes: "We'll get a quote over to you shortly."
7. **Ticket Created** — Immediately after the caller confirms.

**Key Features:**
• **Fast responses** — Amy responds within 2 seconds of the caller finishing.
• **Natural Pauses & Spelling** — Amy dynamically waits for the caller to finish speaking, making it easy to spell out complex information like email addresses.
• **Smart follow-up** — Uses the caller's preferred contact method for all follow-ups.
• **Automated Callbacks** — If a caller gets disconnected or goes silent due to poor connection, Amy will automatically schedule and initiate a callback 5 minutes later to pick up exactly where you left off.
• **Graceful address handling** — If unclear, moves on and confirms during follow-up.
• **Emergency Triage & Human Handoff** — Immediate transfer to your fallback number during emergencies or upon request.

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
- **Auto-Reply** — Customize automated email responses.
- **Tax Rate** — Set your default tax rate for invoices.
- **Plan Management** — View current plan and upgrade options.`,lastUpdated:"2026-04-13",keywords:["settings","organization","company","branding","configure","upload","logo"]},{id:"po-workflow",title:"Purchase Orders & Shopping Cart",category:"inventory",content:`Manage your purchasing directly in DispatchBox:

1. Go to **Purchase Orders** in the navigation to view the PO list.
2. Click **"New PO"** to create a manual Purchase Order for a vendor.
3. **Catalog Shopping Cart:** When searching the Materials Catalog, simply check the boxes next to items you need and click **"Add to Cart"**. You can checkout to instantly generate a vendor PO.
4. Send the PO URL directly to your vendor or export it to PDF.

Once the parts arrive, marking the PO as "Received" can automatically update your inventory counts.`,lastUpdated:"2026-04-03",keywords:["purchase orders","PO","vendor","shopping cart","buy","parts"]},{id:"vendor-ai-sourcing",title:"AI Vendor Price Sourcing",category:"inventory",content:`DispatchBox AI continuously monitors and saves you money on inventory:

- **Background Sourcing**: The AI looks up parts in your catalog and queries top distributors for the lowest price anonymously.
- **Price Recommendations**: When you build a Quote or PO, the system will highlight cheaper alternatives automatically.
- **Margin Protection**: Lowering vendor costs automatically improves your bottom-line without changing customer rates.`,lastUpdated:"2026-04-03",keywords:["AI","vendor","price","sourcing","cost","savings"]},{id:"inventory-locations",title:"Inventory Locations (Trucks & Warehouses)",category:"inventory",content:`Track exactly where your materials and tools are:

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

***Step 1 — Choose Your Theme:***
Pick from 6 visual website themes that control how your site looks:
- **Classic Business** — Clean, centered layout with bordered cards
- **Modern Dark** — Bold dark hero with frosted glass cards
- **Bold & Colorful** — Split hero with vivid color accents
- **Clean Minimal** — Spacious white design with flat cards
- **Warm & Personal** — Serif headings with warm tones
- **Professional Edge** — Compact, data-driven dark header

Each theme shows a live mini-preview using your brand color. Themes are non-destructive — changing your theme only changes the visual style, never your content.

***Step 2 — Choose Your Pages:***
Select which content groups to include on your website:
- **Home** (Hero, About, CTA) — always included
- **Services** (Service listings, Stats)
- **Portfolio** (Gallery, Before & After)
- **Trust & Reviews** (Testimonials, Certifications)
- **Info & FAQ** (FAQ, Hours, Service Areas)
- **Team** (Team member profiles)

Page groups are additive — sections from selected groups are created without overwriting anything that already exists.

***Step 3 — Edit Sections:***
The main editor features:
- **Grouped sidebar** — Sections organized by page group with collapsible headers
- **Section editor** — Full editing panel for titles, descriptions, and sub-items
- **Section ideas** — 14 quick-add section suggestions with descriptions
- **Reorder, toggle, delete** — Use the sidebar controls on hover

**Public Portal Design**
The portal is designed as a lead-generation landing page:
- **Hero + Booking Form** — The service request form sits prominently beside the hero text on desktop (stacked on mobile). Customers can immediately submit a request.
- **Trust Signals** — "Licensed & Insured" and "Free Estimates" badges appear below the hero.
- **Call Now Button** — One-tap calling from the hero area and header.
- **CTA Strip** — A gradient call-to-action strip at the bottom with "Request Service Now" and direct phone buttons that scroll back to the form.
- **Dark Mode Header** — The header automatically matches the theme color mode (dark themes get a dark glass header).

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
1. Go to **Communications Hub** → **Integrations** tab.
2. Click a platform card to start the setup.
3. Enter your connection credentials (Instance URL, API Key, etc.).
4. Click **Test Connection** to verify.
5. Configure **Sync Criteria** — choose which tickets to pull by category, priority, status, or assignment group.
6. Set a **Sync Frequency** (real-time, every 5/15/30 min, or hourly).
7. Click **Connect & Import Tickets**.

**Managing Imported Tickets:**
- Imported tickets appear in the Imported Tickets panel with source badge, priority, and requester info.
- Click **Convert to Job** to create a DispatchBox job from any ticket — customer info and description are auto-filled.
- Use the source filter dropdown to view tickets from a specific platform.
- Tickets that have been converted show a green "Job Created" badge with a link to the job.

**Tips:**
- Use narrow sync criteria (specific categories + high priorities) to avoid importing noise.
- The "Test Connection" button verifies credentials before saving.
- You can pause/resume any integration using the toggle switch.
- Removing an integration keeps previously imported tickets for audit purposes.`,lastUpdated:"2026-04-14",keywords:["integration","servicenow","salesforce","zendesk","jira","freshdesk","hubspot","connectwise","ticket","sync","import","ITSM","helpdesk","connect"]},{id:"comms-hub",title:"Communications Hub & Inbox",category:"communications",content:`The Communications Hub is your central nerve center for all customer interactions.

**Inbox Tab (Default)**
A real-time unified feed showing all incoming customer requests from every channel:
- **Portal Forms** — Customers filling out the service request form on your website
- **Phone Calls** — Call-ins converted to text tickets by your AI Phone Agent or dispatcher
- **Emails** — Customer email inquiries
- **Integration Tickets** — Imported from ServiceNow, Salesforce, Zendesk, etc.

Each item shows a source badge, priority level, time stamp, and customer contact info.

**Enabling AI Auto-Quote Generation**
AI auto-quoting is **off by default**. To enable it:
1. Go to **Communications Hub** → **Overview** tab
2. Find the **AI Auto-Quote Generation** card
3. Toggle it **on**

Once enabled, when a customer submits a request via your website portal:
1. A **job is automatically created** in the background
2. **AI analyzes** the service request to determine materials, tools, labor hours, and complexity
3. A **complete draft quote** is generated with line items including:
   - Diagnostic & assessment labor
   - Repair/service labor (named based on the type of work, e.g., "Replacement — Labor")
   - Testing, cleanup & final inspection
   - Materials cross-referenced against your company inventory for real costs (with your configured markup)
   - Equipment/tool rental fees for specialty tools
   - Service call / trip charge (if enabled in your rate card)
4. The quote total is shown as a badge on the **Review AI Quote** button

> **Note:** When auto-quoting is enabled, portal form submissions take approximately 15–20 seconds to complete as the AI analysis and quote generation run.

**Primary Action: Review AI Quote**
When an auto-generated quote is ready, the primary action button becomes:
- **✨ Review AI Quote $X** (indigo-purple gradient) — Expands an **inline recommendation & quote panel** directly on the inbox card with no page navigation required. The dollar amount badge shows the current draft total.
- **Add Customer** — Register the requestor in your customer database
- **Dismiss** — Archive the inquiry

**Inline AI Recommendation & Quote Panel**
Clicking "Review AI Quote" expands a rich, interactive panel right below the inquiry:

***AI Analysis:***
- **Diagnosis** — What the AI determined is wrong based on the customer description
- **Recommended Resolution** — Step-by-step repair plan with specific instructions
- **Safety Notes** — Warnings for electrical, gas, or hazardous work
- **Tools Required** — Each tool tagged as "✓ has" (in your inventory) or "✗ needs" (must source)

***Editable Scope of Work:***
Click **Edit** next to the scope header to modify the auto-generated scope text before sending.

***Cost Breakdown Summary:***
Four color-coded category cards showing totals for **Labor** (blue), **Materials** (green), **Equipment** (purple), and **Travel** (amber) at a glance.

***Quote Line Items (Fully Editable):***
Each line shows a type icon, description, quantity, unit price, and total. Hover any row to reveal:
- **Edit** (pencil icon) — Makes description, quantity, and unit price inline-editable. Totals recalculate in real time.
- **Delete** (trash icon) — Remove a line item.
- **+ buttons** at top right — "+ Labor", "+ Material", "+ Tool", "+ Travel" to add new lines.
- Optional items are tagged "(optional)" and excluded from the base total.

***Action Buttons:***
- **Save Changes** — Persist your edits to the draft quote
- **Full Quote Editor** — Open the full-page quote builder for advanced editing (overrun protection, agreements, etc.)
- **Send Quote to Customer** (green button) — Saves edits, marks the quote as "sent", and acknowledges the inquiry

**Fallback: Generate AI Recommendation**
If no auto-quote exists yet, the panel shows a **"Generate AI Recommendation"** button. Clicking it:
1. Creates a job from the inquiry
2. Runs AI analysis on the service request
3. Generates a complete draft quote with all line items
4. Loads the inline panel with results — ready to review and send

**Job Detail — Next Steps**
Once a job is created (either manually or via auto-quote), the job detail page shows a **Next Steps** panel with these actions:
- **Generate AI Quote** — Auto-create a detailed AI quote with labor, materials, and equipment
- **Create Manual Quote** — Build a quote from scratch using the quote builder
- **Perform Inspection** — Move the job directly to In Progress for on-site inspection before quoting
- **Skip Quote** — Bypass the quoting step entirely and proceed directly to scheduling or work

All buttons provide instant feedback via toast notifications.

**How AI Pricing Works**
The system prices quotes using multiple data sources:
- **Labor rates** from your rate card (base hourly rate or customer-specific rate tier)
- **Materials** are matched against your company inventory for actual costs — AI-estimated costs are used as fallback when items aren't in your inventory
- **Markup** is applied from your rate card settings (default 30%)
- **Equipment** fees use your configured equipment day rate or defaults
- **Job history** — past similar completed jobs are analyzed to calibrate hour estimates based on actual vs. estimated durations
- **Tax** calculated from your rate card's default tax rate

Emergency items show a red banner and are surfaced first.

**Filtering**
Use the source dropdown to filter by Portal Forms, Phone Calls, Emails, or Integration Tickets.

**Other Tabs:**
- **Overview** — Dashboard cards, AI Auto-Quote toggle, quick links to AI Phone Agent, SMS, and Integrations
- **Integrations** — Connect external ticketing systems (ServiceNow, Salesforce, Zendesk, Jira, Freshdesk, HubSpot, ConnectWise)
- **Email & Phone** — Configure contact email, support phone, and team cell numbers
- **Portal** — Toggle your public customer portal on/off and configure its URL slug

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

**Voice Calls — Smart Multi-Turn Intake**
When a customer calls your provisioned number:
1. The AI Phone Agent (Amy) answers and begins a natural, multi-turn conversation.
2. Amy systematically collects: **caller name**, **service address**, **issue description**, **urgency level**, and **preferred availability** — one question at a time.
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

Carrier approval typically takes 2-3 weeks. A daily background job monitors the status and updates your dashboard automatically.`,lastUpdated:"2026-04-25",keywords:["voice","call","SMS","text","inbound","phone","AI","ticket","job","intake","A2P","10DLC","compliance","multi-turn","Amy","session","smart","transfer","human","forward","dial","talk to a person"]},{id:"ai-outbound-callback",title:"AI Outbound Callback & Scheduling",category:"communications",content:`After a quote is approved, DispatchBox can automatically call the customer back to schedule their appointment using AI.

**How It Works**
1. A job is created (from voice call, text, email, or portal).
2. A dispatcher reviews and approves the quote.
3. DispatchBox computes available time slots based on technician schedules.
4. The AI calls the customer and presents 2-3 time options.
5. The customer picks a slot by speaking their choice.
6. The job is automatically marked as "scheduled" and a confirmation SMS is sent.

**Callback Mode**
You can choose how the AI handles outbound calls in Communications Hub > Overview > Outbound Callback Mode:

- **Full Callback** (with_quote) — AI shares the approved quote amount AND schedules the appointment. The customer hears: "Your approved quote is $450. We have three options..."
- **Schedule Only** (schedule_only) — AI calls to schedule but does NOT mention the quote amount. Useful when you prefer to discuss pricing separately or in person.
- **No Callback** (none) — Automated outbound calls are completely disabled. Use this if you prefer to call customers manually.

**Time Slot Computation**
Slots are computed by checking:
- Technician working hours (8 AM – 5 PM, weekdays)
- Existing scheduled/in-progress jobs for the assigned tech
- Available 2-hour windows over the next 5 business days

**Automatic vs. Manual Callbacks**
- **Auto-Callback**: Enabled when callback mode is "Full Callback" or "Schedule Only". When a quote is approved, the system automatically calls the customer during business hours (9 AM – 6 PM).
- **Manual Callback**: Click the "Call Customer" button on any approved job to initiate a callback on demand.
- **After-Hours**: If a quote is approved outside business hours, DispatchBox sends an SMS with time slot options instead of calling.

**SMS Fallback**
If the customer doesn't answer the call:
- DispatchBox automatically sends an SMS with the available time slots.
- The customer can reply with their preferred option number (1, 2, or 3).

**What the Customer Hears**
The AI introduces itself, references the approved service request, optionally shares the quote amount (based on your callback mode), then clearly presents the available appointment windows. The customer simply says which option works best.

**Configuration (Communications Hub > Overview):**
- Outbound Callback Mode — Full Callback, Schedule Only, or No Callback
- Business Hours — Callbacks are only placed during business hours
- Confirmation SMS — Automatically sent after scheduling

**Tips:**
- The callback uses Gemini AI to interpret natural responses ("the morning one", "Tuesday works", "option 2")
- All callback sessions are logged in the callback_sessions collection for audit
- Dispatchers can see callback status on the job detail view
- Changing the mode takes effect immediately for all future callbacks`,lastUpdated:"2026-04-25",keywords:["outbound","callback","scheduling","appointment","time slot","AI","phone","auto","quote","approved","SMS","fallback","technician","schedule","callback mode","schedule only","no callback","with quote","full callback"]},{id:"job-completion-auto-invoice",title:"Job Completion & Automatic Invoice",category:"invoicing",content:`When you complete a job using the **Job Completion Wizard**, DispatchBox now automatically generates a **draft invoice** from the finalized costs.

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
- **Parts** — Each part used, priced at the customer-facing unit price (or cost if no price set)
- **Labor** — Hours worked at the tracked hourly rate
- **Mileage** — Travel charges if mileage was logged on the job
- **Other Charges** — Any additional fees recorded in the job cost tracker

**After Completion**
- The invoice is created as **"Draft"** status — you can review and adjust before sending.
- The job's detail page shows a linked invoice ID for easy navigation.
- Navigate to **Invoices** to review, edit, and send the draft to your customer.

**If no billable items exist** (e.g., a free warranty visit), no invoice is created — the job simply completes.

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

- **Revenue Trend** — Daily revenue from invoices over the selected period with invoice counts per day.
- **Tech Utilization** — Completed jobs, revenue generated, and total hours worked per technician.
- **Job Pipeline** — Breakdown of all jobs by status (pending, scheduled, in progress, completed, cancelled).
- **Jobs by Category** — Distribution of jobs across categories (repair, maintenance, installation, etc.).
- **Jobs by Source** — Where your jobs come from: web portal, phone, SMS, email, or manual entry.
- **Invoice Aging** — Unpaid invoices grouped by age buckets (0-30, 31-60, 61-90, 90+ days) with balance details.
- **Customer Leaderboard** — Top 20 customers ranked by total revenue and invoice count.
- **Quote Conversion** — Approval rate, decline rate, pending count, expired count, and total quote values.
- **Profitability** — Weekly revenue vs. costs with calculated profit and margin percentages.
- **Average Job Metrics** — Average duration and value per job category for completed work.
- **Inventory Alerts** — Materials below their minimum stock threshold, sorted by urgency.

**Delivery Methods**
- **Email** — Report file attached directly to the email via SendGrid.
- **SMS** — Report uploaded to secure storage; a 7-day download link is texted to your phone.

**File Formats**
- **CSV** — Spreadsheet-compatible, opens in Excel or Google Sheets.
- **Excel (.xlsx)** — Native Excel workbook.
- **PDF** — Formatted document for printing or sharing.

**Frequency Options**
- **Daily** — Run once per day at your chosen time(s).
- **Weekly** — Run on selected days of the week.
- **Monthly** — Run on specific days of the month.

**Advanced Settings**
- **Multiple times per day** — Schedule a report to run at 8 AM and 5 PM.
- **Date range** — Reports default to the last 30 days. Set a custom lookback period in report parameters.
- **Pause/Resume** — Toggle reports active or inactive without deleting them.

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
- **First 10 seconds** — Amy says "I'm still here! Take your time."
- **After 20 seconds** — Amy asks "Are you still there?"
- **After 30 seconds** — Amy says it sounds like there may be connection issues and promises to call back in 5 minutes.
- **5-Minute Callback** — Amy automatically calls the customer back, mentions the possible connection issues from the earlier call, and picks up where the conversation left off with all previously collected information intact.

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
- Make sure your organization name is set correctly — Amy uses it in the greeting
- Configure a call forwarding number in Organization Settings if you want callers to be able to reach a human
- The callback feature ensures you never lose a lead, even if the connection drops`,lastUpdated:new Date().toISOString().split("T")[0],keywords:["voice","phone","call","AI","Amy","receptionist","inbound","callback","retry","ticket","speech","greeting","forwarding","voicemail","knowledge","learning","training","FAQ","questions","address","required","fast","response","recap"]},{id:"ai-voice-management",title:"Platform AI Voice Management",category:"addons",content:`Site Administrators can centrally manage AI Voice settings and review call data across all tenants.

**Voice Profiles**
Create and edit global \`ai_voice_profiles\`. Each profile defines:
- **Greeting** — The initial script the AI uses to answer calls.
- **Data Collection** — Required fields to gather (name, address, issue) and retry limits.
- **Confirmation** — The final script used before ending the call.
- **Behavior** — AI tone and call hand-off or transfer conditions.

**Customer Search & Assignment**
Use the **Customer Search** tab to locate an organization and assign them a specific AI Voice Profile. This allows you to deploy custom profiles for different industries or VIP clients.

**Call History Audit & Actions**
The **Call History** tab provides real-time access to all \`voice_sessions\` across the platform. You can search by phone number or Organization ID to review full call transcripts, AI summaries, and call statuses for troubleshooting.
- **Expand Details** — Click on any session to see the full transcript, AI summary, and collected data fields.
- **Direct Conversion** — If a call didn't automatically convert to a job or quote, you can manually trigger "Create Job" or "Create Quote" directly from the expanded session view to ensure no leads are lost.

**System Configuration**
The **System Config** tab controls global timeouts and defaults, such as the 15-second Twilio Gather timeout that prevents premature "no-speech" errors.

**Access**
Navigate to **Platform > AI Voice** from the sidebar (restricted to Site Admins).`,lastUpdated:"2026-04-30",keywords:["voice","admin","management","platform","profiles","history","transcripts","system config","tenant","convert","job","quote"]},{id:"inv-pdf-email",title:"Invoice PDF Download & Email Delivery",category:"invoicing",content:`DispatchBox supports full invoice delivery — download as PDF or send directly to your customer's email.

**Download PDF**
On any invoice detail page, click **"Download PDF"** to generate a professional PDF document. The PDF includes:
- Your invoice number and status badge
- Bill-to customer details
- Line items with quantities, unit prices, and totals
- Subtotal, tax, payments applied, and balance due
- Footer with generation date

The PDF downloads instantly to your device — no cloud processing needed.

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
- *"Cannot send: customer has no email"* — Add an email to the customer record first
- *Invoice already locked?* — Use "Unlock to Edit" to make changes, then resend`,lastUpdated:"2026-04-29",keywords:["invoice","PDF","download","email","send","lock","delivery","sendgrid","branded","template"]},{id:"inv-overdue",title:"Overdue Invoice Detection",category:"invoicing",content:`DispatchBox automatically flags invoices as **overdue** when they pass their due date.

**How It Works**
Any invoice with a status of "Sent" or "Partial" that has a due date in the past is automatically displayed as **OVERDUE** with a red pulsing badge — no manual action required.

**Where You'll See It**
- **Invoices List** — The status column shows a pulsing red "overdue" badge
- **Invoice Detail** — The status badge in the header changes to red with "OVERDUE"

**Important Notes**
- The overdue status is computed in real-time from the due date — it's not stored in the database
- Paid and voided invoices are never flagged as overdue
- Setting a due date on your invoices enables this automatic detection

**Tips:**
- Set due dates when creating invoices (e.g., Net 30, Net 60) to activate overdue tracking
- Use the Invoices list to quickly spot overdue items and follow up
- Consider sending a reminder email to customers with overdue balances`,lastUpdated:"2026-04-29",keywords:["overdue","past due","late","payment","due date","delinquent","aging","unpaid","outstanding"]},{id:"inv-lifecycle",title:"Invoice Lifecycle & Statuses",category:"invoicing",content:`Each invoice progresses through a defined lifecycle:

**Status Flow:**
- **Draft** (yellow) — Created but not yet sent. Fully editable. Generated automatically from job completion or created manually.
- **Sent** (blue) — Delivered to the customer via email. Locked from editing.
- **Partial** (orange) — Some payments received but balance remains.
- **Paid** (green) — Fully paid. Balance is zero.
- **Overdue** (red, pulsing) — Sent or Partial invoice past its due date.
- **Void** (red, strikethrough) — Cancelled. Shown with reduced opacity.

**Key Actions:**
- **Send & Lock** — Emails the invoice and locks it
- **Download PDF** — Generates a downloadable PDF
- **Record Payment** — Log a check, cash, or card payment against the invoice
- **Unlock to Edit** — Re-opens a locked invoice for corrections
- **Mark as Paid** — Quick action from the invoice list
- **Void Invoice** — Cancels the invoice permanently

**Auto-Generated Invoices**
When a job is completed via the Job Completion Wizard, a draft invoice is automatically created with all parts, labor, mileage, and other charges. Navigate to the invoice from the job detail page's linked invoice ID.`,lastUpdated:"2026-04-29",keywords:["invoice","lifecycle","status","draft","sent","paid","void","partial","overdue","workflow","lock","unlock"]}],$=[{id:"vid-getting-started",title:"Getting Started with DispatchBox",description:"A quick tour of the dashboard, sidebar navigation, and key business metrics at a glance.",category:"getting-started",duration:"0:45",videoUrl:"/videos/tutorial-dashboard.webp",lastUpdated:"2026-04-08"},{id:"vid-create-job",title:"Creating & Managing Jobs",description:"How to create new service jobs using the sidebar, fill in details, and assign technicians.",category:"jobs",duration:"0:40",videoUrl:"/videos/tutorial-creating-jobs.webp",lastUpdated:"2026-04-08"},{id:"vid-calendar",title:"Calendar & Scheduling",description:"Master the calendar view with day, week, and month modes for scheduling your team.",category:"jobs",duration:"0:35",videoUrl:"/videos/tutorial-calendar.webp",lastUpdated:"2026-04-08"},{id:"vid-invoicing",title:"Invoicing & Getting Paid",description:"Create invoices, filter by status, view details, and send to customers for payment.",category:"invoicing",duration:"0:50",videoUrl:"/videos/tutorial-invoicing.webp",lastUpdated:"2026-04-08"},{id:"vid-materials",title:"Materials Inventory",description:"Track materials and parts across locations — filter by truck, warehouse, and manage stock levels.",category:"inventory",duration:"0:40",videoUrl:"/videos/tutorial-materials.webp",lastUpdated:"2026-04-08"},{id:"vid-tools",title:"Tool Tracking",description:"Keep track of company tools and equipment — assignments, conditions, and check-in/check-out.",category:"inventory",duration:"0:45",videoUrl:"/videos/tutorial-tools.webp",lastUpdated:"2026-04-08"},{id:"vid-customers",title:"Customer Management",description:"Manage your customer database — search contacts, view profiles, job history, and rate cards.",category:"customers",duration:"0:45",videoUrl:"/videos/tutorial-customers.webp",lastUpdated:"2026-04-08"}],S={Rocket:F,Calendar:E,FileText:U,Package:M,Users:N,BarChart2:D,CreditCard:P,Puzzle:q},te=()=>{const{user:c}=G(),[n,v]=s.useState(""),[r,w]=s.useState(null),[m,T]=s.useState(null),[p,k]=s.useState("docs"),[x,I]=s.useState($),[d,u]=s.useState(null);s.useEffect(()=>{(async()=>{try{if(!(c==null?void 0:c.organizationId))return;const o=await L(z(Q(V,"help_videos"),J("title")));if(!o.empty){const l=o.docs.map(i=>({id:i.id,...i.data()}));I(l)}}catch{}})()},[c]),s.useEffect(()=>{const t=a=>{a.key==="Escape"&&u(null)};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[]);const h=s.useMemo(()=>{let t=Y;if(r&&(t=t.filter(a=>a.category===r)),n.trim()){const a=n.toLowerCase();t=t.filter(o=>o.title.toLowerCase().includes(a)||o.content.toLowerCase().includes(a)||o.keywords.some(l=>l.toLowerCase().includes(a)))}return t},[n,r]),g=s.useMemo(()=>{let t=x;if(r&&(t=t.filter(a=>a.category===r)),n.trim()){const a=n.toLowerCase();t=t.filter(o=>o.title.toLowerCase().includes(a)||o.description.toLowerCase().includes(a))}return t},[n,r,x]),j=s.useMemo(()=>{const t={};return h.forEach(a=>{t[a.category]||(t[a.category]=[]),t[a.category].push(a)}),t},[h]);return e.jsxs("div",{className:"min-h-screen bg-gray-50",children:[d&&e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm",onClick:()=>u(null),children:e.jsxs("div",{className:"relative w-full max-w-5xl mx-4",onClick:t=>t.stopPropagation(),children:[e.jsxs("button",{onClick:()=>u(null),className:"absolute -top-12 right-0 text-white/80 hover:text-white transition flex items-center gap-2 text-sm",children:[e.jsx("span",{children:"Close"}),e.jsx(C,{className:"w-5 h-5"})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("h3",{className:"text-white text-xl font-bold",children:d.title}),e.jsx("p",{className:"text-white/60 text-sm mt-1",children:d.description})]}),e.jsx("div",{className:"bg-black rounded-xl overflow-hidden shadow-2xl",children:e.jsx("img",{src:d.videoUrl,alt:d.title,className:"w-full h-auto",style:{imageRendering:"auto"}})}),e.jsxs("div",{className:"mt-4 bg-white/10 backdrop-blur rounded-xl p-4 max-h-48 overflow-y-auto",children:[e.jsx("p",{className:"text-white/50 text-xs uppercase tracking-wide font-semibold mb-2",children:"📝 Narration Script — Use with ElevenLabs or Google Vids"}),e.jsx("p",{className:"text-white/80 text-sm leading-relaxed",children:K(d.id)})]})]})}),e.jsx("div",{className:"bg-gradient-to-br from-blue-700 via-amber-700 to-blue-800 text-white",children:e.jsxs("div",{className:"max-w-5xl mx-auto px-4 py-12",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center",children:e.jsx(y,{className:"w-7 h-7"})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold",children:"Help Center"}),e.jsx("p",{className:"text-blue-200 text-sm",children:"Find answers, watch tutorials, get the most out of DispatchBox"})]})]}),e.jsxs("div",{className:"relative mt-6 max-w-2xl",children:[e.jsx(A,{className:"absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300"}),e.jsx("input",{type:"text",value:n,onChange:t=>v(t.target.value),placeholder:"Search help articles and videos...",className:"w-full pl-12 pr-10 py-3.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/20 transition text-lg"}),n&&e.jsx("button",{onClick:()=>v(""),className:"absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white",children:e.jsx(C,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"flex flex-wrap gap-2 mt-6",children:[e.jsx("button",{onClick:()=>w(null),className:`px-4 py-1.5 rounded-full text-sm font-medium transition ${r?"bg-white/15 text-white hover:bg-white/25":"bg-white text-blue-700"}`,children:"All Topics"}),f.map(t=>{const a=S[t.icon]||y;return e.jsxs("button",{onClick:()=>w(r===t.id?null:t.id),className:`px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${r===t.id?"bg-white text-blue-700":"bg-white/15 text-white hover:bg-white/25"}`,children:[e.jsx(a,{className:"w-3.5 h-3.5"}),t.name]},t.id)})]})]})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 -mt-4",children:e.jsx("div",{className:"bg-white rounded-t-xl shadow-lg border border-gray-200",children:e.jsxs("div",{className:"flex border-b border-gray-200",children:[e.jsxs("button",{onClick:()=>k("docs"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${p==="docs"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(R,{className:"w-4 h-4"}),"Documentation",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:h.length})]}),e.jsxs("button",{onClick:()=>k("videos"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${p==="videos"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(b,{className:"w-4 h-4"}),"Video Tutorials",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:g.length})]})]})})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 pb-12",children:e.jsx("div",{className:"bg-white rounded-b-xl shadow-lg border border-t-0 border-gray-200 min-h-[400px]",children:p==="docs"?e.jsx("div",{className:"p-6",children:h.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(A,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No articles found"}),e.jsx("p",{className:"text-sm mt-1",children:"Try a different search term or category"})]}):Object.entries(j).map(([t,a])=>{const o=f.find(i=>i.id===t),l=S[(o==null?void 0:o.icon)||""]||y;return e.jsxs("div",{className:"mb-6 last:mb-0",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(l,{className:"w-5 h-5 text-blue-600"}),e.jsx("h2",{className:"text-lg font-bold text-gray-900",children:(o==null?void 0:o.name)||t}),e.jsxs("span",{className:"text-xs text-gray-400 ml-1",children:["— ",o==null?void 0:o.description]})]}),e.jsx("div",{className:"space-y-1",children:a.map(i=>e.jsxs("div",{className:"border border-gray-100 rounded-lg overflow-hidden hover:border-blue-200 transition",children:[e.jsxs("button",{onClick:()=>T(m===i.id?null:i.id),className:"w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition",children:[e.jsx("span",{className:"font-medium text-gray-800",children:i.title}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("span",{className:"text-xs text-gray-400 hidden sm:inline",children:[e.jsx(O,{className:"w-3 h-3 inline mr-1"}),i.lastUpdated]}),m===i.id?e.jsx(W,{className:"w-4 h-4 text-gray-400"}):e.jsx(B,{className:"w-4 h-4 text-gray-400"})]})]}),m===i.id&&e.jsx("div",{className:"px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50",children:e.jsx("div",{className:"prose prose-sm max-w-none text-gray-700 whitespace-pre-line",children:i.content})})]},i.id))})]},t)})}):e.jsxs("div",{className:"p-6",children:[g.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(b,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No videos found"}),e.jsx("p",{className:"text-sm mt-1",children:"Videos are being produced — check back soon!"})]}):e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:g.map(t=>{const a=f.find(l=>l.id===t.category),o=!!t.videoUrl;return e.jsxs("div",{className:`group border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200 ${o?"cursor-pointer":""}`,onClick:()=>o&&u(t),children:[e.jsxs("div",{className:"relative bg-gradient-to-br from-slate-800 to-slate-900 h-40 flex items-center justify-center overflow-hidden",children:[o?e.jsx("img",{src:t.videoUrl,alt:t.title,className:"w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"}):null,e.jsx("div",{className:"absolute inset-0 flex items-center justify-center",children:e.jsx("div",{className:"w-14 h-14 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform",children:e.jsx(H,{className:"w-6 h-6 text-blue-600 ml-0.5"})})}),e.jsx("span",{className:"absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono",children:t.duration}),o&&e.jsx("span",{className:"absolute top-2 left-2 bg-green-500/90 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider",children:"Walkthrough"})]}),e.jsxs("div",{className:"p-4",children:[e.jsx("h3",{className:"font-semibold text-gray-900 mb-1 line-clamp-2",children:t.title}),e.jsx("p",{className:"text-sm text-gray-500 line-clamp-2 mb-3",children:t.description}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-400",children:[e.jsx("span",{className:"bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium",children:(a==null?void 0:a.name)||t.category}),e.jsxs("span",{children:["Updated ",t.lastUpdated]})]})]})]},t.id)})}),e.jsx("div",{className:"mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(b,{className:"w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0"}),e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-blue-900",children:"Narrated versions coming soon!"}),e.jsx("p",{className:"text-sm text-blue-700 mt-1",children:"These walkthroughs currently show silent screen recordings. Professional voiceover narration is being added — check back soon for the full tutorial experience."})]})]})})]})})})]})};function K(c){return{"vid-getting-started":"Welcome to DispatchBox! This is your main dashboard — the command center for your business. At the top, you'll see your key metrics: total revenue, open tickets, and active technicians. Below that, the Revenue Trend chart shows your monthly performance, while the Job Status Distribution gives you a real-time breakdown of where all your work orders stand. On the left is your sidebar — your main navigation. It's organized into logical groups: Work, Financial, Inventory, and People. You can collapse it anytime to get more screen space, or expand it to see the full labels. Let's explore each section.","vid-create-job":"Creating a new job is easy. Click the blue 'New Job' button at the top of the sidebar — it's always visible no matter where you are in the app. This opens the job creation form. Start by entering a title — something descriptive like 'Water Heater Replacement.' Add details in the description field so your technician knows what to expect on site. You can assign a customer from your contacts, set the priority level, and schedule the job. When you're ready, hit save and the job will appear on your dashboard and calendar.","vid-calendar":"The Calendar gives you a visual overview of all your scheduled jobs. Use the view toggles at the top to switch between Day, Week, and Month views. Navigate forward and back using the arrow buttons. Jobs show up as colored blocks — you can see the customer name, job title, and assigned technician at a glance. This is your go-to view for managing your team's daily workload and spotting scheduling conflicts.","vid-invoicing":"The Invoicing section is where you manage your billing. You'll see a list of all invoices with their status — Draft, Sent, Paid, or Overdue. Use the tabs at the top to filter by status. Click on any invoice to see the full details including line items, totals, and payment history. You can create invoices directly from completed jobs, add custom line items, and send them to your customers via email. The search bar at the top helps you quickly find any invoice.","vid-materials":"Materials Inventory helps you track all your parts and supplies. At the top, you'll see three key metrics: Total Items in stock, items running Low on Stock, and your total Inventory Value. Use the location tabs — All Locations, Truck, Warehouse, At Supplier — to filter by where your materials are stored. The search bar lets you find specific items quickly. Each material shows its category, quantity, location, and cost. You can adjust quantities with the plus and minus buttons right from the list.","vid-tools":"The Tools section lets you manage all your company equipment. Each tool shows its name, category, current assignment, and condition status. You can track which technician has which tool, when it was last serviced, and whether it needs maintenance. Click the edit button on any tool to update its details. This keeps your expensive equipment accounted for and helps prevent losses.","vid-customers":"Customer Management is where you keep all your client information organized. Search for any customer by name, email, or phone. Click on a customer to see their full profile — including contact details, service address, job history, and billing information. You can see all past and current jobs for each customer, making it easy to provide personalized service with full context of your relationship."}[c]||"Narration script coming soon for this tutorial."}export{te as HelpCenter};
