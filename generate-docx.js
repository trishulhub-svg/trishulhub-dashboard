const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, TableOfContents, PageBreak, BorderStyle,
  ShadingType, WidthType, Header, Footer, PageNumber, NumberFormat,
  TabStopType, TabStopPosition, VerticalAlign, SectionType
} = require("docx");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════
// COLOR PALETTES
// ═══════════════════════════════════════════════════

// Tech scene (Dawn Mist Tech)
const TECH = {
  primary: "0A1628",
  body: "1A2B40",
  secondary: "6878A0",
  accent: "5B8DB8",
  surface: "F4F8FC",
};

// Cover CM-2 (Blue Orange)
const CM2 = {
  bg: "FEFEFE",
  primary: "1284BA",
  accent: "FF862F",
  subtitle: "606060",
  meta: "707070",
};

// Table colors
const TBL = {
  headerBg: "1284BA",
  headerText: "FFFFFF",
  innerLine: "D8E4EC",
  surface: "EDF4F9",
};

// ═══════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TECH.accent, space: 8 } },
    children: [new TextRun({ text, font: "Calibri", size: 28, bold: true, color: TECH.primary })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TBL.innerLine, space: 6 } },
    children: [new TextRun({ text, font: "Calibri", size: 24, bold: true, color: TECH.primary })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "Calibri", size: 22, bold: true, color: TECH.accent })],
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, font: "Calibri", size: 24, color: TECH.body })],
  });
}

function bodyTextBold(boldText, normalText) {
  return new Paragraph({
    spacing: { line: 312, after: 120 },
    children: [
      new TextRun({ text: boldText, font: "Calibri", size: 24, bold: true, color: TECH.primary }),
      new TextRun({ text: normalText, font: "Calibri", size: 24, color: TECH.body }),
    ],
  });
}

function bulletPoint(text, level = 0) {
  return new Paragraph({
    spacing: { line: 312, after: 60 },
    indent: { left: 720 + level * 360 },
    bullet: { level },
    children: [new TextRun({ text, font: "Calibri", size: 24, color: TECH.body })],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

function headerCell(text, width) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: TBL.headerBg },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, font: "Calibri", size: 20, bold: true, color: TBL.headerText })],
    })],
  });
}

function dataCell(text, width, opts = {}) {
  const align = opts.center ? AlignmentType.CENTER : (opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT);
  const children = Array.isArray(text) ? text : [new TextRun({ text: String(text), font: "Calibri", size: 20, color: opts.color || TECH.body, bold: opts.bold || false })];
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: opts.bg || undefined },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children })],
  });
}

function makeTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => headerCell(h, colWidths ? colWidths[i] : undefined)),
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      cantSplit: true,
      children: row.map((cell, ci) =>
        dataCell(cell, colWidths ? colWidths[ci] : undefined, { bg: ri % 2 === 1 ? TBL.surface : undefined })
      ),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function noteBox(text) {
  return new Paragraph({
    spacing: { line: 312, before: 120, after: 120 },
    indent: { left: 360, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: CM2.accent, space: 8 } },
    shading: { type: ShadingType.CLEAR, fill: TECH.surface },
    children: [
      new TextRun({ text: "NOTE: ", font: "Calibri", size: 22, bold: true, color: CM2.accent }),
      new TextRun({ text, font: "Calibri", size: 22, color: TECH.body }),
    ],
  });
}

function verdictBox(label, verdict, details) {
  return new Paragraph({
    spacing: { line: 312, before: 120, after: 120 },
    indent: { left: 360, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: TECH.accent, space: 8 } },
    shading: { type: ShadingType.CLEAR, fill: TECH.surface },
    children: [
      new TextRun({ text: `${label}: `, font: "Calibri", size: 22, bold: true, color: TECH.primary }),
      new TextRun({ text: verdict, font: "Calibri", size: 22, bold: true, color: TECH.accent }),
      new TextRun({ text: ` — ${details}`, font: "Calibri", size: 22, color: TECH.body }),
    ],
  });
}

// ═══════════════════════════════════════════════════
// COVER PAGE (R2: Double-Rule Frame + CM-2)
// ═══════════════════════════════════════════════════

const coverChildren = [
  // Top spacer
  new Paragraph({ spacing: { before: 3600 }, children: [] }),
  // Top rule
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: CM2.primary, space: 12 } },
    children: [],
  }),
  // Title
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: "TrishulHub \u00D7 Lark Integration", font: "Calibri", size: 52, bold: true, color: CM2.primary }),
    ],
  }),
  // Subtitle
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({ text: "Technical Specification & Architectural Blueprint", font: "Calibri", size: 28, color: CM2.subtitle }),
    ],
  }),
  // Bottom rule
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: CM2.accent, space: 12 } },
    children: [],
  }),
  // Meta
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "Version 1.0  |  Confidential  |  June 2026", font: "Calibri", size: 22, color: CM2.meta }),
    ],
  }),
  // Company
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: TBL.innerLine, space: 8 } },
    children: [
      new TextRun({ text: "TrishulHub Systems", font: "Calibri", size: 24, bold: true, color: CM2.primary }),
    ],
  }),
];

// ═══════════════════════════════════════════════════
// TABLE OF CONTENTS
// ═══════════════════════════════════════════════════

const tocSection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Table of Contents", font: "Calibri", size: 28, bold: true, color: TECH.primary })],
  }),
  new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-3",
  }),
];

// ═══════════════════════════════════════════════════
// SECTION 1: EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════

const section1 = [
  heading1("1. Executive Summary"),
  bodyText("This Technical Specification Document outlines the complete integration architecture between TrishulHub, a comprehensive enterprise management platform, and Lark (by ByteDance), a leading workplace collaboration suite. The integration aims to establish bidirectional synchronization of core business data — tasks, meetings, leave management, approvals, and messaging — enabling teams to operate seamlessly across both platforms."),
  emptyLine(),
  bodyText("TrishulHub serves as the organization's central operational hub, deployed on Vercel with a Next.js 16 frontend, SQLite/Turso database via Prisma ORM, and 66 data models spanning 35+ functional modules. The platform manages everything from project management and CRM to finance and training. The goal is to surface critical TrishulHub operations within Lark's collaborative workspace, while allowing actions taken in Lark to propagate back to TrishulHub."),
  emptyLine(),
  bodyTextBold("Critical Constraint — The 10,000 API Calls/Month Limit: ", "The single most impactful finding of this analysis is Lark Free Tier's shared monthly API quota of 10,000 calls (effective since March 2025). This limit applies to nearly all API operations except authentication, event subscriptions, and basic contact reads. At approximately 333 calls per day, this severely constrains the frequency and breadth of real-time synchronization. A 5-person team could realistically achieve 40-65 meaningful sync operations per day, assuming efficient batching and prioritization. This document provides a detailed budget analysis and recommends a prioritized implementation approach that maximizes value within this constraint."),
  emptyLine(),
  bodyText("Key findings include: (a) Task synchronization is the strongest candidate for 2-way sync with minimal quota impact, leveraging unlimited event subscriptions. (b) Meeting and Leave/Approval sync is feasible but heavily constrained by Advanced-scope API calls that require tenant admin approval and consume the shared quota. (c) Messaging and announcements represent the best free-tier value proposition as IM operations are primarily Basic-scope, allowing unlimited bot-driven notifications from TrishulHub to Lark groups. (d) The implementation requires a phased 4-week roadmap, beginning with foundation infrastructure and culminating in polished cross-platform workflows."),
  emptyLine(),
  noteBox("This document is intended for engineering teams, product stakeholders, and Lark tenant administrators who will collaborate on the integration's design, approval, and deployment phases."),
];

// ═══════════════════════════════════════════════════
// SECTION 2: SYSTEM AUDIT
// ═══════════════════════════════════════════════════

const section2 = [
  heading1("2. System Audit — TrishulHub"),

  heading2("2.1 Architecture Overview"),
  bodyText("TrishulHub is a full-stack enterprise management platform built on a modern technology stack. The following table summarizes the core architectural components that define the system's deployment, data, and authentication layers."),
  emptyLine(),
  makeTable(
    ["Component", "Technology", "Details"],
    [
      ["Framework", "Next.js 16.1.3", "App Router, React Server Components, Server Actions"],
      ["Deployment", "Vercel", "Edge-optimized, global CDN, auto-scaling"],
      ["Database", "SQLite / Turso", "Distributed SQLite via libSQL, edge-deployed"],
      ["ORM", "Prisma 6.x", "Type-safe database client, 66 models defined"],
      ["Authentication", "NextAuth.js v4", "JWT-based sessions, role-based access control"],
      ["API Routes", "97 routes", "RESTful API across /api/* endpoints"],
      ["Modules", "35+ modules", "Tasks, Projects, CRM, Finance, HR, Support, etc."],
      ["Frontend", "React + Tailwind CSS", "Responsive UI with shadcn/ui components"],
      ["State Management", "Zustand + TanStack Query", "Client state + server state caching"],
      ["Production URL", "trishulhub.com", "HTTPS, accessible globally"],
    ],
    [22, 22, 56]
  ),
  emptyLine(),

  heading2("2.2 Core Modules Inventory"),
  bodyText("TrishulHub comprises 35+ functional modules, each backed by one or more Prisma models and exposed through dedicated API routes. The following table inventories the modules most relevant to the Lark integration, along with their data models, API surface, and operational status."),
  emptyLine(),
  makeTable(
    ["Module Name", "Prisma Models", "API Routes", "Key Fields", "Status"],
    [
      ["Tasks", "Task, TaskComment", "8 routes (CRUD + assign)", "title, status, priority, deadline, assignedTo", "Active"],
      ["Projects", "Project, ProjectMember", "6 routes", "name, status, startDate, endDate, budget", "Active"],
      ["Meetings", "Meeting, MeetingAttendee", "7 routes", "title, date, startTime, endTime, meetingLink", "Active"],
      ["Leave Management", "Leave", "5 routes", "leaveType, startDate, endDate, reason, status", "Active"],
      ["Approvals", "Approval", "4 routes", "type, title, description, status, data", "Active"],
      ["Notifications", "Notification", "3 routes", "title, message, type, link, isRead", "Active"],
      ["Time Tracking", "TimeEntry", "5 routes", "projectId, userId, date, hours, description", "Active"],
      ["Team / Users", "User, Role, Permission", "6 routes", "name, email, role, department", "Active"],
      ["CRM — Leads", "Lead", "5 routes", "name, email, company, stage, value", "Active"],
      ["CRM — Deals", "Deal", "4 routes", "title, stage, value, closeDate", "Active"],
      ["CRM — Contacts", "Contact", "4 routes", "name, email, phone, company", "Active"],
      ["Finance — Invoices", "Invoice, InvoiceItem", "6 routes", "invoiceNumber, amount, status, dueDate", "Active"],
      ["Finance — Expenses", "Expense", "4 routes", "title, amount, category, date", "Active"],
      ["Finance — Subscriptions", "Subscription", "3 routes", "plan, amount, billingCycle, status", "Active"],
      ["Support Tickets", "Ticket, TicketMessage", "6 routes", "subject, status, priority, messages", "Active"],
      ["Files", "File", "3 routes", "name, url, mimeType, size", "Active"],
      ["Training", "Training, Enrollment", "4 routes", "title, description, duration, status", "Active"],
      ["Audit Trail", "AuditLog", "2 routes (read-only)", "action, entityType, entityId, userId", "Active"],
    ],
    [16, 18, 16, 30, 10]
  ),
  emptyLine(),

  heading2("2.3 Relevant Data Models for Integration"),
  bodyText("The following data models within TrishulHub's Prisma schema are directly relevant to the Lark integration. These models define the structure of data that will be synchronized between the two platforms."),
  emptyLine(),

  heading3("Task Model"),
  bodyText("The Task model is the cornerstone of project management within TrishulHub. Tasks represent discrete work items assigned to team members, with lifecycle states from creation through completion."),
  emptyLine(),
  makeTable(
    ["Field", "Type", "Description", "Lark Mapping Target"],
    [
      ["id", "String (UUID)", "Unique identifier", "task.id (Lark-generated)"],
      ["title", "String", "Task title/name", "task.name"],
      ["description", "String (optional)", "Detailed description", "task.content"],
      ["status", "Enum", "TODO, IN_PROGRESS, REVIEW, DONE", "task.completed_at (null/set)"],
      ["priority", "Enum", "LOW, MEDIUM, HIGH, URGENT", "task.priority"],
      ["deadline", "DateTime (optional)", "Due date", "task.due_date"],
      ["category", "String (optional)", "Classification tag", "task.custom_fields"],
      ["assignedToId", "String (FK: User)", "Assigned team member", "task.owner (open_id)"],
      ["createdById", "String (FK: User)", "Task creator", "task.creator"],
      ["createdAt", "DateTime", "Timestamp of creation", "task.created_at"],
      ["updatedAt", "DateTime", "Timestamp of last update", "task.modified_at"],
    ],
    [18, 18, 34, 30]
  ),
  emptyLine(),

  heading3("Meeting & MeetingAttendee Models"),
  bodyText("The Meeting model manages scheduled gatherings — physical, virtual, or hybrid — with associated attendee tracking and RSVP status. This maps directly to Lark Calendar events."),
  emptyLine(),
  makeTable(
    ["Field", "Type", "Description", "Lark Mapping Target"],
    [
      ["id", "String (UUID)", "Unique identifier", "calendar event.id"],
      ["title", "String", "Meeting title", "event.summary"],
      ["date", "DateTime", "Meeting date", "event.start_time (date portion)"],
      ["startTime", "DateTime", "Start time", "event.start_time (RFC3339)"],
      ["endTime", "DateTime", "End time", "event.end_time (RFC3339)"],
      ["meetingType", "Enum", "IN_PERSON, VIRTUAL, HYBRID", "event.description field"],
      ["meetingLink", "String (optional)", "Video conference URL", "event.conference_link"],
      ["organizerId", "String (FK: User)", "Meeting organizer", "event.organizer (user token)"],
      ["status", "Enum", "SCHEDULED, COMPLETED, CANCELLED", "event.status"],
      ["MeetingAttendee.userId", "String (FK: User)", "Attendee reference", "event.attendees[].user_id"],
      ["MeetingAttendee.rsvpStatus", "Enum", "ACCEPTED, DECLINED, TENTATIVE, PENDING", "event.attendees[].rsvp_status"],
    ],
    [22, 16, 32, 30]
  ),
  emptyLine(),

  heading3("Leave Model"),
  bodyText("The Leave model handles employee absence requests — vacations, sick days, personal time — with approval workflows. This maps to Lark's Approval (OA) system."),
  emptyLine(),
  makeTable(
    ["Field", "Type", "Description", "Lark Mapping Target"],
    [
      ["id", "String (UUID)", "Unique identifier", "approval.instance_id"],
      ["leaveType", "Enum", "VACATION, SICK, PERSONAL, MATERNITY, PATERNITY", "approval.definition_code"],
      ["startDate", "DateTime", "Leave start date", "approval form field"],
      ["endDate", "DateTime", "Leave end date", "approval form field"],
      ["reason", "String", "Justification", "approval form field"],
      ["status", "Enum", "PENDING, APPROVED, REJECTED, CANCELLED", "instance.status"],
      ["approvedById", "String (FK: User)", "Approving manager", "approval.task.operator"],
      ["userId", "String (FK: User)", "Leave requester", "instance.start_user_id"],
    ],
    [18, 18, 32, 32]
  ),
  emptyLine(),

  heading3("Approval & Notification Models"),
  bodyText("The Approval model provides a generic approval workflow engine, while the Notification model serves as the platform's broadcast mechanism. Notifications will be pushed to Lark IM channels."),
  emptyLine(),
  makeTable(
    ["Field", "Type", "Description", "Lark Mapping Target"],
    [
      ["Approval.id", "String", "Unique identifier", "approval.instance_id"],
      ["Approval.type", "String", "Approval category", "definition_code"],
      ["Approval.title", "String", "Approval subject", "instance.name"],
      ["Approval.description", "String", "Detailed description", "form field"],
      ["Approval.status", "Enum", "PENDING, APPROVED, REJECTED", "instance.status"],
      ["Approval.data", "Json", "Structured payload", "form fields"],
      ["Notification.id", "String", "Unique identifier", "IM message (generated)"],
      ["Notification.title", "String", "Notification heading", "IM card title"],
      ["Notification.message", "String", "Notification body", "IM card content"],
      ["Notification.type", "Enum", "INFO, WARNING, ERROR, SUCCESS", "IM message tag"],
    ],
    [22, 12, 28, 28]
  ),
  emptyLine(),

  heading2("2.4 Existing API Endpoints for Integration"),
  bodyText("The following table maps TrishulHub's existing REST API endpoints to the database operations they perform. These endpoints serve as the integration touchpoints where Lark sync operations will trigger reads and writes."),
  emptyLine(),
  makeTable(
    ["API Route", "Method", "Purpose", "Models Touched"],
    [
      ["/api/tasks", "GET", "List all tasks (paginated)", "Task"],
      ["/api/tasks", "POST", "Create a new task", "Task, Notification"],
      ["/api/tasks/[id]", "GET", "Get single task details", "Task"],
      ["/api/tasks/[id]", "PUT", "Update task fields", "Task, AuditLog"],
      ["/api/tasks/[id]", "DELETE", "Remove a task", "Task, AuditLog"],
      ["/api/tasks/[id]/assign", "POST", "Assign task to user", "Task, Notification"],
      ["/api/tasks/[id]/status", "PATCH", "Change task status", "Task, AuditLog"],
      ["/api/meetings", "GET", "List all meetings", "Meeting, MeetingAttendee"],
      ["/api/meetings", "POST", "Schedule a new meeting", "Meeting, MeetingAttendee, Notification"],
      ["/api/meetings/[id]", "PUT", "Update meeting details", "Meeting, MeetingAttendee"],
      ["/api/meetings/[id]/rsvp", "POST", "Update attendee RSVP", "MeetingAttendee"],
      ["/api/leave", "GET", "List leave requests", "Leave"],
      ["/api/leave", "POST", "Submit leave request", "Leave, Approval, Notification"],
      ["/api/leave/[id]/approve", "POST", "Approve/reject leave", "Leave, Approval, Notification"],
      ["/api/approvals", "GET", "List approval requests", "Approval"],
      ["/api/approvals/[id]", "PUT", "Update approval status", "Approval, Notification"],
      ["/api/notifications", "GET", "List notifications", "Notification"],
      ["/api/notifications", "POST", "Create notification", "Notification"],
      ["/api/notifications/[id]/read", "PATCH", "Mark notification read", "Notification"],
    ],
    [28, 8, 32, 32]
  ),
];

// ═══════════════════════════════════════════════════
// SECTION 3: LARK FREE TIER CAPABILITY ANALYSIS
// ═══════════════════════════════════════════════════

const section3 = [
  heading1("3. Lark Free Tier — Capability Analysis"),

  heading2("3.1 API Billing Model"),
  bodyText("Since March 2025, Lark has consolidated its free-tier API billing into a single shared monthly quota of 10,000 API calls. This represents a significant constraint for enterprise integrations and must be the central design consideration for all synchronization logic."),
  emptyLine(),
  bodyTextBold("Shared Quota Architecture: ", "The 10,000-call monthly quota is shared across all API operations within the app, regardless of API category. Authentication operations, event subscription callbacks, and basic contact reads are exempt from this quota and classified as Unlimited. All other API operations — including task CRUD, calendar management, approval workflows, and IM message sends — draw from the same shared pool."),
  emptyLine(),
  makeTable(
    ["Billing Category", "APIs Included", "Monthly Limit", "Impact on Integration"],
    [
      ["Unlimited", "Auth (token refresh), Event Subscriptions, Basic Contact (base info read)", "No limit", "Webhook handling and user lookups are safe"],
      ["Shared Quota", "Task API (read/write), Calendar API (all operations), Approval API (all), IM (message send/recv beyond events)", "10,000/month shared", "PRIMARY CONSTRAINT — all sync operations compete for this pool"],
    ],
    [16, 30, 14, 40]
  ),
  emptyLine(),
  bodyTextBold("Daily Budget Math: ", "10,000 calls per month, assuming 30 days, yields approximately 333 calls per day. A single task synchronization cycle (create + event listener acknowledgment + status read-back) may consume 5-8 API calls. A meeting sync cycle requires 6-10 calls. Leave/approval operations demand 8-12 calls per cycle. This means a 5-person team can realistically sustain 40-65 meaningful sync operations per day before quota becomes a concern."),
  emptyLine(),
  noteBox("At 333 calls/day, high-frequency real-time sync (sub-minute intervals) is NOT feasible on the free tier. The architecture must prioritize event-driven (webhook-based) synchronization over polling to minimize API consumption."),

  heading2("3.2 Scope Permission System"),
  bodyText("Lark's API scopes are categorized into two approval levels that directly impact the integration's deployment timeline. Understanding this distinction is critical for planning."),
  emptyLine(),
  makeTable(
    ["Scope Level", "Approval Process", "Typical APIs", "Integration Impact"],
    [
      ["Basic", "Developer self-approves in Lark Developer Console", "Task read, Task list read, Calendar read-only, IM message send/receive, Contact base info read", "Fastest to implement — no external approval dependency"],
      ["Advanced", "Requires Lark tenant administrator approval", "Task write (create/update), Calendar write (create/update/delete), Calendar subscription, Approval (all operations)", "Adds 1-5 day delay to deployment — admin must review and approve"],
    ],
    [12, 24, 34, 30]
  ),
  emptyLine(),
  bodyText("The billing category (Unlimited vs. Shared Quota) is orthogonal to the scope level. An API can be Basic scope (self-approve) but still consume quota, or it can be Advanced scope (admin-approve) and be Unlimited. Event subscriptions, for example, are typically Advanced scope but Unlimited — meaning they require admin approval but don't burn the monthly quota."),

  heading2("3.3 Authentication Model"),
  bodyText("Lark provides two distinct token types, each suited to different integration scenarios. The choice between them affects both the API capabilities available and the user experience of the integration."),
  emptyLine(),
  makeTable(
    ["Token Type", "Identity", "Use Cases", "How to Obtain", "Scope Access"],
    [
      ["tenant_access_token", "App/Bot identity (acts as the application)", "Reading organization data, sending messages as bot, managing tasks on behalf of the org", "POST /auth/v3/tenant_access_token/internal with appId + appSecret", "All scopes granted to the app"],
      ["user_access_token", "Individual user identity", "Creating calendar events as user, acting on behalf of a specific person in approvals, accessing user-private data", "OAuth 2.0 authorization code flow — user redirects to Lark consent screen", "Scopes user explicitly consents to"],
    ],
    [18, 16, 28, 20, 18]
  ),
  emptyLine(),
  bodyTextBold("Token Selection Strategy: ", "For the TrishulHub-Lark integration, the recommended approach is: (a) Use tenant_access_token for all bot-level operations: task CRUD, notification broadcasting, webhook event verification. (b) Use user_access_token for user-bound operations: calendar event creation (must be created under the user's calendar), approval instance submission (must be from the requesting user's identity). A token caching and refresh layer must be implemented to avoid unnecessary token requests consuming quota."),
];

// ═══════════════════════════════════════════════════
// SECTION 4: 2-WAY SYNC FEASIBILITY MAPPING
// ═══════════════════════════════════════════════════

const section4 = [
  heading1("4. Two-Way Sync Feasibility Mapping"),
  bodyText("This section provides a granular, field-by-field analysis of the synchronization feasibility for each integration domain. Each domain is evaluated across three dimensions: data mapping completeness, API scope requirements, and quota impact. The verdict for each domain determines its priority in the implementation roadmap."),

  heading2("4.1 Tasks: TrishulHub \u2194 Lark Tasks"),
  bodyText("Task synchronization represents the strongest candidate for full 2-way sync. Lark's Task API provides comprehensive CRUD operations and, critically, supports event subscriptions for real-time change notifications that do not consume the monthly quota."),
  emptyLine(),
  bodyTextBold("Data Mapping Table:", ""),
  emptyLine(),
  makeTable(
    ["TrishulHub Field", "Lark Task API Field", "Sync Direction", "Notes"],
    [
      ["title", "task.name", "2-way", "Direct mapping, no transformation needed"],
      ["description", "task.content", "2-way", "Rich text support on both sides; strip HTML for Lark"],
      ["status (TODO/IN_PROGRESS/REVIEW/DONE)", "task.completed_at (null or set)", "2-way", "Need custom status mapping layer: TrishulHub 4-state \u2194 Lark 2-state"],
      ["priority (LOW/MEDIUM/HIGH/URGENT)", "task.priority", "2-way", "Map URGENT to highest Lark priority value"],
      ["deadline", "task.due_date", "2-way", "ISO 8601 date string conversion"],
      ["assignedToId (userId)", "task.owner (open_id)", "2-way", "Requires user mapping table (TrishulHub userId \u2194 Lark open_id)"],
      ["category", "task.custom_fields", "TrishulHub \u2192 Lark", "Store as custom field in Lark task"],
      ["createdById", "task.creator", "TrishulHub \u2192 Lark", "Map creator identity on creation only"],
    ],
    [24, 24, 14, 38]
  ),
  emptyLine(),
  bodyTextBold("Feasibility Analysis:", ""),
  emptyLine(),
  bulletPoint("Read Operations: task:task:read — Basic scope (developer self-approves) \u2705"),
  bulletPoint("Write Operations: task:task:write — Advanced scope (tenant admin approval required) \u26A0\uFE0F"),
  bulletPoint("Event Subscription: task:task.event_update_tenant:readonly — Advanced scope but Unlimited billing \u2705"),
  bulletPoint("Task List Operations: task:tasklist:read — Basic scope \u2705"),
  emptyLine(),
  verdictBox("Verdict", "2-WAY POSSIBLE", "Write operations consume quota but event-driven sync minimizes API calls. Best free-tier fit for 2-way sync."),
  emptyLine(),

  heading2("4.2 Meetings: TrishulHub \u2194 Lark Calendar"),
  bodyText("Meeting synchronization maps TrishulHub meetings to Lark Calendar events. This domain is significantly more constrained than tasks because ALL calendar write operations require Advanced scopes, and calendar operations are user-bound (requiring user_access_token)."),
  emptyLine(),
  bodyTextBold("Data Mapping Table:", ""),
  emptyLine(),
  makeTable(
    ["TrishulHub Field", "Lark Calendar Field", "Sync Direction", "Notes"],
    [
      ["title", "event.summary", "2-way", "Direct string mapping"],
      ["description", "event.description", "2-way", "Supports rich text; sanitize HTML"],
      ["date + startTime + endTime", "event.start_time, end_time (RFC3339)", "2-way", "Combine date + time into RFC3339 timestamp"],
      ["meetingLink", "event.conference_link", "TrishulHub \u2192 Lark", "One-way: propagate meeting URL to Lark event"],
      ["meetingType", "event.description (annotation)", "TrishulHub \u2192 Lark", "Embed meeting type in description text"],
      ["organizerId", "event.organizer (user token)", "TrishulHub \u2192 Lark", "Requires user_access_token of organizer"],
      ["MeetingAttendee.userId[]", "event.attendees[]", "2-way", "Map each attendee via user mapping table"],
      ["status (SCHEDULED/COMPLETED/CANCELLED)", "event.status", "2-way", "Map enum values; CANCELLED \u2194 cancelled"],
    ],
    [24, 24, 14, 38]
  ),
  emptyLine(),
  bodyTextBold("Feasibility Analysis:", ""),
  emptyLine(),
  bulletPoint("Read: calendar:calendar:readonly — Basic scope \u2705"),
  bulletPoint("Write (create): calendar:calendar.event:create — Advanced scope \u26A0\uFE0F"),
  bulletPoint("Write (update): calendar:calendar.event:update — Advanced scope \u26A0\uFE0F"),
  bulletPoint("Write (delete): calendar:calendar.event:delete — Advanced scope \u26A0\uFE0F"),
  bulletPoint("Subscription: calendar:calendar:subscribe — Advanced scope \u26A0\uFE0F"),
  bulletPoint("CRITICAL: Calendar operations require user_access_token (must act AS the user, not as bot)"),
  emptyLine(),
  verdictBox("Verdict", "2-WAY POSSIBLE but HEAVILY CONSTRAINED", "All write operations are Advanced scope + require user tokens. Each meeting sync burns 6-10 API calls. Recommended only for high-priority meetings."),
  emptyLine(),

  heading2("4.3 Leave Management: TrishulHub \u2194 Lark Approvals"),
  bodyText("Leave synchronization leverages Lark's Approval (OA) system — a pre-built workflow engine within Lark. This is the most complex sync domain because it requires: (a) a pre-existing approval definition/template in Lark, (b) ALL approval scopes are Advanced, and (c) approval operations are inherently user-bound."),
  emptyLine(),
  bodyTextBold("Data Mapping Table:", ""),
  emptyLine(),
  makeTable(
    ["TrishulHub Field", "Lark Approval Field", "Sync Direction", "Notes"],
    [
      ["leaveType", "approval.definition_code (mapped)", "TrishulHub \u2192 Lark", "Requires predefined approval template per leave type"],
      ["startDate", "form field (date)", "TrishulHub \u2192 Lark", "Populate approval form date field"],
      ["endDate", "form field (date)", "TrishulHub \u2192 Lark", "Populate approval form date field"],
      ["reason", "form field (text)", "TrishulHub \u2192 Lark", "Free-text justification"],
      ["status", "instance.status", "2-way", "Map: PENDING\u2194pending, APPROVED\u2194approved, REJECTED\u2194rejected"],
      ["approvedById", "task.operator", "Lark \u2192 TrishulHub", "Back-sync: identify who approved in Lark"],
      ["feedback", "instance.comment", "2-way", "Approver comments sync back to TrishulHub"],
    ],
    [22, 24, 14, 40]
  ),
  emptyLine(),
  bodyTextBold("Feasibility Analysis:", ""),
  emptyLine(),
  bulletPoint("ALL approval scopes are Advanced \u26A0\uFE0F — requires tenant admin approval before any leave sync can function"),
  bulletPoint("Requires a pre-built approval definition in Lark Developer Console matching each leave type"),
  bulletPoint("Approval operations are user-bound — leave requests must be submitted as the requesting user"),
  bulletPoint("Approval callbacks use event subscriptions (Unlimited billing) for status changes \u2705"),
  emptyLine(),
  verdictBox("Verdict", "2-WAY POSSIBLE but REQUIRES SETUP", "Pre-existing approval template + admin scope approval mandatory. Each leave sync cycle consumes 8-12 API calls."),
  emptyLine(),

  heading2("4.4 Announcements: TrishulHub \u2192 Lark IM"),
  bodyTextBold("Current State: ", "TrishulHub has no dedicated Announcement model. Announcements and alerts are delivered through the Notification model (title, message, type, link, isRead). This maps naturally to Lark IM messages sent by the integration bot."),
  emptyLine(),
  bodyTextBold("Data Mapping:", ""),
  emptyLine(),
  makeTable(
    ["TrishulHub Field", "Lark IM Field", "Direction", "Notes"],
    [
      ["Notification.title", "Interactive Card header title", "TrishulHub \u2192 Lark", "Use Lark Card Message format for rich display"],
      ["Notification.message", "Card body content", "TrishulHub \u2192 Lark", "Rich text with optional action buttons"],
      ["Notification.type (INFO/WARNING/ERROR/SUCCESS)", "Card theme color", "TrishulHub \u2192 Lark", "Map type to card color scheme for visual distinction"],
      ["Notification.link", "Card action button URL", "TrishulHub \u2192 Lark", "Deep link back to TrishulHub entity"],
    ],
    [24, 24, 14, 38]
  ),
  emptyLine(),
  bulletPoint("im:message — Basic scope (developer self-approves) \u2705"),
  bulletPoint("im:message.p2p_msg:readonly — Basic scope, Unlimited \u2705"),
  bulletPoint("im:message.group_at_msg:readonly — Basic scope, Unlimited \u2705"),
  bulletPoint("Bot can send to any group chat where it has been added"),
  emptyLine(),
  verdictBox("Verdict", "1-WAY ONLY (TrishulHub \u2192 Lark) — BEST FREE-TIER FIT", "Low quota cost (~1-2 calls per message), no admin approval needed, immediate value. This is the recommended starting point for Phase 1."),

  heading2("4.5 Comments / Activity: TrishulHub \u2192 Lark IM Threads"),
  bodyTextBold("Current State: ", "TrishulHub has no dedicated Comment model for tasks or projects. Comments exist primarily as TicketMessage entries within the Support Tickets module. General activity tracking lives in the AuditLog model."),
  emptyLine(),
  bodyTextBold("Data Mapping:", ""),
  emptyLine(),
  makeTable(
    ["TrishulHub Source", "Lark Target", "Direction", "Notes"],
    [
      ["TicketMessage.content", "IM thread reply (in existing message thread)", "TrishulHub \u2192 Lark", "Reply to the ticket notification message thread"],
      ["AuditLog entries", "IM group notification", "TrishulHub \u2192 Lark", "Periodic activity digests rather than individual pushes"],
      ["Task comment (future model)", "Task comment API", "2-way (limited)", "Task comment API requires Advanced scope"],
    ],
    [24, 24, 14, 38]
  ),
  emptyLine(),
  bulletPoint("IM threads (replying to existing messages): Basic scope \u2705"),
  bulletPoint("Task/Doc comment APIs: Advanced scope \u26A0\uFE0F (not recommended for free tier)"),
  emptyLine(),
  verdictBox("Verdict", "1-WAY for IM-level threads", "TrishulHub ticket comments and audit events can be pushed to Lark IM threads at low quota cost. Full 2-way task comment sync requires Advanced scopes and is not recommended on free tier."),
];

// ═══════════════════════════════════════════════════
// SECTION 5: TECHNICAL ARCHITECTURE
// ═══════════════════════════════════════════════════

const section5 = [
  heading1("5. Technical Architecture"),

  heading2("5.1 Architecture Overview"),
  bodyText("The integration architecture follows a dual-channel pattern: outbound synchronization (TrishulHub pushes changes to Lark via REST API calls) and inbound synchronization (Lark pushes events to a webhook endpoint hosted on Vercel). This bidirectional flow ensures that changes made on either platform are propagated to the other."),
  emptyLine(),

  heading3("System Flow Diagram"),
  bodyText("The following diagram illustrates the core data flow between TrishulHub and Lark:"),
  emptyLine(),

  // Text-based architecture diagram as a table
  makeTable(
    ["Layer", "Component", "Direction", "Protocol"],
    [
      ["TrishulHub Platform", "Next.js API Routes (existing)", "\u2192 Outbound", "REST (internal)"],
      ["Sync Orchestrator", "src/lib/lark-sync.ts (new)", "\u2192 Outbound", "Calls lark-client.ts"],
      ["Lark API Client", "src/lib/lark-client.ts (new)", "\u2194 Bidirectional", "HTTPS REST to Lark API"],
      ["Lark Platform", "Lark API Gateway", "\u2194 Bidirectional", "REST + Event Subscription"],
      ["Event Receiver", "/api/lark/webhook (new)", "\u2190 Inbound", "HTTPS POST (webhook)"],
      ["Sync Processor", "Webhook handler logic", "\u2190 Inbound", "Updates TrishulHub DB via Prisma"],
      ["Database", "SQLite/Turso + SyncLog + UserMapping", "\u2194 Bidirectional", "Prisma ORM"],
    ],
    [22, 30, 16, 32]
  ),
  emptyLine(),

  heading3("Sequence: Task Creation Flow"),
  bodyText("1. User creates a task in TrishulHub UI \u2192 2. POST /api/tasks handler creates Task in TrishulHub DB \u2192 3. lark-sync.ts detects new task (via model hook or route interceptor) \u2192 4. lark-client.ts calls Lark Task API to create corresponding task \u2192 5. Lark returns task_id \u2192 6. SyncLog entry created tracking the mapping \u2192 7. User modifies task in Lark \u2192 8. Lark fires task.task.changed event \u2192 9. /api/lark/webhook receives event \u2192 10. Webhook handler updates TrishulHub Task via Prisma \u2192 11. SyncLog entry created for inbound sync"),
  emptyLine(),

  heading2("5.2 Outbound: TrishulHub \u2192 Lark (Push)"),
  bodyText("Outbound synchronization is triggered by write operations on TrishulHub's existing API routes. When a task is created, updated, or deleted in TrishulHub, the sync orchestrator intercepts the operation and pushes the change to Lark."),
  emptyLine(),

  heading3("Proposed New Files"),
  bulletPoint("src/lib/lark-client.ts — Low-level Lark API wrapper. Handles HTTP requests, token management (tenant_access_token + user_access_token caching), rate limiting, and error handling. Encapsulates all Lark API endpoints (Task, Calendar, Approval, IM)."),
  bulletPoint("src/lib/lark-sync.ts — High-level sync orchestrator. Provides functions like syncTaskToLark(), syncMeetingToLark(), sendNotificationToLark(). Called from existing API route handlers after successful database operations. Implements retry logic, quota checking, and SyncLog recording."),
  bulletPoint("src/lib/lark-webhook-validator.ts — Webhook signature validation utility. Validates incoming Lark webhook events using the configured verification token and encryption key."),
  emptyLine(),

  heading3("Integration Points in Existing Routes"),
  makeTable(
    ["TrishulHub Route", "Trigger Event", "Sync Action", "Lark API Called"],
    [
      ["POST /api/tasks", "New task created", "Create Lark task with mapped fields", "POST /open-apis/task/v2/tasks"],
      ["PUT /api/tasks/[id]", "Task updated", "Update Lark task fields", "PATCH /open-apis/task/v2/tasks/{id}"],
      ["PATCH /api/tasks/[id]/status", "Status changed", "Update Lark task status", "PATCH /open-apis/task/v2/tasks/{id}"],
      ["POST /api/meetings", "Meeting scheduled", "Create Lark calendar event", "POST /open-apis/calendar/v4/calendars/{id}/events"],
      ["PUT /api/meetings/[id]", "Meeting updated", "Update Lark calendar event", "PATCH /open-apis/calendar/v4/calendars/{id}/events/{eid}"],
      ["POST /api/leave", "Leave submitted", "Create Lark approval instance", "POST /open-apis/approval/v4/instances"],
      ["POST /api/notifications", "Notification created", "Send Lark IM message (card)", "POST /open-apis/im/v1/messages"],
    ],
    [24, 20, 28, 28]
  ),
  emptyLine(),

  heading3("Rate Limiting & Quota Management"),
  bodyText("The sync orchestrator must implement a quota-aware request layer to prevent mid-month exhaustion:"),
  bulletPoint("Maintain a daily counter in LarkConfig.quotaUsed, persisted to database"),
  bulletPoint("Before each API call, check remaining daily budget: if quotaUsed >= 300 (90% of daily 333), enter conservation mode (only high-priority syncs allowed)"),
  bulletPoint("Implement exponential backoff retry for rate-limited responses (429 status codes)"),
  bulletPoint("Batch non-urgent operations (e.g., bulk status syncs) into off-peak windows"),
  bulletPoint("Queue failed syncs for retry with a configurable delay (default: 5 minutes, max: 1 hour)"),
  emptyLine(),

  heading2("5.3 Inbound: Lark \u2192 TrishulHub (Webhook)"),
  bodyText("Inbound synchronization relies on Lark's event subscription system. When changes occur in Lark (a task is modified, a calendar event is updated, an approval status changes), Lark sends a webhook POST request to TrishulHub's dedicated endpoint."),
  emptyLine(),

  heading3("Webhook Endpoint: /api/lark/webhook"),
  bodyText("This new Vercel API endpoint serves as the single entry point for all Lark events. It must handle multiple event types and route them to appropriate processors."),
  emptyLine(),

  makeTable(
    ["Event Type", "Lark Event Key", "TrishulHub Action", "Processing"],
    [
      ["Task Changed", "task.task.changed", "Update TrishulHub Task model", "Map Lark task fields back to TrishulHub schema"],
      ["Calendar Event Changed", "calendar.calendar.changed", "Update TrishulHub Meeting model", "Parse RFC3339 timestamps, sync attendees"],
      ["Approval Instance Changed", "approval.instance.changed", "Update TrishulHub Leave/Approval model", "Map approval status, extract operator identity"],
      ["IM Message Received", "im.message.receive_v1", "Process bot commands / replies", "Parse message content, trigger actions"],
      ["IM Message Read", "im.message.message_read_v1", "Update notification read status", "Mark corresponding TrishulHub notification as read"],
    ],
    [18, 22, 28, 32]
  ),
  emptyLine(),

  heading3("Event Verification & Security"),
  bulletPoint("Validate webhook signature using Lark's encryption key (AES-256-CBC decryption)"),
  bulletPoint("Verify the challenge token during initial event subscription setup"),
  bulletPoint("Reject unverified events with HTTP 401 response"),
  bulletPoint("Log all received events in SyncLog for audit trail and debugging"),
  emptyLine(),

  heading3("Idempotency Handling"),
  bodyText("Lark may retry webhook deliveries. The webhook handler must be idempotent:"),
  bulletPoint("Each Lark event includes an event_id — store processed event IDs in SyncLog"),
  bulletPoint("Before processing, check if event_id has already been handled — if so, return HTTP 200 without reprocessing"),
  bulletPoint("Use database transactions to prevent partial updates on failure"),

  heading2("5.4 Data Synchronization Layer"),
  bodyText("A robust sync layer is essential for maintaining data consistency across platforms. The following components ensure reliable, conflict-free synchronization."),
  emptyLine(),

  heading3("SyncLog Model"),
  bodyText("Every synchronization operation — inbound or outbound — is recorded in the SyncLog model. This provides a complete audit trail, enables debugging of sync failures, and supports conflict resolution by establishing a timeline of changes."),
  emptyLine(),
  makeTable(
    ["Field", "Type", "Description"],
    [
      ["id", "String (UUID)", "Unique sync log entry identifier"],
      ["direction", "Enum", "OUTBOUND (TrishulHub \u2192 Lark) or INBOUND (Lark \u2192 TrishulHub)"],
      ["entityType", "Enum", "TASK, MEETING, LEAVE, APPROVAL, NOTIFICATION"],
      ["entityId", "String", "TrishulHub entity identifier (UUID)"],
      ["larkEntityId", "String", "Lark entity identifier (task_id, event_id, instance_id)"],
      ["operation", "Enum", "CREATE, UPDATE, DELETE, STATUS_CHANGE"],
      ["status", "Enum", "SUCCESS, FAILED, RETRYING, SKIPPED"],
      ["requestData", "Json", "Request payload sent to / received from Lark API"],
      ["responseData", "Json", "Response data from Lark API"],
      ["error", "String (optional)", "Error message if status is FAILED"],
      ["createdAt", "DateTime", "Timestamp of sync attempt"],
    ],
    [18, 16, 66]
  ),
  emptyLine(),

  heading3("Conflict Resolution Strategy"),
  bulletPoint("Default: Last-Write-Wins (LWW) — the most recent modification timestamp wins, regardless of source platform"),
  bulletPoint("Exception: Approval/Lee entities — TrishulHub-Wins — the system of record for organizational decisions remains TrishulHub. Lark approval status changes are synced to TrishulHub but cannot override a TrishulHub rejection."),
  bulletPoint("Conflict detection: Compare updatedAt timestamps when both platforms have modified the same entity since last sync"),
  bulletPoint("Manual resolution flag: When conflicts cannot be auto-resolved, flag the entity for admin review"),
  emptyLine(),

  heading3("Retry Queue"),
  bodyText("Failed sync operations are queued for automatic retry with exponential backoff:"),
  bulletPoint("Initial delay: 30 seconds"),
  bulletPoint("Backoff multiplier: 2x (30s \u2192 1m \u2192 2m \u2192 4m \u2192 8m)"),
  bulletPoint("Maximum retry attempts: 5"),
  bulletPoint("Maximum delay cap: 1 hour"),
  bulletPoint("After max retries: Mark as PERMANENTLY_FAILED and alert administrator"),

  heading2("5.5 Proposed Database Additions"),
  bodyText("Three new Prisma models are required to support the integration. These models manage Lark API configuration, user identity mapping, and synchronization tracking."),
  emptyLine(),

  heading3("LarkSyncLog"),
  makeTable(
    ["Field", "Type", "Constraints", "Description"],
    [
      ["id", "String (UUID)", "PK, auto-generated", "Unique sync log identifier"],
      ["direction", "Enum (OUTBOUND, INBOUND)", "Required", "Sync direction"],
      ["entityType", "Enum (TASK, MEETING, LEAVE, APPROVAL, NOTIFICATION)", "Required", "Entity type being synced"],
      ["entityId", "String", "Required", "TrishulHub entity UUID"],
      ["larkEntityId", "String", "Optional", "Lark-side entity identifier"],
      ["operation", "Enum (CREATE, UPDATE, DELETE, STATUS_CHANGE)", "Required", "Operation performed"],
      ["status", "Enum (SUCCESS, FAILED, RETRYING, SKIPPED)", "Required", "Sync result status"],
      ["requestData", "Json", "Optional", "API request payload"],
      ["responseData", "Json", "Optional", "API response data"],
      ["error", "String", "Optional", "Error details if failed"],
      ["createdAt", "DateTime", "Default: now()", "Sync attempt timestamp"],
    ],
    [16, 30, 16, 38]
  ),
  emptyLine(),

  heading3("LarkUserMapping"),
  makeTable(
    ["Field", "Type", "Constraints", "Description"],
    [
      ["id", "String (UUID)", "PK, auto-generated", "Unique mapping identifier"],
      ["trishulhubUserId", "String", "FK \u2192 User, Unique", "TrishulHub User UUID"],
      ["larkOpenId", "String", "Unique", "Lark user open_id (app-scoped)"],
      ["larkUnionId", "String", "Optional, Unique", "Lark user union_id (tenant-scoped)"],
      ["email", "String", "Optional", "Email used for matching during initial setup"],
      ["isActive", "Boolean", "Default: true", "Whether this mapping is active"],
      ["createdAt", "DateTime", "Default: now()", "Mapping creation timestamp"],
    ],
    [20, 16, 16, 48]
  ),
  emptyLine(),

  heading3("LarkConfig"),
  makeTable(
    ["Field", "Type", "Constraints", "Description"],
    [
      ["id", "String (UUID)", "PK, singleton", "Configuration record (single row)"],
      ["appId", "String", "Unique", "Lark Developer App ID"],
      ["appSecret", "String", "Required (encrypted)", "Lark Developer App Secret (AES-256 encrypted at rest)"],
      ["webhookUrl", "String", "Required", "TrishulHub webhook endpoint URL"],
      ["webhookVerificationToken", "String", "Required", "Token for webhook signature validation"],
      ["accessToken", "String", "Optional", "Cached tenant_access_token"],
      ["tokenExpiresAt", "DateTime", "Optional", "Token expiration timestamp"],
      ["quotaUsed", "Int", "Default: 0", "API calls used in current month"],
      ["quotaResetDate", "DateTime", "Required", "Date when monthly quota resets"],
      ["createdAt", "DateTime", "Default: now()", "Configuration creation timestamp"],
    ],
    [22, 16, 18, 44]
  ),
];

// ═══════════════════════════════════════════════════
// SECTION 6: LARK CUSTOM APP PERMISSIONS
// ═══════════════════════════════════════════════════

const section6 = [
  heading1("6. Lark Custom App Permissions (Scopes)"),
  bodyText("This section enumerates every Lark API scope required for the integration, categorized by approval level and billing impact. The tenant administrator must review and approve all Advanced scopes before the integration can access the corresponding APIs."),

  heading2("6.1 Required Scopes Table"),
  emptyLine(),
  makeTable(
    ["Scope Name", "Level", "Category", "Purpose in Integration"],
    [
      ["task:task:read", "Basic", "Shared Quota", "Read task details from Lark for inbound sync"],
      ["task:task:write", "Advanced", "Shared Quota", "Create/update tasks in Lark for outbound sync"],
      ["task:tasklist:read", "Basic", "Shared Quota", "Read task lists for organization context"],
      ["task:task.event_update_tenant:readonly", "Advanced", "Unlimited", "Receive task change webhook events (CRITICAL — free)"],
      ["calendar:calendar:readonly", "Basic", "Shared Quota", "Read calendar events from Lark"],
      ["calendar:calendar.event:create", "Advanced", "Shared Quota", "Create calendar events in Lark"],
      ["calendar:calendar.event:update", "Advanced", "Shared Quota", "Update calendar events in Lark"],
      ["calendar:calendar.event:delete", "Advanced", "Shared Quota", "Delete calendar events in Lark"],
      ["calendar:calendar:subscribe", "Advanced", "Shared Quota", "Subscribe to calendar event changes"],
      ["approval:approval", "Advanced", "Shared Quota", "Full approval access — read definitions, manage templates"],
      ["approval:instance", "Advanced", "Shared Quota", "Create and manage approval instances"],
      ["approval:task", "Advanced", "Shared Quota", "Manage approval tasks (approve/reject)"],
      ["im:message", "Basic", "Shared Quota", "Send and receive IM messages"],
      ["im:message.p2p_msg:readonly", "Basic", "Unlimited", "Receive direct message webhook events (free)"],
      ["im:message.group_at_msg:readonly", "Basic", "Unlimited", "Receive group mention webhook events (free)"],
      ["contact:contact.base:readonly", "Basic", "Unlimited", "Read user basic info for identity mapping (free)"],
    ],
    [28, 10, 14, 48]
  ),
  emptyLine(),

  heading2("6.2 Admin Approval Actions Required"),
  bodyText("The following scopes require the Lark tenant administrator to explicitly approve them in the Lark Developer Console. Until approved, any API call using these scopes will return a permission denied error."),
  emptyLine(),
  bulletPoint("task:task:write — Required for creating/updating tasks in Lark from TrishulHub"),
  bulletPoint("task:task.event_update_tenant:readonly — Required for receiving task change events (webhook)"),
  bulletPoint("calendar:calendar.event:create — Required for creating calendar events"),
  bulletPoint("calendar:calendar.event:update — Required for updating calendar events"),
  bulletPoint("calendar:calendar.event:delete — Required for deleting calendar events"),
  bulletPoint("calendar:calendar:subscribe — Required for subscribing to calendar changes"),
  bulletPoint("approval:approval — Required for full approval system access"),
  bulletPoint("approval:instance — Required for creating approval instances"),
  bulletPoint("approval:task — Required for managing approval tasks"),
  emptyLine(),
  noteBox("ACTION REQUIRED: Before beginning Phase 2 implementation, the tenant administrator must approve 9 Advanced scopes. This typically takes 1-5 business days depending on organizational policies. Submit scope approval requests immediately in the Lark Developer Console."),
  emptyLine(),
  makeTable(
    ["Scope Category", "Count", "Approval Required", "Estimated Approval Time"],
    [
      ["Basic (self-approve)", "5 scopes", "No — developer can enable immediately", "Immediate"],
      ["Advanced (admin-approve)", "9 scopes", "Yes — tenant admin must approve", "1-5 business days"],
      ["Unlimited billing", "4 scopes", "Mixed (2 Basic, 2 Advanced)", "See approval level"],
      ["Shared Quota billing", "10 scopes", "Mixed (3 Basic, 7 Advanced)", "See approval level"],
    ],
    [24, 14, 36, 26]
  ),
];

// ═══════════════════════════════════════════════════
// SECTION 7: THE "TRUTH" REPORT
// ═══════════════════════════════════════════════════

const section7 = [
  heading1('7. The "Truth" Report — Realistic Feasibility'),
  bodyText("This section provides an unfiltered assessment of what the TrishulHub-Lark integration can and cannot achieve on Lark's free tier. Each capability is rated for feasibility, and a detailed budget analysis quantifies the real-world operational constraints."),

  heading2("7.1 What Will Work (2-Way Sync) \u2B50\u2B50\u2B50\u2B50\u2B50"),
  bodyTextBold("Tasks — Full 2-way synchronization: ", "Task CRUD operations are well-supported by Lark's Task API. Event subscriptions (Unlimited billing) enable real-time inbound sync without consuming quota. Outbound sync requires Advanced scope but is manageable within the daily budget. The task domain offers the highest integration value-to-cost ratio."),
  emptyLine(),
  bodyTextBold("Messaging / Announcements — Robust send + receive: ", "IM message operations are primarily Basic scope with several Unlimited-billing event types. Bot-driven notifications from TrishulHub to Lark groups, interactive card messages, and thread-based conversations are all fully supported. This is the lowest-risk, highest-value integration path."),
  emptyLine(),

  heading2("7.2 What Will Work (Limited 2-Way) \u2B50\u2B50\u2B50"),
  bodyTextBold("Meetings — Sync possible but heavily constrained: ", "Calendar sync requires ALL write scopes to be Advanced, and operations are user-bound (need user_access_token). Each meeting sync cycle consumes 6-10 API calls. The complexity is further increased by the need for per-user OAuth consent flows for calendar access. Calendar sync should be limited to high-priority meetings only."),
  emptyLine(),
  bodyTextBold("Leave / Approvals — Sync possible but requires extensive setup: ", "ALL approval scopes are Advanced, requiring tenant admin approval. Additionally, the integration requires pre-built approval definition templates in Lark, configured to match TrishulHub's leave types. Each leave sync cycle consumes 8-12 API calls. Setup is complex but the recurring operational cost is manageable if leave volumes are low."),
  emptyLine(),

  heading2("7.3 What Will Be 1-Way Only (TrishulHub \u2192 Lark)"),
  bulletPoint("Announcements: TrishulHub Notifications \u2192 Lark IM. No reverse trigger mechanism exists in Lark to create TrishulHub notifications from Lark messages."),
  bulletPoint("Activity Feed / Audit Trail: TrishulHub AuditLog entries can be pushed as periodic summaries to Lark groups, but there is no mechanism for Lark-side activity to generate TrishulHub audit entries."),
  bulletPoint("CRM Data: Leads, Deals, and Contacts in TrishulHub can be referenced in Lark messages but have no native Lark equivalent for 2-way sync."),
  bulletPoint("Finance Data: Invoices, expenses, and subscriptions are TrishulHub-only domains with no Lark counterpart."),
  emptyLine(),

  heading2("7.4 What Will NOT Work on Free Tier"),
  bulletPoint("High-frequency real-time sync (>65 operations/day): The 10K/month quota translates to ~333 calls/day, but accounting for overhead (token refresh, health checks, retry attempts), the practical limit is 40-65 meaningful sync operations per day."),
  bulletPoint("Full calendar conflict detection: Detecting scheduling conflicts requires expensive read-before-write operations, consuming 3-4 additional API calls per meeting creation."),
  bulletPoint("Bulk operations: Batch task imports, mass calendar event creation, or bulk notification broadcasts will exhaust the quota rapidly. These operations should be throttled or scheduled during off-peak periods."),
  bulletPoint("Sub-minute polling: Any architecture based on periodic API polling (e.g., checking for changes every 30 seconds) is financially unsustainable on the free tier. All sync must be event-driven."),
  emptyLine(),

  heading2("7.5 The 10K Call Budget Reality Check"),
  bodyText("The following analysis provides a realistic daily API call budget for a 5-person team, assuming event-driven (webhook-based) architecture with minimal polling."),
  emptyLine(),
  bodyTextBold("Per-Operation API Call Cost:", ""),
  emptyLine(),
  makeTable(
    ["Sync Operation", "API Calls Per Cycle", "Daily Frequency (est.)", "Daily Call Cost", "Monthly Cost"],
    [
      ["Task create/update (outbound)", "3 calls", "15 ops", "45 calls", "1,350 calls"],
      ["Task change event (inbound, Unlimited)", "0 calls (event only)", "20 events", "0 calls", "0 calls"],
      ["Meeting sync (outbound)", "8 calls", "3 meetings", "24 calls", "720 calls"],
      ["Meeting event (inbound, if subscribed)", "0 calls (event only)", "3 events", "0 calls", "0 calls"],
      ["Leave submission (outbound)", "10 calls", "1 leave/week = 0.14/day", "1.4 calls", "42 calls"],
      ["Leave approval event (inbound)", "0 calls (event only)", "0.14/day", "0 calls", "0 calls"],
      ["IM message send (announcement)", "2 calls", "5 messages", "10 calls", "300 calls"],
      ["IM event receive (Unlimited)", "0 calls (event only)", "10 events", "0 calls", "0 calls"],
      ["Token refresh (cached)", "1 call/day", "1", "1 call", "30 calls"],
      ["User lookup (contact, Unlimited)", "0 calls (Unlimited)", "5 lookups", "0 calls", "0 calls"],
    ],
    [24, 16, 18, 16, 16]
  ),
  emptyLine(),
  bodyTextBold("Daily Total: ~81.4 calls | Monthly Total: ~2,442 calls", ""),
  emptyLine(),
  bodyText("This leaves approximately 7,558 calls per month as buffer for: (a) retry attempts on failed syncs, (b) occasional polling for missed events, (c) ad-hoc manual sync operations, and (d) growth in team size or activity volume. At this consumption rate, the 10K quota provides comfortable headroom for a 5-person team."),
  emptyLine(),
  bodyTextBold("Budget Allocation Recommendation:", ""),
  bulletPoint("Priority 1 (50% budget): Task sync — the highest-value integration domain"),
  bulletPoint("Priority 2 (25% budget): Messaging / Announcements — low cost, high visibility"),
  bulletPoint("Priority 3 (20% budget): Meeting sync — limited to scheduled meetings only"),
  bulletPoint("Priority 4 (5% budget): Leave / Approval sync — low frequency, acceptable delay"),
  emptyLine(),

  heading2("7.6 Critical Risks"),
  emptyLine(),
  makeTable(
    ["Risk", "Probability", "Impact", "Mitigation"],
    [
      ["Lark API monthly quota exhaustion mid-month", "Medium", "High — sync stops completely", "Implement daily quota monitoring with conservation mode at 90% usage. Alert admin at 70% threshold."],
      ["Scope approval delays (admin must approve 9 Advanced scopes)", "High", "Medium — blocks Phase 2+3", "Submit scope requests immediately. Begin Phase 1 (Basic scopes only) while waiting for approval."],
      ["User mapping complexity (Lark open_id vs email)", "Medium", "Medium — sync failures for unmapped users", "Implement email-based auto-matching on first login. Manual mapping fallback for edge cases."],
      ["Rate limiting during peak hours", "Low", "Medium — temporary sync delays", "Implement exponential backoff. Schedule non-urgent syncs during off-peak hours."],
      ["Lark API deprecation or breaking changes", "Low", "High — integration breaks", "Pin API versions in requests. Monitor Lark developer changelog. Implement feature flag for Lark sync."],
      ["Webhook delivery failures (Lark retries may overwhelm)", "Low", "Medium — duplicate processing or missed events", "Idempotent webhook handler with event_id deduplication. Monitor SyncLog for gaps."],
    ],
    [28, 12, 16, 44]
  ),
];

// ═══════════════════════════════════════════════════
// SECTION 8: IMPLEMENTATION ROADMAP
// ═══════════════════════════════════════════════════

const section8 = [
  heading1("8. Implementation Roadmap"),
  bodyText("The integration is structured as a 4-week phased rollout, with each phase building on the previous one. This approach ensures that foundation infrastructure is solid before adding complex sync logic, and that each phase delivers standalone value."),
  emptyLine(),

  heading2("Phase 1: Foundation (Week 1)"),
  bodyTextBold("Objective: ", "Establish core infrastructure, Lark developer app configuration, and basic connectivity."),
  emptyLine(),
  makeTable(
    ["Task", "Owner", "Dependencies", "Deliverable"],
    [
      ["Create Lark Developer App in Lark Developer Console", "Admin", "Lark admin access", "AppId + AppSecret, webhook URL configured"],
      ["Request all 16 API scopes (5 Basic immediate + 9 Advanced pending)", "Admin", "Developer app created", "Scope approval requests submitted"],
      ["Define LarkConfig, LarkUserMapping, LarkSyncLog Prisma models", "Backend", "None", "Schema pushed to database"],
      ["Implement lark-client.ts with token management", "Backend", "LarkConfig model", "Lark API client with tenant_access_token caching"],
      ["Implement /api/lark/webhook endpoint with event verification", "Backend", "lark-client.ts", "Webhook endpoint returning challenge response"],
      ["Implement OAuth flow for user_access_token", "Backend", "lark-client.ts", "OAuth redirect + callback endpoints"],
      ["Initial user mapping: email-based auto-match", "Backend + Admin", "LarkUserMapping model", "Seed user mapping table for team"],
    ],
    [30, 14, 20, 36]
  ),
  emptyLine(),

  heading2("Phase 2: Core Sync — Tasks (Week 2)"),
  bodyTextBold("Objective: ", "Deliver full 2-way task synchronization — the highest-value integration domain."),
  emptyLine(),
  makeTable(
    ["Task", "Owner", "Dependencies", "Deliverable"],
    [
      ["Implement syncTaskToLark() in lark-sync.ts", "Backend", "lark-client.ts, LarkUserMapping", "Outbound task sync: create + update"],
      ["Integrate task sync into POST/PUT /api/tasks handlers", "Backend", "syncTaskToLark()", "Automatic Lark sync on task CRUD"],
      ["Subscribe to task.task.changed events in Lark", "Admin", "Advanced scope approved", "Event subscription active"],
      ["Implement task inbound sync in /api/lark/webhook", "Backend", "Webhook endpoint, Prisma", "Lark task changes update TrishulHub"],
      ["Implement SyncLog recording for all task operations", "Backend", "LarkSyncLog model", "Complete audit trail for task sync"],
      ["Test 2-way sync with real data", "QA", "All task sync code", "Verified bidirectional sync"],
    ],
    [30, 14, 20, 36]
  ),
  emptyLine(),

  heading2("Phase 3: Meetings & Approvals (Week 3)"),
  bodyTextBold("Objective: ", "Extend sync to meetings (calendar) and leave/approval workflows."),
  emptyLine(),
  makeTable(
    ["Task", "Owner", "Dependencies", "Deliverable"],
    [
      ["Create Lark approval definitions for each leave type", "Admin", "Advanced approval scopes approved", "Approval templates in Lark Console"],
      ["Implement syncMeetingToLark() with user_access_token flow", "Backend", "OAuth flow, lark-client.ts", "Outbound meeting sync"],
      ["Implement syncLeaveToLark() (approval instance creation)", "Backend", "lark-client.ts, approval templates", "Outbound leave sync"],
      ["Subscribe to calendar and approval events", "Admin", "Advanced scopes approved", "Event subscriptions active"],
      ["Implement inbound calendar event sync", "Backend", "Webhook endpoint", "Lark meeting changes update TrishulHub"],
      ["Implement inbound approval status sync", "Backend", "Webhook endpoint", "Lark approval changes update TrishulHub Leave"],
      ["RSVP back-sync (Lark attendee response \u2192 TrishulHub)", "Backend", "Calendar event handler", "Attendee RSVP sync"],
    ],
    [30, 14, 20, 36]
  ),
  emptyLine(),

  heading2("Phase 4: Messaging & Polish (Week 4)"),
  bodyTextBold("Objective: ", "Deliver IM-based announcements, comment threading, monitoring dashboard, and production hardening."),
  emptyLine(),
  makeTable(
    ["Task", "Owner", "Dependencies", "Deliverable"],
    [
      ["Implement sendNotificationToLark() with interactive card format", "Backend", "lark-client.ts", "Rich notification cards in Lark"],
      ["Integrate notification sync into POST /api/notifications", "Backend", "sendNotificationToLark()", "Auto-push notifications to Lark"],
      ["Implement TicketMessage \u2192 Lark thread reply sync", "Backend", "IM message API", "Ticket comments appear in Lark threads"],
      ["Build sync status monitoring dashboard in TrishulHub", "Frontend + Backend", "SyncLog model", "Real-time sync health visibility"],
      ["Implement retry logic with exponential backoff", "Backend", "SyncLog, lark-sync.ts", "Automatic retry for failed syncs"],
      ["Implement quota monitoring alerts", "Backend", "LarkConfig.quotaUsed", "Email/notification alerts at 70% and 90%"],
      ["End-to-end testing across all sync domains", "QA", "All components", "Verified production readiness"],
      ["Documentation: user guide + admin setup guide", "Tech Writer", "All features complete", "Internal documentation"],
    ],
    [30, 14, 20, 36]
  ),
];

// ═══════════════════════════════════════════════════
// SECTION 9: RECOMMENDATIONS & NEXT STEPS
// ═══════════════════════════════════════════════════

const section9 = [
  heading1("9. Recommendations & Next Steps"),
  bodyText("Based on the comprehensive analysis presented in this document, the following recommendations prioritize rapid value delivery while respecting the free-tier constraints."),

  heading2("9.1 Immediate Actions (This Week)"),
  bulletPoint("Create the Lark Developer App in the Lark Developer Console (developer account required)"),
  bulletPoint("Submit all 16 scope approval requests immediately — the 9 Advanced scopes may take up to 5 business days for admin approval"),
  bulletPoint("Begin Phase 1 implementation using only Basic scopes — this work can proceed independently of admin approvals"),
  bulletPoint("Designate a Lark tenant administrator as the integration sponsor to expedite scope approvals"),
  emptyLine(),

  heading2("9.2 Build Strategy"),
  bulletPoint("Start with task sync (Phase 2) — it offers the best free-tier value proposition with full 2-way sync capability and Unlimited-billing event subscriptions"),
  bulletPoint("Implement quota monitoring from day one — the 10K limit is the primary constraint; visibility into consumption prevents mid-month surprises"),
  bulletPoint("Use event-driven architecture exclusively — polling-based approaches are unsustainable on the free tier"),
  bulletPoint("Cache aggressively — tenant_access_token, user_access_token, and Lark user profiles should be cached to minimize redundant API calls"),
  bulletPoint("Design for graceful degradation — when quota is low, the system should continue functioning with reduced sync frequency rather than failing abruptly"),
  emptyLine(),

  heading2("9.3 Medium-Term Considerations"),
  bulletPoint("Evaluate Lark Pro plan if the team grows beyond 8-10 active users or if sync frequency requirements exceed 65 operations/day"),
  bulletPoint("Monitor Lark API changelog for pricing changes, new Unlimited-billing APIs, or deprecation notices"),
  bulletPoint("Consider implementing a priority queue system that categorizes sync operations by business criticality"),
  bulletPoint("Plan for multi-region deployment if TrishulHub expands to serve teams in different geographic regions"),
  emptyLine(),

  heading2("9.4 Success Metrics"),
  makeTable(
    ["Metric", "Target", "Measurement"],
    [
      ["Task 2-way sync latency", "< 30 seconds (event-driven)", "Timestamp delta in SyncLog"],
      ["Sync success rate", "> 98%", "SyncLog status ratio"],
      ["Monthly API quota utilization", "< 40% of 10K (target: < 4K calls)", "LarkConfig.quotaUsed at month end"],
      ["Webhook delivery success rate", "> 99%", "Lark event logs + SyncLog"],
      ["User satisfaction (team survey)", "> 4.0/5.0", "Post-launch survey"],
      ["Admin approval turnaround", "< 3 business days", "Scope request timestamp to approval"],
    ],
    [30, 34, 36]
  ),
  emptyLine(),

  heading2("9.5 Conclusion"),
  bodyText("The TrishulHub-Lark integration is technically feasible on Lark's free tier, with task synchronization and IM messaging representing the strongest value propositions. The 10,000-call monthly constraint, while significant, is manageable for a small-to-medium team (5-10 users) with a well-architected event-driven approach and careful quota management."),
  emptyLine(),
  bodyText("The phased 4-week roadmap ensures that each phase delivers standalone value: Phase 1 establishes the foundation, Phase 2 delivers the highest-value 2-way sync (tasks), Phase 3 extends coverage to meetings and approvals, and Phase 4 polishes the experience with messaging and monitoring."),
  emptyLine(),
  bodyText("The primary risk factors — scope approval delays and quota management — are mitigated through parallel execution (starting Basic-scope work immediately while awaiting Advanced approvals) and proactive monitoring (daily quota tracking with conservation mode thresholds). With disciplined execution of this roadmap, the integration will significantly enhance team productivity by bridging TrishulHub's operational depth with Lark's collaborative experience."),
  emptyLine(),
  noteBox("This document should be reviewed and updated after each phase completion. The integration architecture is designed to be modular — new sync domains can be added incrementally as the team's needs evolve."),
];

// ═══════════════════════════════════════════════════
// ASSEMBLE DOCUMENT
// ═══════════════════════════════════════════════════

const doc = new Document({
  features: { updateFields: true },
  creator: "TrishulHub Systems",
  title: "TrishulHub x Lark Integration — Technical Specification & Architectural Blueprint",
  description: "Comprehensive technical specification for integrating TrishulHub enterprise management platform with Lark workplace collaboration suite.",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 24, color: TECH.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: "Calibri", size: 28, bold: true, color: TECH.primary },
        paragraph: { spacing: { before: 480, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TECH.accent, space: 8 } } },
      },
      heading2: {
        run: { font: "Calibri", size: 24, bold: true, color: TECH.primary },
        paragraph: { spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TBL.innerLine, space: 6 } } },
      },
      heading3: {
        run: { font: "Calibri", size: 22, bold: true, color: TECH.accent },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    },
  },
  sections: [
    // Cover page section
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: coverChildren,
    },
    // TOC section
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: tocSection,
    },
    // Body sections
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
        type: SectionType.CONTINUOUS,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: TBL.innerLine, space: 4 } },
              children: [
                new TextRun({ text: "TrishulHub \u00D7 Lark Integration Blueprint  |  v1.0  |  Confidential", font: "Calibri", size: 16, color: TECH.secondary, italics: true }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: TBL.innerLine, space: 4 } },
              children: [
                new TextRun({ text: "TrishulHub Systems  |  Page ", font: "Calibri", size: 16, color: TECH.secondary }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: TECH.secondary }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...section1,
        ...section2,
        ...section3,
        ...section4,
        ...section5,
        ...section6,
        ...section7,
        ...section8,
        ...section9,
      ],
    },
  ],
});

// ═══════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════

const OUTPUT = "/home/z/my-project/download/TrishulHub-Lark-Integration-Blueprint.docx";

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log("Document generated successfully:", OUTPUT);
  console.log("Size:", (buffer.length / 1024).toFixed(1), "KB");
}).catch((err) => {
  console.error("Error generating document:", err);
  process.exit(1);
});
