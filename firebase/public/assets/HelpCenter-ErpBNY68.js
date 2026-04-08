import{j as e,C as p,r as f,X as S,bY as A,o as U,f as T,g as P,P as I,F as D,h as E,bZ as M,b_ as q,b$ as h,k as z,a as B,z as R,a9 as F}from"./ui-Dg3MqJsZ.js";import{r as n}from"./vendor-Ydy0Tvz0.js";import{h as L,z as O,j as V,B as G}from"./firebase-DNG26eMS.js";import{u as $,d as J}from"./index-Qb3uiCIA.js";const b=[{id:"getting-started",name:"Getting Started",icon:"Rocket",description:"First steps with DispatchBox"},{id:"jobs",name:"Jobs & Scheduling",icon:"Calendar",description:"Creating and managing service jobs"},{id:"invoicing",name:"Invoicing & Quotes",icon:"FileText",description:"Billing your customers"},{id:"inventory",name:"Inventory",icon:"Package",description:"Materials and tools tracking"},{id:"customers",name:"Customers & Portal",icon:"Users",description:"Customer management and self-service portal"},{id:"addons",name:"Add-on Services",icon:"Puzzle",description:"Domain, Email, SMS, and AI Phone"},{id:"reports",name:"Reports & Analytics",icon:"BarChart2",description:"Business insights and data"},{id:"account",name:"Account & Billing",icon:"CreditCard",description:"Your plan, profile, and billing"}],Y=[{id:"gs-first-login",title:"Your First Login",category:"getting-started",content:`After signing up, you'll land on your dashboard. Here's what to do first:

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

Customers automatically get access to the Customer Portal where they can view their jobs, invoices, and communicate with you.`,lastUpdated:"2026-03-11",keywords:["customer","client","add","contact","new"]},{id:"gs-navigation",title:"Navigating the App",category:"getting-started",content:`**Top Navigation Bar** — Your main navigation with links to Dashboard, Calendar, Jobs, Invoices, and more.

**Profile Menu** — Click your avatar in the top-right for:
- Your Profile settings
- Organization Settings
- Add-ons & Services management
- Help Center (you're here!)
- Sign Out

**Mobile** — On smaller screens, tap the hamburger menu (☰) to access all navigation items.`,lastUpdated:"2026-03-11",keywords:["navigate","menu","sidebar","find","where"]},{id:"jobs-calendar",title:"Using the Calendar",category:"jobs",content:`The Calendar view shows all scheduled jobs in a visual timeline.

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

Technicians can update status from their mobile dashboard. Admins can change any job's status from the job detail page.`,lastUpdated:"2026-03-11",keywords:["status","pending","scheduled","progress","completed","cancelled"]},{id:"jobs-dispatch",title:"Dispatcher Console",category:"jobs",content:`The Dispatcher Console (available on Small Business and Enterprise plans) provides:

- **Live Map** — See all technicians' real-time locations.
- **Unassigned Jobs** — Drag unassigned jobs onto technicians.
- **Route Optimization** — View driving distances and estimated arrival times.
- **Quick Communication** — Send messages to technicians directly.

Access it from the main navigation under **Calendar** or **Dispatcher**.`,lastUpdated:"2026-03-11",keywords:["dispatch","map","assign","route","location","GPS"]},{id:"inv-create",title:"Creating Invoices",category:"invoicing",content:`Invoices can be created in several ways:

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

Customers can view and accept quotes through their unique quote link. Accepted quotes can be converted to invoices with one click.`,lastUpdated:"2026-03-11",keywords:["quote","estimate","proposal","pricing"]},{id:"inv-materials",title:"Managing Materials",category:"inventory",content:`Track materials and parts used on jobs:

1. Go to **Materials** in the navigation.
2. Add items with name, SKU, unit cost, and current quantity.
3. Set **reorder points** to get alerts when stock is low.

**On jobs:** When closing out a job, technicians can log materials used. This automatically decrements your inventory and adds costs to the job.`,lastUpdated:"2026-03-11",keywords:["materials","parts","inventory","stock","reorder"]},{id:"inv-tools",title:"Tool Tracking",category:"inventory",content:`Keep track of your company's tools and equipment:

1. Go to **Tools** in the navigation.
2. Add tools with name, serial number, condition, and assigned technician.
3. Track tool check-out and check-in history.

Tools can be assigned to technicians and tracked across jobs for accountability.`,lastUpdated:"2026-03-11",keywords:["tools","equipment","track","assign"]},{id:"cust-portal",title:"Customer Portal",category:"customers",content:`Each organization gets a customer-facing portal where your customers can:

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

Set up from **Add-ons & Services**, then manage conversations in the **Communications** portal.`,lastUpdated:"2026-03-11",keywords:["SMS","text","message","phone","communication"]},{id:"addon-ai-phone",title:"AI Phone Agent",category:"addons",content:`Let AI handle your phone calls 24/7:

- **Starter** ($49.99/mo) — AI answers calls, takes messages, books appointments.
- **Professional** ($99.99/mo) — Custom voice, call routing, integrates with your calendar.
- **Enterprise** ($199.99/mo) — Multi-line support, advanced routing, analytics dashboard.

The AI agent can:
• Answer common questions about your services
• Schedule and reschedule appointments
• Take detailed messages and create job requests
• Provide estimates based on your service catalog

Set up from **Add-ons & Services** → **AI Phone Agent**.`,lastUpdated:"2026-03-11",keywords:["AI","phone","agent","call","voice","automated","answering"]},{id:"reports-overview",title:"Reports Dashboard",category:"reports",content:`The Reports page provides business insights:

- **Revenue Summary** — Track income by day, week, or month with trend charts.
- **Technician Utilization** — See how busy your team is and identify capacity.
- **Job Completion Rates** — Track on-time completion and customer satisfaction.

Use the date range picker to view any time period. Export data as CSV for your accountant.`,lastUpdated:"2026-03-11",keywords:["report","analytics","revenue","chart","data","export"]},{id:"acct-plans",title:"Plans & Pricing",category:"account",content:`DispatchBox offers three plans:

- **Individual** — For solo technicians. Basic scheduling, invoicing, and customer management.
- **Small Business** — For growing teams. Adds dispatcher console, team management, calendar views, and more.
- **Enterprise** — For larger organizations. Unlimited technicians, custom integrations, dedicated support.

Upgrade anytime from **Organization Settings**. Changes take effect immediately.`,lastUpdated:"2026-03-11",keywords:["plan","pricing","upgrade","subscription","tier"]},{id:"acct-org-settings",title:"Organization Settings",category:"account",content:`Configure your organization from the profile menu → **Organization Settings**:

- **Company Info** — Name, email prefix, from name.
- **Branding** — Primary color, logo upload.
- **Auto-Reply** — Customize automated email responses.
- **Tax Rate** — Set your default tax rate for invoices.
- **Plan Management** — View current plan and upgrade options.`,lastUpdated:"2026-03-11",keywords:["settings","organization","company","branding","configure"]}],H=[{id:"vid-getting-started",title:"Getting Started with DispatchBox",description:"A quick tour of the dashboard, navigation, and key features.",category:"getting-started",duration:"5:30",lastUpdated:"2026-03-11"},{id:"vid-create-job",title:"Creating & Managing Jobs",description:"How to create jobs, assign technicians, and track progress.",category:"jobs",duration:"4:15",lastUpdated:"2026-03-11"},{id:"vid-invoicing",title:"Invoicing & Getting Paid",description:"Create invoices from jobs, send to customers, and track payments.",category:"invoicing",duration:"3:45",lastUpdated:"2026-03-11"},{id:"vid-calendar",title:"Calendar & Scheduling",description:"Master the calendar view, drag-and-drop scheduling, and dispatch.",category:"jobs",duration:"6:00",lastUpdated:"2026-03-11"},{id:"vid-addons",title:"Setting Up Add-on Services",description:"Enable custom domains, business email, SMS, and AI phone support.",category:"addons",duration:"7:20",lastUpdated:"2026-03-11"},{id:"vid-customer-portal",title:"Customer Portal Tour",description:"What your customers see and how the self-service portal works.",category:"customers",duration:"4:00",lastUpdated:"2026-03-11"}],j={Rocket:M,Calendar:E,FileText:D,Package:I,Users:P,BarChart2:T,CreditCard:U,Puzzle:A},X=()=>{const{user:c}=$(),[r,x]=n.useState(""),[i,y]=n.useState(null),[m,C]=n.useState(null),[u,w]=n.useState("docs"),[v,k]=n.useState(H);n.useEffect(()=>{(async()=>{try{if(!(c==null?void 0:c.organizationId))return;const s=await L(O(V(J,"help_videos"),G("title")));if(!s.empty){const d=s.docs.map(o=>({id:o.id,...o.data()}));k(d)}}catch{}})()},[c]);const l=n.useMemo(()=>{let t=Y;if(i&&(t=t.filter(a=>a.category===i)),r.trim()){const a=r.toLowerCase();t=t.filter(s=>s.title.toLowerCase().includes(a)||s.content.toLowerCase().includes(a)||s.keywords.some(d=>d.toLowerCase().includes(a)))}return t},[r,i]),g=n.useMemo(()=>{let t=v;if(i&&(t=t.filter(a=>a.category===i)),r.trim()){const a=r.toLowerCase();t=t.filter(s=>s.title.toLowerCase().includes(a)||s.description.toLowerCase().includes(a))}return t},[r,i,v]),N=n.useMemo(()=>{const t={};return l.forEach(a=>{t[a.category]||(t[a.category]=[]),t[a.category].push(a)}),t},[l]);return e.jsxs("div",{className:"min-h-screen bg-gray-50",children:[e.jsx("div",{className:"bg-gradient-to-br from-blue-700 via-amber-700 to-blue-800 text-white",children:e.jsxs("div",{className:"max-w-5xl mx-auto px-4 py-12",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center",children:e.jsx(p,{className:"w-7 h-7"})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold",children:"Help Center"}),e.jsx("p",{className:"text-blue-200 text-sm",children:"Find answers, watch tutorials, get the most out of DispatchBox"})]})]}),e.jsxs("div",{className:"relative mt-6 max-w-2xl",children:[e.jsx(f,{className:"absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300"}),e.jsx("input",{type:"text",value:r,onChange:t=>x(t.target.value),placeholder:"Search help articles and videos...",className:"w-full pl-12 pr-10 py-3.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/20 transition text-lg"}),r&&e.jsx("button",{onClick:()=>x(""),className:"absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white",children:e.jsx(S,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"flex flex-wrap gap-2 mt-6",children:[e.jsx("button",{onClick:()=>y(null),className:`px-4 py-1.5 rounded-full text-sm font-medium transition ${i?"bg-white/15 text-white hover:bg-white/25":"bg-white text-blue-700"}`,children:"All Topics"}),b.map(t=>{const a=j[t.icon]||p;return e.jsxs("button",{onClick:()=>y(i===t.id?null:t.id),className:`px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${i===t.id?"bg-white text-blue-700":"bg-white/15 text-white hover:bg-white/25"}`,children:[e.jsx(a,{className:"w-3.5 h-3.5"}),t.name]},t.id)})]})]})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 -mt-4",children:e.jsx("div",{className:"bg-white rounded-t-xl shadow-lg border border-gray-200",children:e.jsxs("div",{className:"flex border-b border-gray-200",children:[e.jsxs("button",{onClick:()=>w("docs"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${u==="docs"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(q,{className:"w-4 h-4"}),"Documentation",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:l.length})]}),e.jsxs("button",{onClick:()=>w("videos"),className:`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${u==="videos"?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(h,{className:"w-4 h-4"}),"Video Tutorials",e.jsx("span",{className:"ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full",children:g.length})]})]})})}),e.jsx("div",{className:"max-w-5xl mx-auto px-4 pb-12",children:e.jsx("div",{className:"bg-white rounded-b-xl shadow-lg border border-t-0 border-gray-200 min-h-[400px]",children:u==="docs"?e.jsx("div",{className:"p-6",children:l.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(f,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No articles found"}),e.jsx("p",{className:"text-sm mt-1",children:"Try a different search term or category"})]}):Object.entries(N).map(([t,a])=>{const s=b.find(o=>o.id===t),d=j[(s==null?void 0:s.icon)||""]||p;return e.jsxs("div",{className:"mb-6 last:mb-0",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(d,{className:"w-5 h-5 text-blue-600"}),e.jsx("h2",{className:"text-lg font-bold text-gray-900",children:(s==null?void 0:s.name)||t}),e.jsxs("span",{className:"text-xs text-gray-400 ml-1",children:["— ",s==null?void 0:s.description]})]}),e.jsx("div",{className:"space-y-1",children:a.map(o=>e.jsxs("div",{className:"border border-gray-100 rounded-lg overflow-hidden hover:border-blue-200 transition",children:[e.jsxs("button",{onClick:()=>C(m===o.id?null:o.id),className:"w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition",children:[e.jsx("span",{className:"font-medium text-gray-800",children:o.title}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("span",{className:"text-xs text-gray-400 hidden sm:inline",children:[e.jsx(z,{className:"w-3 h-3 inline mr-1"}),o.lastUpdated]}),m===o.id?e.jsx(B,{className:"w-4 h-4 text-gray-400"}):e.jsx(R,{className:"w-4 h-4 text-gray-400"})]})]}),m===o.id&&e.jsx("div",{className:"px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50",children:e.jsx("div",{className:"prose prose-sm max-w-none text-gray-700 whitespace-pre-line",children:o.content})})]},o.id))})]},t)})}):e.jsxs("div",{className:"p-6",children:[g.length===0?e.jsxs("div",{className:"text-center py-16 text-gray-400",children:[e.jsx(h,{className:"w-12 h-12 mx-auto mb-3 opacity-50"}),e.jsx("p",{className:"text-lg font-medium",children:"No videos found"}),e.jsx("p",{className:"text-sm mt-1",children:"Videos are being produced — check back soon!"})]}):e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:g.map(t=>{const a=b.find(s=>s.id===t.category);return e.jsxs("div",{className:"group border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200",children:[e.jsxs("div",{className:"relative bg-gradient-to-br from-blue-100 to-amber-100 h-40 flex items-center justify-center",children:[e.jsx("div",{className:"w-16 h-16 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform",children:e.jsx(F,{className:"w-7 h-7 text-blue-600 ml-1"})}),e.jsx("span",{className:"absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded",children:t.duration})]}),e.jsxs("div",{className:"p-4",children:[e.jsx("h3",{className:"font-semibold text-gray-900 mb-1 line-clamp-2",children:t.title}),e.jsx("p",{className:"text-sm text-gray-500 line-clamp-2 mb-3",children:t.description}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-400",children:[e.jsx("span",{className:"bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium",children:(a==null?void 0:a.name)||t.category}),e.jsxs("span",{children:["Updated ",t.lastUpdated]})]})]})]},t.id)})}),e.jsx("div",{className:"mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(h,{className:"w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0"}),e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-blue-900",children:"More videos coming soon!"}),e.jsx("p",{className:"text-sm text-blue-700 mt-1",children:"We're continuously adding new tutorials as we release features. Video content is updated automatically — check back regularly for the latest guides."})]})]})})]})})})]})};export{X as HelpCenter};
