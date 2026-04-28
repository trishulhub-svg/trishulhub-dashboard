// ============================================================
// TrishulHub Dashboard - Auto-Seed Script
// ============================================================

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function seed() {
  const prisma = new PrismaClient();

  try {
    // Check if already seeded
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('[seed] ✅ Database already has ' + userCount + ' users, skipping seed');
      return true;
    }

    console.log('[seed] 🔧 Seeding database...');

    const hashedPassword = await bcrypt.hash('password123', 12);

    // ━━ Create Users ━━
    const taroon = await prisma.user.create({
      data: { name: 'Taroon', email: 'taroon@trishulhub.in', password: hashedPassword, role: 'SUPER_ADMIN', department: 'MANAGEMENT', isActive: true }
    });
    const pruthvi = await prisma.user.create({
      data: { name: 'Pruthvi', email: 'pruthvi@trishulhub.in', password: hashedPassword, role: 'ADMIN', department: 'SALES', isActive: true }
    });
    const kiran = await prisma.user.create({
      data: { name: 'Kiran', email: 'kiran@trishulhub.in', password: hashedPassword, role: 'DEVELOPER', department: 'DEV', isActive: true }
    });
    const akshat = await prisma.user.create({
      data: { name: 'Akshat', email: 'akshat@trishulhub.in', password: hashedPassword, role: 'DEVELOPER', department: 'DEV', isActive: true }
    });
    const clientUser = await prisma.user.create({
      data: { name: 'Rahul Sharma', email: 'rahul@example.com', password: hashedPassword, role: 'CLIENT', isActive: true }
    });
    console.log('[seed] ✅ 5 users created');

    // ━━ Create AI Agents ━━
    const agents = [
      { name: 'Dev Agent', type: 'DEV', description: 'Writes code, builds features, fixes bugs, reviews code, deploys projects in phases', model: 'glm-4-flash-250414', systemPrompt: 'You are Dev Agent, an expert full-stack developer for TrishulHub. You write production-quality code. Follow phased development: plan → implement → review → deploy. Each phase requires human approval.', status: 'IDLE' },
      { name: 'Client Hunter Agent', type: 'CLIENT_HUNTER', description: 'Finds clients via web search, generates leads, drafts outreach emails, scores prospects', model: 'glm-4-flash-250414', systemPrompt: 'You are Client Hunter Agent, an expert sales agent for TrishulHub. Find businesses needing web services, draft personalized cold emails, score leads, manage outreach campaigns.', status: 'IDLE' },
      { name: 'Finance Agent', type: 'FINANCE', description: 'Estimates project costs, generates invoices & quotations, tracks payments, financial reports', model: 'glm-4-flash-250414', systemPrompt: 'You are Finance Agent, a financial assistant for TrishulHub. Generate invoices, track payments, create financial reports, estimate project costs, prepare quotations.', status: 'IDLE' },
      { name: 'Project Manager Agent', type: 'PROJECT_MANAGER', description: 'Breaks down projects into phases & tasks, assigns work, tracks deadlines, manages approvals', model: 'glm-4-flash-250414', systemPrompt: 'You are Project Manager Agent for TrishulHub. Break down projects into tasks, set deadlines, track progress, assign work to team members and AI agents.', status: 'IDLE' },
      { name: 'HR Agent', type: 'HR', description: 'Manages leave, tracks attendance, monitors workload, suggests best-fit employees for tasks', model: 'glm-4.7-flash', systemPrompt: 'You are HR Agent for TrishulHub. Track attendance, manage leave, monitor workload, find best-fit employees for tasks.', status: 'IDLE' },
      { name: 'Content Agent', type: 'CONTENT', description: 'Writes website copy, social media posts, blog articles, SEO-optimized content', model: 'glm-4-flash-250414', systemPrompt: 'You are Content Agent for TrishulHub. Write professional, engaging, SEO-optimized content for websites, social media, and blogs.', status: 'IDLE' },
      { name: 'Support Agent', type: 'SUPPORT', description: 'Handles client tickets, answers FAQs, provides technical support, escalates issues', model: 'glm-4.7-flash', systemPrompt: 'You are Support Agent for TrishulHub. Help clients with website, hosting, and domain questions. Be patient and thorough.', status: 'IDLE' },
    ];

    const createdAgents = [];
    for (const a of agents) {
      const agent = await prisma.agent.create({ data: a });
      createdAgents.push(agent);
    }
    console.log('[seed] ✅ 7 AI agents created');

    // ━━ Create Agent Role Configs ━━
    const roleConfigs = [
      {
        agentType: 'DEV',
        rolePrompt: 'You are Dev Agent, an expert full-stack developer for TrishulHub. You write production-quality code in HTML, CSS, JavaScript, TypeScript, React, Next.js, PHP, and Python. You follow phased development: plan → implement → review → deploy. Each phase requires human approval before proceeding. You include detailed comments, write tests, and follow best practices.',
        quickActions: JSON.stringify([
          { id: "dev-plan", label: "Plan Project", prompt: "Analyze the requirements and create a detailed development plan with phases, estimated hours, and tech stack recommendations." },
          { id: "dev-implement", label: "Implement Phase", prompt: "Implement the current development phase. Write clean, production-ready code with proper error handling and comments." },
          { id: "dev-review", label: "Code Review", prompt: "Review the code for bugs, security vulnerabilities, performance issues, and code quality." },
          { id: "dev-fix", label: "Fix Bug", prompt: "Analyze the reported bug, identify the root cause, and provide a fix." },
          { id: "dev-deploy", label: "Deploy Steps", prompt: "Create a step-by-step deployment checklist for this project." },
        ]),
        specialCommands: JSON.stringify([
          { id: "dev-phase", label: "Start Phase", prompt: "Begin working on the next development phase: ", icon: "Play" },
          { id: "dev-schedule", label: "Schedule Task", prompt: "Create a scheduled development task for: ", icon: "Calendar" },
          { id: "dev-ask-pm", label: "Ask PM", prompt: "Send a question to the Project Manager about: ", icon: "MessageSquare" },
        ]),
        features: JSON.stringify({ webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, codeReview: true, phasedDevelopment: true }),
        suggestedPrompts: JSON.stringify([
          { id: "dev-sp1", label: "Build a landing page", prompt: "Build a responsive landing page with a hero section, features grid, testimonials, and contact form." },
          { id: "dev-sp2", label: "Fix a React bug", prompt: "I have a React component that's not re-rendering when state changes. Help me debug it." },
          { id: "dev-sp3", label: "Create API endpoint", prompt: "Create a REST API endpoint with input validation, error handling, and proper TypeScript types." },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'CLIENT_HUNTER',
        rolePrompt: 'You are Client Hunter Agent, an expert sales and business development agent for TrishulHub. Find potential clients who need web development, design, or digital services. Search the web for businesses, analyze their online presence, score leads, draft personalized cold emails, and manage outreach campaigns. When you find a promising lead, automatically prepare an outreach email for human approval. Work closely with Finance Agent (quotation) and Project Manager (project planning).',
        quickActions: JSON.stringify([
          { id: "ch-search", label: "Search Clients", prompt: "Search for potential clients in the specified location or industry. Find businesses that lack a professional website." },
          { id: "ch-email", label: "Draft Cold Email", prompt: "Draft a personalized cold email for this potential client. Keep it under 150 words with a clear CTA." },
          { id: "ch-score", label: "Score Lead", prompt: "Analyze this potential client and score them 1-100 based on need, budget potential, urgency, and fit." },
          { id: "ch-followup", label: "Follow-up Email", prompt: "Write a polite follow-up email for a lead who hasn't responded." },
          { id: "ch-analyze", label: "Analyze Website", prompt: "Analyze this business's current website and identify specific problems and recommendations." },
        ]),
        specialCommands: JSON.stringify([
          { id: "ch-find-location", label: "Find by Location", prompt: "Search for clients in this location: ", icon: "MapPin" },
          { id: "ch-find-industry", label: "Find by Industry", prompt: "Search for clients in this industry: ", icon: "Building" },
          { id: "ch-send-finance", label: "Send to Finance", prompt: "Send this lead to the Finance Agent for quotation: ", icon: "DollarSign" },
          { id: "ch-schedule", label: "Schedule Outreach", prompt: "Schedule a 7-day outreach plan for: ", icon: "Calendar" },
        ]),
        features: JSON.stringify({ webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, leadScoring: true, emailDrafting: true }),
        suggestedPrompts: JSON.stringify([
          { id: "ch-sp1", label: "Find clients in Harrow", prompt: "Find potential clients in Harrow, London who need web development services." },
          { id: "ch-sp2", label: "Find restaurants", prompt: "Search for restaurants in our area that don't have a professional website." },
          { id: "ch-sp3", label: "Score this lead", prompt: "Analyze and score this potential client." },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'FINANCE',
        rolePrompt: 'You are Finance Agent, an expert financial assistant for TrishulHub. Estimate project costs, generate professional invoices and quotations, track payments, send payment reminders, and create financial reports. When Client Hunter finds a lead, automatically research and prepare cost estimation. Work with Project Manager to track budgets. All financial outputs require human approval.',
        quickActions: JSON.stringify([
          { id: "fin-estimate", label: "Estimate Cost", prompt: "Estimate the cost for this project. Include breakdown of design, development, testing, deployment, and maintenance." },
          { id: "fin-quotation", label: "Create Quotation", prompt: "Create a professional quotation for this client with project scope, deliverables, timeline, and total cost." },
          { id: "fin-invoice", label: "Generate Invoice", prompt: "Generate a professional invoice with itemized services, subtotal, tax, total, and payment terms." },
          { id: "fin-reminder", label: "Payment Reminder", prompt: "Draft a polite payment reminder for the client with overdue invoice." },
          { id: "fin-report", label: "Financial Report", prompt: "Generate a financial summary report including revenue, outstanding invoices, expenses, and profit margin." },
        ]),
        specialCommands: JSON.stringify([
          { id: "fin-research", label: "Research Pricing", prompt: "Research market pricing for: ", icon: "Search" },
          { id: "fin-notify-pm", label: "Notify PM", prompt: "Notify the Project Manager about budget status for: ", icon: "MessageSquare" },
          { id: "fin-schedule", label: "Schedule Invoice", prompt: "Schedule an invoice for: ", icon: "Calendar" },
        ]),
        features: JSON.stringify({ webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true }),
        suggestedPrompts: JSON.stringify([
          { id: "fin-sp1", label: "Estimate 5-page website", prompt: "Estimate the cost for a 5-page responsive business website." },
          { id: "fin-sp2", label: "Create monthly invoice", prompt: "Create an invoice for monthly website maintenance." },
          { id: "fin-sp3", label: "Payment report", prompt: "Give me a report on all outstanding payments." },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'PROJECT_MANAGER',
        rolePrompt: 'You are Project Manager Agent, an expert project manager for TrishulHub. Deeply analyze project requirements, break them into phases and tasks, assign work to team members or AI agents, track deadlines, manage dependencies, and ensure on-time delivery. Each project phase requires human approval. Work closely with Finance Agent on budgets and Dev Agent on implementation.',
        quickActions: JSON.stringify([
          { id: "pm-plan", label: "Plan Project", prompt: "Analyze the requirements and create a detailed project plan with phases, tasks, dependencies, and deadlines." },
          { id: "pm-breakdown", label: "Break into Tasks", prompt: "Break this project into specific, actionable tasks with priority, hours, and assignee suggestions." },
          { id: "pm-assign", label: "Assign Tasks", prompt: "Assign tasks to the best-suited team members or AI agents based on skills and availability." },
          { id: "pm-status", label: "Status Report", prompt: "Generate a project status report with completed tasks, blockers, risks, and projected completion." },
          { id: "pm-deadline", label: "Check Deadlines", prompt: "Review all active projects and flag any at risk of missing their deadline." },
        ]),
        specialCommands: JSON.stringify([
          { id: "pm-approve-phase", label: "Approve Phase", prompt: "Review and approve the current project phase for: ", icon: "CheckCircle" },
          { id: "pm-assign-dev", label: "Assign to Dev", prompt: "Assign this task to the Dev Agent: ", icon: "Code2" },
          { id: "pm-alert", label: "Send Alert", prompt: "Send a deadline alert about: ", icon: "AlertTriangle" },
        ]),
        features: JSON.stringify({ webSearch: false, autoTask: true, crossAgent: true, approvalRequired: true, riskAlerts: true }),
        suggestedPrompts: JSON.stringify([
          { id: "pm-sp1", label: "Plan e-commerce project", prompt: "Plan an e-commerce website with product catalog, cart, checkout, and admin panel." },
          { id: "pm-sp2", label: "Check deadlines", prompt: "Review all active projects and their deadlines. Flag any risks." },
          { id: "pm-sp3", label: "Sprint plan", prompt: "Create a 2-week sprint plan with prioritized tasks." },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'HR',
        rolePrompt: 'You are HR Agent, an expert HR coordinator for TrishulHub. Manage leave requests, track attendance, monitor workload, and suggest best-fit employees for tasks. Analyze team capacity, flag overwork or underutilization, and ensure fair workload distribution.',
        quickActions: JSON.stringify([
          { id: "hr-workload", label: "Check Workload", prompt: "Analyze the current workload of all team members. Who is overworked? Who has capacity?" },
          { id: "hr-best-fit", label: "Find Best Fit", prompt: "Given this task, which team member is the best fit based on skills and availability?" },
          { id: "hr-leave-report", label: "Leave Report", prompt: "Generate a leave report showing pending requests, approved leaves, and conflicts." },
          { id: "hr-attendance", label: "Attendance Summary", prompt: "Generate an attendance summary for this period. Flag any patterns." },
        ]),
        specialCommands: JSON.stringify([
          { id: "hr-approve-leave", label: "Approve Leave", prompt: "Review this leave request: ", icon: "CheckCircle" },
          { id: "hr-flag", label: "Flag Issue", prompt: "Flag this HR issue: ", icon: "AlertTriangle" },
        ]),
        features: JSON.stringify({ webSearch: false, autoTask: false, crossAgent: true, workloadTracking: true, leaveManagement: true }),
        suggestedPrompts: JSON.stringify([
          { id: "hr-sp1", label: "Who's available?", prompt: "Which team members are available this week?" },
          { id: "hr-sp2", label: "Leave conflicts", prompt: "Are there any leave conflicts in the next 2 weeks?" },
          { id: "hr-sp3", label: "Best for task", prompt: "Who is the best developer to assign a React.js task to?" },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'CONTENT',
        rolePrompt: 'You are Content Agent, an expert content writer and marketing specialist for TrishulHub. Write website copy, social media posts, blog articles, email campaigns, and SEO-optimized content. Adapt tone for different platforms. All content pieces require human approval before publishing.',
        quickActions: JSON.stringify([
          { id: "con-website", label: "Website Copy", prompt: "Write professional website copy for this page with compelling headline and CTA." },
          { id: "con-social", label: "Social Media Post", prompt: "Create engaging social media posts for Instagram, LinkedIn, and Twitter/X." },
          { id: "con-blog", label: "Blog Article", prompt: "Write an SEO-optimized blog article on this topic." },
          { id: "con-email", label: "Email Campaign", prompt: "Create an email marketing campaign with subject line, preview text, and CTA." },
        ]),
        specialCommands: JSON.stringify([
          { id: "con-review", label: "Review Content", prompt: "Review this content for: grammar, tone, SEO, readability: ", icon: "Eye" },
          { id: "con-approve", label: "Submit for Approval", prompt: "Submit this content for approval: ", icon: "CheckCircle" },
        ]),
        features: JSON.stringify({ webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, seoOptimization: true }),
        suggestedPrompts: JSON.stringify([
          { id: "con-sp1", label: "Write homepage", prompt: "Write compelling homepage copy for a restaurant website." },
          { id: "con-sp2", label: "Social campaign", prompt: "Create a week-long social media campaign for a website launch." },
          { id: "con-sp3", label: "Blog on trends", prompt: "Write an SEO blog about web design trends for small businesses." },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
      {
        agentType: 'SUPPORT',
        rolePrompt: 'You are Support Agent, an expert customer support specialist for TrishulHub. Handle client tickets, answer FAQs about websites, hosting, domains, and email. Provide technical troubleshooting and escalate complex issues. Be patient, thorough, and friendly.',
        quickActions: JSON.stringify([
          { id: "sup-faq", label: "Answer FAQ", prompt: "Provide a detailed answer to this frequently asked question." },
          { id: "sup-troubleshoot", label: "Troubleshoot", prompt: "Help troubleshoot this technical issue step by step." },
          { id: "sup-escalate", label: "Escalate Issue", prompt: "Analyze this problem and recommend the appropriate team to handle it." },
          { id: "sup-followup", label: "Follow Up", prompt: "Draft a follow-up message to a client whose ticket was recently resolved." },
        ]),
        specialCommands: JSON.stringify([
          { id: "sup-assign-dev", label: "Send to Dev", prompt: "Escalate this issue to Dev Agent: ", icon: "Code2" },
          { id: "sup-close", label: "Close Ticket", prompt: "Close this ticket with resolution: ", icon: "CheckCircle" },
        ]),
        features: JSON.stringify({ webSearch: false, autoTask: true, crossAgent: true, autoEscalation: true, knowledgeBase: true }),
        suggestedPrompts: JSON.stringify([
          { id: "sup-sp1", label: "Email not working", prompt: "My business email is not sending or receiving messages." },
          { id: "sup-sp2", label: "Website down", prompt: "My website is showing a 500 error." },
          { id: "sup-sp3", label: "DNS setup", prompt: "How do I configure DNS records for my domain?" },
        ]),
        autoWorkflows: JSON.stringify([]),
      },
    ];

    for (const config of roleConfigs) {
      const agent = createdAgents.find(a => a.type === config.agentType);
      if (agent) {
        const { agentType, ...data } = config;
        await prisma.agentRoleConfig.create({
          data: { agentId: agent.id, ...data }
        });
      }
    }
    console.log('[seed] ✅ 7 agent role configs created');

    // ━━ Create User-Agent Access ━━
    // Taroon (SUPER_ADMIN) sees all - no need for access records
    // Pruthvi (ADMIN, SALES) - Client Hunter, Finance, Content
    // Kiran (DEVELOPER, DEV) - Dev Agent, Project Manager
    // Akshat (DEVELOPER, DEV) - Dev Agent, Project Manager, Support

    const accessMappings = [
      // Pruthvi - Sales focus
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === 'CLIENT_HUNTER')?.id, canChat: true, canView: true, canApprove: true },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === 'FINANCE')?.id, canChat: true, canView: true, canApprove: true },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === 'CONTENT')?.id, canChat: true, canView: true, canApprove: false },
      { userId: pruthvi.id, agentId: createdAgents.find(a => a.type === 'PROJECT_MANAGER')?.id, canChat: true, canView: true, canApprove: false },
      // Kiran - Dev focus
      { userId: kiran.id, agentId: createdAgents.find(a => a.type === 'DEV')?.id, canChat: true, canView: true, canApprove: false },
      { userId: kiran.id, agentId: createdAgents.find(a => a.type === 'PROJECT_MANAGER')?.id, canChat: true, canView: true, canApprove: false },
      // Akshat - Dev + Support focus
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === 'DEV')?.id, canChat: true, canView: true, canApprove: false },
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === 'PROJECT_MANAGER')?.id, canChat: true, canView: true, canApprove: false },
      { userId: akshat.id, agentId: createdAgents.find(a => a.type === 'SUPPORT')?.id, canChat: true, canView: true, canApprove: false },
    ].filter(m => m.agentId); // Filter out any undefined agentIds

    for (const mapping of accessMappings) {
      await prisma.userAgentAccess.create({ data: mapping });
    }
    console.log('[seed] ✅ User-agent access mappings created');

    // ━━ Create Sample Clients ━━
    const clients = await Promise.all([
      prisma.client.create({ data: { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+91-9876543210', company: 'Sharma Electronics', website: 'sharmaelectronics.in', status: 'ACTIVE', userId: clientUser.id } }),
      prisma.client.create({ data: { name: 'Priya Patel', email: 'priya@beautylounge.com', phone: '+91-9876543211', company: 'Priya Beauty Lounge', website: 'priyabeautylounge.com', status: 'ACTIVE' } }),
      prisma.client.create({ data: { name: 'Amit Verma', email: 'amit@vermarestaurant.com', phone: '+91-9876543212', company: 'Verma Restaurant', status: 'ACTIVE' } }),
    ]);
    console.log('[seed] ✅ 3 clients created');

    // ━━ Create Sample Projects ━━
    await Promise.all([
      prisma.project.create({ data: { name: 'Sharma Electronics Website', clientId: clients[0].id, status: 'IN_PROGRESS', progress: 65, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), budget: 15000 } }),
      prisma.project.create({ data: { name: 'Priya Beauty Lounge Website', clientId: clients[1].id, status: 'REVIEW', progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
      prisma.project.create({ data: { name: 'Verma Restaurant Website', clientId: clients[2].id, status: 'PLANNING', progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
    ]);
    console.log('[seed] ✅ 3 projects created');

    // ━━ Create Sample Leads ━━
    await Promise.all([
      prisma.lead.create({ data: { name: 'Vikram Singh', email: 'vikram@fitnessgym.com', company: 'Fitness Gym', website: 'fitnessgym.in', source: 'AI_FOUND', score: 78, status: 'CONTACTED' } }),
      prisma.lead.create({ data: { name: 'Neha Gupta', email: 'neha@fashionboutique.com', company: 'Fashion Boutique', source: 'MANUAL', score: 65, status: 'INTERESTED' } }),
      prisma.lead.create({ data: { name: 'Rajesh Kumar', email: 'rajesh@autodealer.com', company: 'Kumar Auto Dealer', website: 'kumarauto.in', source: 'AI_FOUND', score: 82, status: 'NEW' } }),
    ]);
    console.log('[seed] ✅ 3 leads created');

    // ━━ Create Sample Expenses ━━
    await Promise.all([
      prisma.expense.create({ data: { category: 'HOSTING', description: 'Hostinger Cloud Plan', amount: 7.99, date: new Date() } }),
      prisma.expense.create({ data: { category: 'API_COSTS', description: 'Z.ai API', amount: 5.50, date: new Date() } }),
      prisma.expense.create({ data: { category: 'DOMAINS', description: 'Client domain renewals', amount: 24.00, date: new Date() } }),
    ]);
    console.log('[seed] ✅ 3 expenses created');

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🎉 DATABASE SEEDED SUCCESSFULLY!           ║');
    console.log('║                                              ║');
    console.log('║   Login Credentials:                         ║');
    console.log('║   Email:    taroon@trishulhub.in             ║');
    console.log('║   Password: password123                      ║');
    console.log('║                                              ║');
    console.log('║   ⚠️  Change password after first login!      ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    return true;
  } catch (err) {
    console.error('[seed] ❌ Seeding failed:', err.message);
    console.error(err);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
seed().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
