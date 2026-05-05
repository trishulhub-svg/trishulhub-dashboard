export type UserRole = "SUPER_ADMIN" | "ADMIN" | "DEVELOPER" | "CLIENT";

export type AgentType =
  | "DEV"
  | "CLIENT_HUNTER"
  | "FINANCE"
  | "PROJECT_MANAGER"
  | "HR"
  | "CONTENT"
  | "SUPPORT";

export type AgentStatus = "IDLE" | "RUNNING" | "WAITING_APPROVAL" | "ERROR";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ScheduledTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "CANCELLED";

export type ProjectStatus =
  | "PLANNING"
  | "IN_PROGRESS"
  | "REVIEW"
  | "APPROVAL"
  | "DEPLOYED"
  | "COMPLETED";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "PROPOSAL"
  | "NEGOTIATING"
  | "WON"
  | "LOST";

export type ClientStatus = "ACTIVE" | "INACTIVE";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ApiKeyStatus = "ACTIVE" | "EXHAUSTED" | "ERROR";
export type ApiKeyProvider = "OPENROUTER" | "ZAI" | "GOOGLE_AI" | "NVIDIA" | "OTHER";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT";
export type ApprovalType = "TASK" | "INVOICE" | "EMAIL" | "QUOTATION" | "PROJECT_PLAN" | "CODE_REVIEW" | "LEAD_OUTREACH" | "CONTENT_PIECE" | "CHAT_DELETION";
export type CrossAgentType = "INFO" | "REQUEST" | "RESULT" | "ALERT";

export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "TASK" | "APPROVAL" | "AGENT";

export type ChatStatus = "ACTIVE" | "ARCHIVED";

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

export const AGENT_TYPES: Record<AgentType, { label: string; icon: string; color: string; bgColor: string; description: string }> = {
  DEV: {
    label: "Dev Agent",
    icon: "Code2",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Writes code, builds features, fixes bugs, reviews code, deploys projects in phases",
  },
  CLIENT_HUNTER: {
    label: "Client Hunter",
    icon: "Crosshair",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Finds clients via web search, generates leads, drafts outreach emails, scores prospects",
  },
  FINANCE: {
    label: "Finance Agent",
    icon: "DollarSign",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Estimates project costs, generates invoices & quotations, tracks payments, financial reports",
  },
  PROJECT_MANAGER: {
    label: "Project Manager",
    icon: "ClipboardList",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    description: "Breaks down projects into phases & tasks, assigns work, tracks deadlines, manages approvals",
  },
  HR: {
    label: "HR Agent",
    icon: "Users",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    description: "Manages leave, tracks attendance, monitors workload, suggests best-fit employees for tasks",
  },
  CONTENT: {
    label: "Content Agent",
    icon: "PenTool",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Writes website copy, social media posts, blog articles, SEO-optimized content",
  },
  SUPPORT: {
    label: "Support Agent",
    icon: "HeadphonesIcon",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    description: "Handles client tickets, answers FAQs, provides technical support, escalates issues",
  },
};

export const STATUS_COLORS: Record<AgentStatus, string> = {
  IDLE: "bg-gray-400",
  RUNNING: "bg-green-500",
  WAITING_APPROVAL: "bg-yellow-500",
  ERROR: "bg-red-500",
};

export const LEAD_COLUMNS: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "PROPOSAL",
  "NEGOTIATING",
  "WON",
  "LOST",
];

export const TASK_COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

// ━━ Agent Role Configs (Defaults) ━━
export const DEFAULT_AGENT_ROLE_CONFIGS: Record<AgentType, {
  rolePrompt: string;
  quickActions: { id: string; label: string; prompt: string }[];
  specialCommands: { id: string; label: string; prompt: string; icon: string }[];
  features: Record<string, boolean>;
  suggestedPrompts: { id: string; label: string; prompt: string }[];
}> = {
  DEV: {
    rolePrompt: `You are Dev Agent, an expert full-stack developer for TrishulHub. You write production-quality code in HTML, CSS, JavaScript, TypeScript, React, Next.js, PHP, and Python. You follow phased development: plan → implement → review → deploy. Each phase requires human approval before proceeding. You include detailed comments, write tests, and follow best practices. When reviewing code, you check for bugs, security issues, performance, and maintainability.`,
    quickActions: [
      { id: "dev-plan", label: "Plan Project", prompt: "Analyze the requirements and create a detailed development plan with phases, estimated hours, and tech stack recommendations." },
      { id: "dev-implement", label: "Implement Phase", prompt: "Implement the current development phase. Write clean, production-ready code with proper error handling and comments." },
      { id: "dev-review", label: "Code Review", prompt: "Review the code for bugs, security vulnerabilities, performance issues, and code quality. Provide a detailed review with specific improvements." },
      { id: "dev-fix", label: "Fix Bug", prompt: "Analyze the reported bug, identify the root cause, and provide a fix with an explanation of what was wrong and how it's resolved." },
      { id: "dev-deploy", label: "Deploy Steps", prompt: "Create a step-by-step deployment checklist for this project, including pre-deployment testing, environment setup, and post-deployment verification." },
    ],
    specialCommands: [
      { id: "dev-phase", label: "Start Phase", prompt: "Begin working on the next development phase: ", icon: "Play" },
      { id: "dev-schedule", label: "Schedule Task", prompt: "Create a scheduled development task for: ", icon: "Calendar" },
      { id: "dev-ask-pm", label: "Ask Project Manager", prompt: "Send a question to the Project Manager about: ", icon: "MessageSquare" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, codeReview: true, phasedDevelopment: true },
    suggestedPrompts: [
      { id: "dev-sp1", label: "Build a landing page", prompt: "Build a responsive landing page with a hero section, features grid, testimonials, and contact form." },
      { id: "dev-sp2", label: "Fix a React bug", prompt: "I have a React component that's not re-rendering when state changes. Help me debug it." },
      { id: "dev-sp3", label: "Create API endpoint", prompt: "Create a REST API endpoint with input validation, error handling, and proper TypeScript types." },
    ],
  },
  CLIENT_HUNTER: {
    rolePrompt: `You are Client Hunter Agent, an expert sales and business development agent for TrishulHub. Your job is to find potential clients who need web development, design, or digital services. You search the web for businesses, analyze their online presence, score leads, draft personalized cold emails, and manage outreach campaigns. When you find a promising lead, you automatically prepare an outreach email for human approval. You work closely with the Finance Agent (who prepares quotations) and the Project Manager (who plans the project if the lead converts). Always be professional, specific, and value-focused in your communications.`,
    quickActions: [
      { id: "ch-search", label: "Search Clients", prompt: "Search for potential clients in the specified location or industry. Find businesses that lack a professional website or have an outdated online presence. Provide names, contact info, and a brief analysis of each." },
      { id: "ch-email", label: "Draft Cold Email", prompt: "Draft a personalized cold email for this potential client. Reference their specific business, mention what's missing from their online presence, and explain how TrishulHub can help. Keep it under 150 words with a clear CTA." },
      { id: "ch-score", label: "Score Lead", prompt: "Analyze this potential client and score them 1-100 based on: likelihood of needing web services, budget potential, urgency, and fit with TrishulHub's offerings. Explain the score." },
      { id: "ch-followup", label: "Follow-up Email", prompt: "Write a polite follow-up email for a lead who hasn't responded to our initial outreach. Reference the previous email and add new value or a case study." },
      { id: "ch-analyze", label: "Analyze Website", prompt: "Analyze this business's current website and identify specific problems: poor design, slow loading, no mobile responsiveness, missing SEO, broken links, etc. Provide actionable recommendations." },
    ],
    specialCommands: [
      { id: "ch-find-location", label: "Find by Location", prompt: "Search for clients in this location: ", icon: "MapPin" },
      { id: "ch-find-industry", label: "Find by Industry", prompt: "Search for clients in this industry: ", icon: "Building" },
      { id: "ch-send-finance", label: "Send to Finance", prompt: "Send this lead to the Finance Agent for quotation preparation: ", icon: "DollarSign" },
      { id: "ch-schedule", label: "Schedule Outreach", prompt: "Schedule a 7-day outreach plan for: ", icon: "Calendar" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, leadScoring: true, emailDrafting: true },
    suggestedPrompts: [
      { id: "ch-sp1", label: "Find clients in Harrow", prompt: "Find potential clients in Harrow, London who need web development services. Look for businesses without professional websites." },
      { id: "ch-sp2", label: "Find restaurants needing websites", prompt: "Search for restaurants in our target area that don't have a professional website or online ordering system." },
      { id: "ch-sp3", label: "Score this lead", prompt: "Analyze and score this potential client. They are a small retail business with an outdated website." },
    ],
  },
  FINANCE: {
    rolePrompt: `You are Finance Agent, an expert financial assistant for TrishulHub. You estimate project costs, generate professional invoices and quotations, track payments, send payment reminders, and create financial reports. When the Client Hunter finds a new lead, you automatically research and prepare a cost estimation. You work with the Project Manager to track project budgets and flag overruns. All financial outputs (invoices, quotations) require human approval before being sent to clients. You calculate accurately and always include proper breakdowns and terms.`,
    quickActions: [
      { id: "fin-estimate", label: "Estimate Cost", prompt: "Estimate the cost for this project based on the requirements. Include breakdown of: design, development, testing, deployment, and maintenance. Add a 15-20% contingency." },
      { id: "fin-quotation", label: "Create Quotation", prompt: "Create a professional quotation for this client. Include project scope, deliverables, timeline, payment terms, and total cost with breakdown." },
      { id: "fin-invoice", label: "Generate Invoice", prompt: "Generate a professional invoice for the specified project/client. Include itemized services, subtotal, tax, total, and payment terms with due date." },
      { id: "fin-reminder", label: "Payment Reminder", prompt: "Draft a polite payment reminder for the client with overdue invoice. Include invoice number, amount due, and due date." },
      { id: "fin-report", label: "Financial Report", prompt: "Generate a financial summary report including: revenue this month, outstanding invoices, expenses, profit margin, and cash flow projection." },
    ],
    specialCommands: [
      { id: "fin-research", label: "Research Pricing", prompt: "Research market pricing for this type of project and recommend competitive rates: ", icon: "Search" },
      { id: "fin-notify-pm", label: "Notify PM", prompt: "Notify the Project Manager about the budget status for: ", icon: "MessageSquare" },
      { id: "fin-schedule", label: "Schedule Invoice", prompt: "Schedule an invoice to be generated for: ", icon: "Calendar" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, autoInvoice: false, autoQuotation: false },
    suggestedPrompts: [
      { id: "fin-sp1", label: "Estimate 5-page website", prompt: "Estimate the cost for a 5-page responsive business website with contact form, about page, services, blog, and homepage." },
      { id: "fin-sp2", label: "Create monthly invoice", prompt: "Create an invoice for monthly website maintenance services: hosting, security updates, backups, and content updates." },
      { id: "fin-sp3", label: "Payment status report", prompt: "Give me a report on all outstanding payments and overdue invoices." },
    ],
  },
  PROJECT_MANAGER: {
    rolePrompt: `You are Project Manager Agent, an expert project manager for TrishulHub. You deeply analyze project requirements, break them into phases and tasks, assign work to appropriate team members or AI agents, track deadlines, manage dependencies, and ensure on-time delivery. When a project is approved, you create a detailed plan with milestones, assign tasks to the Dev Agent for coding, and coordinate between all agents. You flag risks early, suggest timeline adjustments, and keep stakeholders informed. Each project phase requires human approval before proceeding. You work closely with the Finance Agent on budgets and the Dev Agent on implementation.`,
    quickActions: [
      { id: "pm-plan", label: "Plan Project", prompt: "Analyze the project requirements and create a detailed project plan with: phases, tasks, dependencies, estimated hours, deadlines, and assigned team members." },
      { id: "pm-breakdown", label: "Break into Tasks", prompt: "Break this project into specific, actionable tasks with: description, priority, estimated hours, assignee suggestion, and dependencies between tasks." },
      { id: "pm-assign", label: "Assign Tasks", prompt: "Review the project tasks and assign them to the best-suited team members or AI agents based on skills, availability, and workload." },
      { id: "pm-status", label: "Status Report", prompt: "Generate a project status report including: completed tasks, in-progress tasks, blockers, risks, budget status, and projected completion date." },
      { id: "pm-deadline", label: "Check Deadlines", prompt: "Review all active projects and flag any that are at risk of missing their deadline. Suggest corrective actions for each." },
    ],
    specialCommands: [
      { id: "pm-approve-phase", label: "Approve Phase", prompt: "Review and approve the current project phase for: ", icon: "CheckCircle" },
      { id: "pm-assign-dev", label: "Assign to Dev", prompt: "Assign this task to the Dev Agent: ", icon: "Code2" },
      { id: "pm-alert", label: "Send Alert", prompt: "Send a deadline alert about: ", icon: "AlertTriangle" },
      { id: "pm-schedule", label: "Schedule Review", prompt: "Schedule a project review meeting for: ", icon: "Calendar" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, autoAssign: false, riskAlerts: true },
    suggestedPrompts: [
      { id: "pm-sp1", label: "Plan e-commerce project", prompt: "Plan an e-commerce website project with product catalog, cart, checkout, payment integration, and admin panel." },
      { id: "pm-sp2", label: "Check all deadlines", prompt: "Review all active projects and their deadlines. Flag any risks and suggest priority adjustments." },
      { id: "pm-sp3", label: "Create sprint plan", prompt: "Create a 2-week sprint plan for the team with prioritized tasks and clear deliverables." },
    ],
  },
  HR: {
    rolePrompt: `You are HR Agent, an expert HR coordinator for TrishulHub. You manage leave requests, track attendance, monitor employee workload, and suggest the best-fit employees for specific tasks. You analyze team capacity, flag overwork or underutilization, manage onboarding processes, and ensure fair workload distribution. You proactively notify management about attendance issues, upcoming leave conflicts, and workload imbalances. You help find the right team member for each task based on skills, availability, and current workload.`,
    quickActions: [
      { id: "hr-workload", label: "Check Workload", prompt: "Analyze the current workload of all team members. Who is overworked? Who has capacity? Suggest task redistribution if needed." },
      { id: "hr-best-fit", label: "Find Best Fit", prompt: "Given this task requirement, which team member is the best fit? Consider their skills, current workload, and availability." },
      { id: "hr-leave-report", label: "Leave Report", prompt: "Generate a leave report showing: pending requests, approved leaves this month, team availability, and any conflicts." },
      { id: "hr-attendance", label: "Attendance Summary", prompt: "Generate an attendance summary for this period. Flag any patterns of absence, late arrivals, or early departures." },
      { id: "hr-onboard", label: "Onboarding Plan", prompt: "Create an onboarding plan for a new team member joining as a developer. Include first day, first week, and first month milestones." },
    ],
    specialCommands: [
      { id: "hr-approve-leave", label: "Approve Leave", prompt: "Review and recommend action for this leave request: ", icon: "CheckCircle" },
      { id: "hr-flag", label: "Flag Issue", prompt: "Flag this HR issue to management: ", icon: "AlertTriangle" },
      { id: "hr-schedule", label: "Schedule Review", prompt: "Schedule a performance review for: ", icon: "Calendar" },
    ],
    features: { agentic: true, webSearch: true, autoTask: false, crossAgent: true, approvalRequired: false, workloadTracking: true, leaveManagement: true },
    suggestedPrompts: [
      { id: "hr-sp1", label: "Who's available?", prompt: "Which team members are available this week? Show their current workload and capacity." },
      { id: "hr-sp2", label: "Leave conflicts", prompt: "Are there any leave conflicts in the next 2 weeks that could affect project deadlines?" },
      { id: "hr-sp3", label: "Best developer for task", prompt: "Who is the best developer to assign a React.js task to? Consider their current workload." },
    ],
  },
  CONTENT: {
    rolePrompt: `You are Content Agent, an expert content writer and marketing specialist for TrishulHub. You write website copy, social media posts, blog articles, email campaigns, and SEO-optimized content. You adapt your tone for different platforms: professional for LinkedIn, casual for Instagram, clear and concise for websites. You understand SEO principles and create content that ranks. You can generate multiple variations for A/B testing and tailor content for specific audiences. All content pieces require human approval before publishing.`,
    quickActions: [
      { id: "con-website", label: "Website Copy", prompt: "Write professional website copy for this page. Include a compelling headline, clear value proposition, feature descriptions, and a strong call-to-action." },
      { id: "con-social", label: "Social Media Post", prompt: "Create engaging social media posts for this topic. Include platform-specific versions: Instagram (visual + casual), LinkedIn (professional), Twitter/X (concise)." },
      { id: "con-blog", label: "Blog Article", prompt: "Write an SEO-optimized blog article on this topic. Include: catchy title, meta description, headers, internal linking suggestions, and a conclusion with CTA." },
      { id: "con-email", label: "Email Campaign", prompt: "Create an email marketing campaign with: subject line, preview text, body content, and CTA button text. Make it personalized and conversion-focused." },
      { id: "con-seo", label: "SEO Keywords", prompt: "Research and suggest SEO keywords for this topic. Include search volume estimates, competition level, and content optimization recommendations." },
    ],
    specialCommands: [
      { id: "con-review", label: "Review Content", prompt: "Review this content for: grammar, tone, SEO, readability, and engagement. Provide specific improvements: ", icon: "Eye" },
      { id: "con-approve", label: "Submit for Approval", prompt: "Submit this content piece for approval: ", icon: "CheckCircle" },
      { id: "con-schedule", label: "Schedule Post", prompt: "Schedule this content for publishing: ", icon: "Calendar" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: true, seoOptimization: true, multiPlatform: true },
    suggestedPrompts: [
      { id: "con-sp1", label: "Write website homepage", prompt: "Write compelling homepage copy for a restaurant website. Include hero section, about us, menu highlights, and call-to-action." },
      { id: "con-sp2", label: "Social media campaign", prompt: "Create a week-long social media campaign for a new website launch. Posts for Instagram, LinkedIn, and Twitter/X." },
      { id: "con-sp3", label: "Blog about web design trends", prompt: "Write an SEO-optimized blog article about the top 10 web design trends for small businesses in 2025." },
    ],
  },
  SUPPORT: {
    rolePrompt: `You are Support Agent, an expert customer support specialist for TrishulHub. You handle client tickets, answer FAQs about websites, hosting, domains, and email, provide technical troubleshooting, and escalate complex issues to the appropriate team member. You are patient, thorough, and friendly. You document common issues and create knowledge base articles. You proactively follow up on unresolved tickets and ensure client satisfaction. When an issue requires development work, you escalate to the Dev Agent through the cross-agent communication system.`,
    quickActions: [
      { id: "sup-faq", label: "Answer FAQ", prompt: "Provide a detailed answer to this frequently asked question about website hosting, domains, or email setup." },
      { id: "sup-troubleshoot", label: "Troubleshoot", prompt: "Help troubleshoot this technical issue step by step. Start with the most common causes and work through solutions systematically." },
      { id: "sup-escalate", label: "Escalate Issue", prompt: "This issue requires escalation. Analyze the problem, document what's been tried, and recommend the appropriate team or agent to handle it." },
      { id: "sup-followup", label: "Follow Up", prompt: "Draft a follow-up message to a client whose ticket was recently resolved. Check if they need any further assistance." },
      { id: "sup-kb", label: "Knowledge Base", prompt: "Create a knowledge base article for this common issue. Include: problem description, cause, step-by-step solution, and prevention tips." },
    ],
    specialCommands: [
      { id: "sup-assign-dev", label: "Send to Dev", prompt: "Escalate this technical issue to the Dev Agent: ", icon: "Code2" },
      { id: "sup-close", label: "Close Ticket", prompt: "Close this ticket with resolution summary: ", icon: "CheckCircle" },
      { id: "sup-priority", label: "Set Priority", prompt: "Assess and set the priority for this ticket: ", icon: "AlertTriangle" },
    ],
    features: { agentic: true, webSearch: true, autoTask: true, crossAgent: true, approvalRequired: false, autoEscalation: true, knowledgeBase: true },
    suggestedPrompts: [
      { id: "sup-sp1", label: "Email not working", prompt: "My business email is not sending or receiving messages. Help me troubleshoot this issue." },
      { id: "sup-sp2", label: "Website down", prompt: "My website is showing a 500 error. Help me diagnose and fix this urgently." },
      { id: "sup-sp3", label: "Domain DNS setup", prompt: "How do I configure DNS records for my domain to point to my new hosting?" },
    ],
  },
};

// ━━ Model Options ━━
export const MODEL_OPTIONS = {
  openrouter: [
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", cost: "$" },
    { value: "openai/gpt-4o", label: "GPT-4o", cost: "$$$" },
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", cost: "$$$" },
    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (Free)", cost: "Free" },
    { value: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Free)", cost: "Free" },
    { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free)", cost: "Free" },
  ],
  zai: [
    { value: "glm-5.1", label: "GLM 5.1 (Premium)", cost: "$$$" },
    { value: "glm-4-plus-0111", label: "GLM-4 Plus", cost: "$$" },
    { value: "glm-4.5-air-250414", label: "GLM-4.5 Air", cost: "$" },
    { value: "glm-4-air-250414", label: "GLM-4 Air", cost: "$" },
    { value: "glm-4-flash-250414", label: "GLM-4 Flash", cost: "$" },
    { value: "glm-4.5-flash", label: "GLM-4.5 Flash (Free + Agentic ✅)", cost: "Free" },
    { value: "glm-4.7-flash", label: "GLM-4.7 Flash (Free - No Tool Calling)", cost: "Free" },
    { value: "glm-4-long-250414", label: "GLM-4 Long", cost: "$" },
  ],
  nvidia: [
    { value: "z-ai/glm-5.1", label: "Trishul AI — GLM 5.1 (Reasoning ✅)", cost: "$$" },
  ],
};

// ━━ Department Options ━━
export const DEPARTMENTS = [
  { value: "MANAGEMENT", label: "Management" },
  { value: "SALES", label: "Sales & Business Development" },
  { value: "DEV", label: "Development" },
  { value: "FINANCE", label: "Finance" },
  { value: "HR", label: "Human Resources" },
  { value: "CONTENT", label: "Content & Marketing" },
  { value: "SUPPORT", label: "Support" },
];
