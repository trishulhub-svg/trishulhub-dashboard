// Agent Tool Definitions for Z.ai Function Calling
// Multi-agent tool system: each agent type gets role-specific tools
// All agents share web_search and plan_task, plus unique tools per role

import { execFile, ExecFileOptions } from "child_process"
import fs from "fs"
import path from "path"

/**
 * Safe alternative to shell execution that uses execFile to avoid shell injection.
 * Passes args as an array so they are never interpreted by a shell.
 */
function execSafe(cmd: string, args: string[], options: ExecFileOptions): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

// ━━ Workspace Root ━━
// On Vercel (serverless), process.cwd() is /var/task/ which is READ-ONLY.
// We must use /tmp/agent-workspace/ for file write operations.
// On local dev, process.cwd() is writable so we use it directly.
//
// CRITICAL FIX: These are now lazy-initialized (not at module import time).
// Previously, fs.writeFileSync at import time could crash the entire module
// on Vercel's read-only filesystem, causing ALL API routes that import
// this module to fail with a 500 error.
const PROJECT_ROOT = process.cwd()

let _isReadOnlyFs: boolean | null = null
let _workspaceRoot: string | null = null

function isReadOnlyFS(): boolean {
  if (_isReadOnlyFs !== null) return _isReadOnlyFs
  try {
    const testFile = path.join(PROJECT_ROOT, '.write-test-' + Date.now())
    fs.writeFileSync(testFile, 'test', 'utf-8')
    fs.unlinkSync(testFile)
    _isReadOnlyFs = false
  } catch {
    _isReadOnlyFs = true // Filesystem is read-only (e.g., Vercel /var/task/)
  }
  return _isReadOnlyFs
}

function getWorkspaceRoot(): string {
  if (_workspaceRoot !== null) return _workspaceRoot
  if (isReadOnlyFS()) {
    const tmpDir = '/tmp/agent-workspace'
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    } catch {}
    _workspaceRoot = tmpDir
  } else {
    _workspaceRoot = PROJECT_ROOT
  }
  return _workspaceRoot
}

/**
 * Resolve a file path to the appropriate workspace root.
 * Uses workspace root (writable) for write operations,
 * falls back to PROJECT_ROOT for read-only operations.
 */
function resolveWorkspacePath(filePath: string, forWrite: boolean = false): string {
  // SECURITY: Reject path traversal attempts early
  if (filePath.includes('..')) return 'Error: Path traversal not allowed. Absolute paths and parent directory references are prohibited.'
  // For write operations, always use workspace root (writable)
  if (forWrite) {
    return path.resolve(getWorkspaceRoot(), filePath)
  }
  // For read operations, try PROJECT_ROOT first, then workspace root
  const projectPath = path.resolve(PROJECT_ROOT, filePath)
  try {
    if (fs.existsSync(projectPath)) return projectPath
  } catch {}
  const workspacePath = path.resolve(getWorkspaceRoot(), filePath)
  return workspacePath
}

function isPathWithinWorkspace(fullPath: string, forWrite: boolean = false): boolean {
  const root = forWrite ? getWorkspaceRoot() : PROJECT_ROOT
  return fullPath.startsWith(root + path.sep) || fullPath === root
}

export interface AgentTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, any>
      required: string[]
    }
  }
}

export interface ToolCallResult {
  toolCallId: string
  name: string
  result: string
  success: boolean
}

// ━━ Tool Argument Interfaces ━━

interface LineItem {
  description?: string
  quantity?: number
  unit_price?: number
}

interface PlanStep {
  step?: number
  title?: string
  description?: string
  prompt?: string
}

interface TimelinePhase {
  name?: string
  duration_days?: number
  dependencies?: string[]
}

interface EffortTask {
  name?: string
  complexity?: string
}

interface WorkloadMember {
  name?: string
  current_tasks?: number
  hours_per_week?: number
  skills?: string[]
}

interface BestFitMember {
  name?: string
  skills?: string[]
  current_load?: string
}

interface LeaveRequest {
  person?: string
  dates?: string[]
  reason?: string
}

// ━━ Shared Tools (available to all agents) ━━

const WEB_SEARCH_TOOL: AgentTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for real-time information, news, data, or research. Use this when you need current information beyond your training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific for best results.",
        },
        purpose: {
          type: "string",
          description: "Why you are searching - helps provide better context.",
        },
      },
      required: ["query"],
    },
  },
}

const PLAN_TASK_TOOL: AgentTool = {
  type: "function",
  function: {
    name: "plan_task",
    description: "Create a detailed execution plan for a complex task. Break the task into clear, ordered steps with descriptions and executable prompts. Use this before starting work to think through the approach. Each step should include a 'prompt' field containing the specific instruction that can be executed when the user activates that step.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task to plan.",
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "number", description: "Step number" },
              title: { type: "string", description: "Short title for this step" },
              description: { type: "string", description: "What to do in this step" },
              prompt: { type: "string", description: "The exact instruction to execute when the user activates this step. Should be a self-contained, specific command like 'Read and update the file src/components/App.tsx to add dark mode toggle' or 'Run npm test to verify all tests pass'." },
            },
            required: ["step", "title", "description", "prompt"],
          },
          description: "Ordered list of steps to complete the task. Each step must include a 'prompt' field.",
        },
      },
      required: ["task", "steps"],
    },
  },
}

// ━━ DEV Agent Tools ━━
export const DEV_AGENT_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file in the project. Use this to understand existing code, check configurations, or review implementations before making changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path relative to project root." },
          purpose: { type: "string", description: "Why you are reading this file." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the project. Use this to write new code, create components, or save generated files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path relative to project root." },
          content: { type: "string", description: "The complete file content to write." },
          description: { type: "string", description: "Brief description of what this file does." },
        },
        required: ["path", "content", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Make a targeted edit to an existing file. Much safer than rewriting entire files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path relative to project root." },
          old_content: { type: "string", description: "The exact text to find and replace." },
          new_content: { type: "string", description: "The replacement text." },
          description: { type: "string", description: "What this edit does and why." },
        },
        required: ["path", "old_content", "new_content", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories in a given path. Use this to explore the project structure.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to project root." },
          pattern: { type: "string", description: "Optional glob pattern to filter files." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command in the project directory. Use for installing packages, running builds, checking types, or other CLI operations.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run." },
          purpose: { type: "string", description: "Why you are running this command." },
        },
        required: ["command", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_code",
      description: "Analyze code for bugs, security issues, performance problems, or best practice violations.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to analyze." },
          focus: {
            type: "string",
            description: "What to focus on: 'bugs', 'security', 'performance', 'best-practices', or 'all'",
            enum: ["bugs", "security", "performance", "best-practices", "all"],
          },
        },
        required: ["path", "focus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_commit_push",
      description: "Stage, commit, and push code changes to the GitHub repository. Use this after you've made code changes and verified they work. This requires human approval before pushing.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Commit message describing the changes." },
          files: { type: "array", items: { type: "string" }, description: "List of file paths to stage (relative to project root). Use ['.'] to stage all changes." },
          branch: { type: "string", description: "Branch name to push to. Defaults to current branch." },
          description: { type: "string", description: "Brief description of what changes are being pushed and why." },
        },
        required: ["message", "files", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Check git status to see what files have been modified, added, or deleted. Use this before committing to understand what changes exist.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", description: "Why you are checking git status." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_create_branch",
      description: "Create and switch to a new git branch. Use this for feature development to keep changes isolated from main.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the new branch (e.g., 'feature/login-page', 'fix/header-bug')." },
          purpose: { type: "string", description: "Why you are creating this branch." },
        },
        required: ["name", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "View the diff of changes - shows what lines were added or removed. Use this to review changes before committing.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to see diff for. Omit to see all changes." },
          purpose: { type: "string", description: "Why you are checking the diff." },
        },
        required: [],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ Client Hunter Agent Tools ━━
export const CLIENT_HUNTER_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Search the web for potential clients/businesses that match specific criteria (location, industry, size, etc). Returns business names, websites, and contact details.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Geographic area to search. E.g., 'Harrow, London', 'Manchester UK'" },
          industry: { type: "string", description: "Industry or business type. E.g., 'restaurants', 'dentists', 'retail shops'" },
          criteria: { type: "string", description: "Additional criteria. E.g., 'needs website redesign', 'no online presence', 'small business'" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_website",
      description: "Analyze a business website for issues like poor design, slow performance, missing SEO, broken links, mobile responsiveness problems, etc. Requires a URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The website URL to analyze." },
          business_name: { type: "string", description: "Name of the business for context." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_lead",
      description: "Score a potential lead from 1-100 based on: need for services, budget potential, urgency, and fit with TrishulHub offerings. Provide structured scoring.",
      parameters: {
        type: "object",
        properties: {
          business_name: { type: "string", description: "Name of the business." },
          business_type: { type: "string", description: "Type of business." },
          website_status: { type: "string", description: "Current website status. E.g., 'no website', 'outdated', 'needs redesign'" },
          location: { type: "string", description: "Business location." },
          notes: { type: "string", description: "Additional notes about the lead." },
        },
        required: ["business_name", "business_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft a personalized cold outreach or follow-up email for a potential client. Generates professional, value-focused emails tailored to the business.",
      parameters: {
        type: "object",
        properties: {
          recipient_business: { type: "string", description: "Name of the target business." },
          recipient_name: { type: "string", description: "Name of the contact person (if known)." },
          pain_point: { type: "string", description: "Specific issue you're addressing. E.g., 'outdated website', 'no online presence'" },
          service: { type: "string", description: "Service you're offering. E.g., 'website redesign', 'e-commerce setup'" },
          email_type: { type: "string", description: "Type of email: 'cold_outreach', 'follow_up', 'proposal', 'meeting_request'", enum: ["cold_outreach", "follow_up", "proposal", "meeting_request"] },
        },
        required: ["recipient_business", "pain_point", "email_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_outreach_campaign",
      description: "Create a multi-day outreach campaign plan with scheduled touchpoints, email templates, and follow-up strategy.",
      parameters: {
        type: "object",
        properties: {
          target_industry: { type: "string", description: "Target industry." },
          target_location: { type: "string", description: "Target location." },
          num_leads: { type: "number", description: "Number of leads to target." },
          duration_days: { type: "number", description: "Campaign duration in days." },
        },
        required: ["target_industry", "num_leads"],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ Finance Agent Tools ━━
export const FINANCE_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "calculate_estimate",
      description: "Calculate a detailed project cost estimate with breakdown of design, development, testing, deployment, and maintenance phases. Includes contingency.",
      parameters: {
        type: "object",
        properties: {
          project_type: { type: "string", description: "Type of project. E.g., '5-page website', 'e-commerce', 'web app'" },
          features: { type: "array", items: { type: "string" }, description: "List of features required." },
          complexity: { type: "string", description: "Complexity level: 'simple', 'moderate', 'complex', 'enterprise'", enum: ["simple", "moderate", "complex", "enterprise"] },
          hourly_rate: { type: "number", description: "Hourly rate in GBP (default: TrishulHub standard rate)." },
        },
        required: ["project_type", "complexity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_quotation",
      description: "Generate a professional quotation document with project scope, deliverables, timeline, payment terms, and total cost breakdown.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Client business name." },
          project_title: { type: "string", description: "Project title." },
          items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } } }, description: "Line items with description, quantity, and unit price." },
          payment_terms: { type: "string", description: "Payment terms. E.g., '50% upfront, 50% on completion'" },
          valid_days: { type: "number", description: "Quotation validity in days." },
        },
        required: ["client_name", "project_title", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_invoice",
      description: "Generate a professional invoice with itemized services, subtotal, tax, total, and payment details.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Client business name." },
          invoice_number: { type: "string", description: "Invoice number." },
          items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } } }, description: "Line items." },
          due_date: { type: "string", description: "Payment due date." },
          tax_rate: { type: "number", description: "Tax rate percentage (default: 20% UK VAT)." },
        },
        required: ["client_name", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "research_market_pricing",
      description: "Search the web for current market pricing and rates for web development services, hosting, domains, or specific project types.",
      parameters: {
        type: "object",
        properties: {
          service_type: { type: "string", description: "Type of service to research. E.g., 'website design UK', 'e-commerce development pricing', 'SEO services rates'" },
          region: { type: "string", description: "Geographic region for pricing. E.g., 'UK', 'London'" },
        },
        required: ["service_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_roi",
      description: "Calculate Return on Investment, profit margins, break-even analysis, or other financial metrics for a project or service.",
      parameters: {
        type: "object",
        properties: {
          calculation_type: { type: "string", description: "Type of calculation: 'roi', 'profit_margin', 'break_even', 'cashflow'", enum: ["roi", "profit_margin", "break_even", "cashflow"] },
          revenue: { type: "number", description: "Total revenue or income." },
          costs: { type: "number", description: "Total costs." },
          timeframe_months: { type: "number", description: "Timeframe in months." },
        },
        required: ["calculation_type", "revenue", "costs"],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ Project Manager Agent Tools ━━
export const PROJECT_MANAGER_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "break_down_project",
      description: "Break a project into phases, milestones, and specific tasks with dependencies, estimated hours, and assignee suggestions.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Name of the project." },
          requirements: { type: "string", description: "Project requirements and scope." },
          tech_stack: { type: "array", items: { type: "string" }, description: "Technologies to be used." },
          deadline: { type: "string", description: "Target deadline or timeline." },
        },
        required: ["project_name", "requirements"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_timeline",
      description: "Create a project timeline with milestones, deadlines, and critical path analysis.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Project name." },
          phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, duration_days: { type: "number" }, dependencies: { type: "array", items: { type: "string" } } } }, description: "Project phases with durations and dependencies." },
          start_date: { type: "string", description: "Project start date." },
        },
        required: ["project_name", "phases"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assess_risks",
      description: "Identify and assess project risks with probability, impact, and mitigation strategies.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Project name." },
          project_scope: { type: "string", description: "Brief description of project scope." },
          known_concerns: { type: "string", description: "Any known concerns or constraints." },
        },
        required: ["project_name", "project_scope"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_sprint",
      description: "Plan a development sprint with prioritized tasks, story points, and clear deliverables.",
      parameters: {
        type: "object",
        properties: {
          sprint_duration_weeks: { type: "number", description: "Sprint duration in weeks." },
          team_size: { type: "number", description: "Number of team members." },
          backlog_items: { type: "array", items: { type: "string" }, description: "Items from the backlog to consider." },
          sprint_goal: { type: "string", description: "Main goal for the sprint." },
        },
        required: ["sprint_goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_effort",
      description: "Estimate development effort in hours for specific tasks or features using story points and time calculations.",
      parameters: {
        type: "object",
        properties: {
          tasks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, complexity: { type: "string", enum: ["trivial", "simple", "moderate", "complex", "unknown"] } } }, description: "Tasks to estimate." },
          hourly_rate: { type: "number", description: "Hourly rate for cost calculation." },
        },
        required: ["tasks"],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ HR Agent Tools ━━
export const HR_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "analyze_workload",
      description: "Analyze team workload distribution, identify overwork or underutilization, and suggest task redistribution.",
      parameters: {
        type: "object",
        properties: {
          team_members: { type: "array", items: { type: "object", properties: { name: { type: "string" }, current_tasks: { type: "number" }, hours_per_week: { type: "number" }, skills: { type: "array", items: { type: "string" } } } }, description: "Team members with current workload info." },
        },
        required: ["team_members"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_best_fit",
      description: "Find the best team member for a specific task based on skills, availability, and current workload.",
      parameters: {
        type: "object",
        properties: {
          task_description: { type: "string", description: "Description of the task." },
          required_skills: { type: "array", items: { type: "string" }, description: "Skills required for the task." },
          priority: { type: "string", description: "Task priority: 'low', 'medium', 'high', 'urgent'", enum: ["low", "medium", "high", "urgent"] },
          team_members: { type: "array", items: { type: "object", properties: { name: { type: "string" }, skills: { type: "array", items: { type: "string" } }, current_load: { type: "string", enum: ["available", "moderate", "busy", "overloaded"] } } }, description: "Available team members." },
        },
        required: ["task_description", "required_skills", "team_members"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_onboarding",
      description: "Create a structured onboarding plan for a new team member with first day, first week, and first month milestones.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Role of the new team member. E.g., 'Junior Developer', 'Sales Executive'" },
          department: { type: "string", description: "Department they're joining." },
          start_date: { type: "string", description: "Start date." },
        },
        required: ["role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assess_leave_conflicts",
      description: "Check for leave conflicts, assess impact on project deadlines, and suggest coverage plans.",
      parameters: {
        type: "object",
        properties: {
          leave_requests: { type: "array", items: { type: "object", properties: { person: { type: "string" }, dates: { type: "string" }, reason: { type: "string" } } }, description: "Leave requests to check." },
          active_projects: { type: "array", items: { type: "string" }, description: "Currently active projects." },
        },
        required: ["leave_requests"],
      },
    },
  },
  WEB_SEARCH_TOOL,
  PLAN_TASK_TOOL,
]

// ━━ Content Agent Tools ━━
export const CONTENT_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "research_trends",
      description: "Search the web for current content trends, popular topics, viral content, or trending keywords in a specific industry or niche.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic or industry to research trends for." },
          platform: { type: "string", description: "Platform focus: 'all', 'instagram', 'linkedin', 'twitter', 'tiktok', 'blog'", enum: ["all", "instagram", "linkedin", "twitter", "tiktok", "blog"] },
          region: { type: "string", description: "Target region. E.g., 'UK', 'Global'" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_seo",
      description: "Analyze SEO keywords and provide optimization recommendations including search volume, competition level, and content strategy.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic or focus keyword." },
          content_type: { type: "string", description: "Type of content: 'blog', 'website', 'social_media'", enum: ["blog", "website", "social_media"] },
          target_audience: { type: "string", description: "Target audience description." },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_content",
      description: "Draft content for a specific platform with appropriate tone, format, and structure. Supports multiple content types.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Content title or headline." },
          content_type: { type: "string", description: "Type: 'blog_post', 'social_post', 'email', 'website_copy', 'ad_copy'", enum: ["blog_post", "social_post", "email", "website_copy", "ad_copy"] },
          platform: { type: "string", description: "Target platform: 'instagram', 'linkedin', 'twitter', 'facebook', 'website', 'email'", enum: ["instagram", "linkedin", "twitter", "facebook", "website", "email"] },
          tone: { type: "string", description: "Desired tone: 'professional', 'casual', 'humorous', 'inspirational', 'educational'", enum: ["professional", "casual", "humorous", "inspirational", "educational"] },
          key_points: { type: "array", items: { type: "string" }, description: "Key points to include in the content." },
          call_to_action: { type: "string", description: "Desired call to action." },
        },
        required: ["title", "content_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_content_calendar",
      description: "Create a content calendar with scheduled posts, topics, platforms, and posting times for optimal engagement.",
      parameters: {
        type: "object",
        properties: {
          duration_weeks: { type: "number", description: "Calendar duration in weeks." },
          platforms: { type: "array", items: { type: "string" }, description: "Target platforms." },
          content_themes: { type: "array", items: { type: "string" }, description: "Content themes or topics to cover." },
          posting_frequency: { type: "string", description: "How often to post: 'daily', '3x_week', '2x_week', 'weekly'", enum: ["daily", "3x_week", "2x_week", "weekly"] },
        },
        required: ["duration_weeks", "content_themes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "research_competitors",
      description: "Research competitor content strategy, identify gaps, and find opportunities for differentiation.",
      parameters: {
        type: "object",
        properties: {
          competitors: { type: "array", items: { type: "string" }, description: "Competitor names or websites." },
          our_niche: { type: "string", description: "Our business niche or focus area." },
          platform: { type: "string", description: "Platform to analyze: 'all', 'website', 'social_media'", enum: ["all", "website", "social_media"] },
        },
        required: ["our_niche"],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ Support Agent Tools ━━
export const SUPPORT_TOOLS: AgentTool[] = [
  WEB_SEARCH_TOOL,
  {
    type: "function",
    function: {
      name: "troubleshoot_issue",
      description: "Create a step-by-step troubleshooting guide for a technical issue, starting with the most common causes and working through solutions.",
      parameters: {
        type: "object",
        properties: {
          issue_description: { type: "string", description: "Description of the technical issue." },
          platform: { type: "string", description: "Platform/service affected: 'website', 'email', 'hosting', 'domain', 'dns'", enum: ["website", "email", "hosting", "domain", "dns", "other"] },
          severity: { type: "string", description: "Issue severity: 'critical', 'high', 'medium', 'low'", enum: ["critical", "high", "medium", "low"] },
        },
        required: ["issue_description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search for answers in the knowledge base for common issues, FAQs, and previously resolved tickets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for the knowledge base." },
          category: { type: "string", description: "Category: 'hosting', 'email', 'domains', 'ssl', 'cms', 'general'", enum: ["hosting", "email", "domains", "ssl", "cms", "general"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_client_response",
      description: "Draft a professional response to a client inquiry or support ticket with appropriate tone and detailed solution.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Client name." },
          issue_summary: { type: "string", description: "Summary of their issue." },
          resolution: { type: "string", description: "The solution or response to provide." },
          tone: { type: "string", description: "Response tone: 'helpful', 'empathetic', 'technical', 'follow_up'", enum: ["helpful", "empathetic", "technical", "follow_up"] },
        },
        required: ["client_name", "issue_summary", "resolution"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_kb_article",
      description: "Create a knowledge base article for a common issue with problem description, cause, step-by-step solution, and prevention tips.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Article title." },
          issue_description: { type: "string", description: "Problem description." },
          root_cause: { type: "string", description: "Root cause of the issue." },
          solution_steps: { type: "array", items: { type: "string" }, description: "Step-by-step solution." },
          prevention_tips: { type: "array", items: { type: "string" }, description: "Tips to prevent the issue." },
        },
        required: ["title", "issue_description", "solution_steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assess_escalation",
      description: "Assess whether an issue needs escalation to development team, determine urgency, and prepare an escalation brief.",
      parameters: {
        type: "object",
        properties: {
          issue_description: { type: "string", description: "Description of the issue." },
          client_impact: { type: "string", description: "Impact on the client: 'revenue_loss', 'service_down', 'minor_inconvenience', 'cosmetic'", enum: ["revenue_loss", "service_down", "minor_inconvenience", "cosmetic"] },
          attempts_made: { type: "string", description: "Troubleshooting attempts already made." },
        },
        required: ["issue_description", "client_impact"],
      },
    },
  },
  PLAN_TASK_TOOL,
]

// ━━ Tool Registry - Get tools by agent type ━━
export function getToolsForAgentType(agentType: string): AgentTool[] {
  switch (agentType) {
    case "DEV":
      return DEV_AGENT_TOOLS
    case "CLIENT_HUNTER":
      return CLIENT_HUNTER_TOOLS
    case "FINANCE":
      return FINANCE_TOOLS
    case "PROJECT_MANAGER":
      return PROJECT_MANAGER_TOOLS
    case "HR":
      return HR_TOOLS
    case "CONTENT":
      return CONTENT_TOOLS
    case "SUPPORT":
      return SUPPORT_TOOLS
    default:
      // Default: web_search + plan_task for unknown agent types
      return [WEB_SEARCH_TOOL, PLAN_TASK_TOOL]
  }
}

// ━━ Tool Execution Engine ━━
// Routes tool calls to the appropriate implementation

export async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  options?: { projectId?: string; chatId?: string; agentType?: string }
): Promise<ToolCallResult> {
  const startTime = Date.now()

  try {
    let result: string

    switch (toolName) {
      // ── Shared tools ──
      case "web_search":
        result = await executeWebSearch(args.query, args.purpose)
        break

      case "plan_task": {
        // Generate unique IDs for each todo item
        const planSteps = (args.steps || []).map((s: PlanStep, idx: number) => ({
          id: `todo-${Date.now()}-${idx}`,
          step: s.step || idx + 1,
          title: s.title || `Step ${idx + 1}`,
          description: s.description || "",
          prompt: s.prompt || s.description || "",
          status: "pending" as const,
        }))
        result = JSON.stringify({
          task: args.task,
          steps: planSteps,
          requiresActivation: true,
          status: "planned",
          totalSteps: planSteps.length,
        }, null, 2)
        break
      }

      // ── Dev Agent tools ──
      case "read_file":
        result = await executeReadFile(args.path, args.purpose)
        break

      case "write_file":
        result = await executeWriteFile(args.path, args.content, args.description)
        break

      case "edit_file":
        result = await executeEditFile(args.path, args.old_content, args.new_content, args.description)
        break

      case "list_files":
        result = await executeListFiles(args.path, args.pattern)
        break

      case "run_command":
        result = await executeRunCommand(args.command, args.purpose)
        break

      case "analyze_code":
        result = await executeAnalyzeCode(args.path, args.focus)
        break

      // ── Git/GitHub tools (Dev Agent only) ──
      case "git_commit_push":
        result = await executeGitCommitPush(args.message, args.files, args.branch, args.description)
        break

      case "git_status":
        result = await executeGitStatus(args.purpose)
        break

      case "git_create_branch":
        result = await executeGitCreateBranch(args.name, args.purpose)
        break

      case "git_diff":
        result = await executeGitDiff(args.path, args.purpose)
        break

      // ── Client Hunter tools ──
      case "search_leads":
        result = await executeSearchLeads(args.location, args.industry, args.criteria)
        break

      case "analyze_website":
        result = await executeWebSearch(
          `site:${args.url} OR "${args.url}" review analysis performance`,
          `Analyzing website: ${args.url}`
        )
        break

      case "score_lead":
        result = executeScoreLead(args as Parameters<typeof executeScoreLead>[0])
        break

      case "draft_email":
        result = executeDraftEmail(args as Parameters<typeof executeDraftEmail>[0])
        break

      case "plan_outreach_campaign":
        result = JSON.stringify({
          campaign: {
            target_industry: args.target_industry,
            target_location: args.target_location || "Not specified",
            num_leads: args.num_leads,
            duration_days: args.duration_days || 14,
            phases: [
              { day: "Day 1-2", action: "Research & identify leads", details: `Find ${args.num_leads} potential ${args.target_industry} clients` },
              { day: "Day 3-5", action: "Initial cold outreach", details: "Send personalized cold emails to identified leads" },
              { day: "Day 7-9", action: "Follow-up round 1", details: "Follow up with non-responders, add new value" },
              { day: "Day 10-12", action: "Follow-up round 2", details: "Final follow-up with case study or offer" },
              { day: "Day 13-14", action: "Review & plan next batch", details: "Analyze response rates and optimize" },
            ],
          },
        }, null, 2)
        break

      // ── Finance tools ──
      case "calculate_estimate":
        result = executeCalculateEstimate(args as Parameters<typeof executeCalculateEstimate>[0])
        break

      case "generate_quotation":
        result = executeGenerateQuotation(args as Parameters<typeof executeGenerateQuotation>[0])
        break

      case "generate_invoice":
        result = executeGenerateInvoice(args as Parameters<typeof executeGenerateInvoice>[0])
        break

      case "research_market_pricing":
        result = await executeWebSearch(
          `${args.service_type} pricing rates ${args.region || 'UK'} 2025`,
          `Researching market pricing for: ${args.service_type}`
        )
        break

      case "calculate_roi":
        result = executeCalculateROI(args as Parameters<typeof executeCalculateROI>[0])
        break

      // ── Project Manager tools ──
      case "break_down_project": {
        const techStack = args.tech_stack?.length > 0 ? args.tech_stack : ["To be determined"]
        const reqLower = (args.requirements || "").toLowerCase()
        const projectType = reqLower.includes("e-commerce") || reqLower.includes("ecommerce") || reqLower.includes("shop") ? "ecommerce"
          : reqLower.includes("landing page") || reqLower.includes("marketing site") ? "landing"
          : reqLower.includes("web app") || reqLower.includes("dashboard") || reqLower.includes("saas") ? "webapp"
          : reqLower.includes("mobile app") || reqLower.includes("mobile application") || reqLower.includes("ios app") || reqLower.includes("android app") || reqLower.includes("native app") ? "mobile"
          : "website"

        const phaseTemplates: Record<string, Array<{ phase: number; name: string; tasks: string[]; estimatedHours: number }>> = {
          ecommerce: [
            { phase: 1, name: "Discovery & Planning", tasks: ["Requirements gathering & stakeholder interviews", "Competitor analysis & market research", "Technical specification & architecture design", "Project plan & milestone creation"], estimatedHours: 40 },
            { phase: 2, name: "UI/UX Design", tasks: ["User journey mapping & wireframes", "Product catalog & category design", "Checkout flow & payment UX", "Responsive design for mobile/tablet", "Design review & client approval"], estimatedHours: 60 },
            { phase: 3, name: "Core Development", tasks: ["Product catalog & category system", "Shopping cart & checkout integration", "Payment gateway (Stripe/PayPal)", "User authentication & profiles", "Order management & tracking"], estimatedHours: 120 },
            { phase: 4, name: "Extended Features", tasks: ["Search & filtering system", "Admin dashboard & inventory management", "Email notifications & order confirmations", "SEO optimization & analytics", "Performance optimization"], estimatedHours: 60 },
            { phase: 5, name: "Testing & QA", tasks: ["Unit & integration testing", "Payment flow testing", "Cross-browser & responsive testing", "Load & performance testing", "User acceptance testing"], estimatedHours: 40 },
            { phase: 6, name: "Deployment & Launch", tasks: ["Staging environment setup", "Production deployment", "SSL & security hardening", "Post-launch monitoring", "Client training & handover"], estimatedHours: 24 },
          ],
          landing: [
            { phase: 1, name: "Discovery", tasks: ["Brand & messaging alignment", "Target audience analysis", "Content strategy & copywriting brief", "Technical specification"], estimatedHours: 16 },
            { phase: 2, name: "Design", tasks: ["Hero section & visual hierarchy", "Feature sections & testimonials", "CTA optimization & form design", "Responsive mobile design", "Client review & revision"], estimatedHours: 32 },
            { phase: 3, name: "Development", tasks: ["HTML/CSS/JS implementation", "Form integration & email setup", "Analytics & conversion tracking", "SEO & meta tag optimization", "Performance optimization"], estimatedHours: 40 },
            { phase: 4, name: "Launch", tasks: ["Cross-browser testing", "Mobile responsiveness QA", "DNS & hosting setup", "Go-live & monitoring"], estimatedHours: 12 },
          ],
          webapp: [
            { phase: 1, name: "Discovery & Architecture", tasks: ["Requirements gathering & user stories", "System architecture & data model design", "API specification & tech stack selection", "Project plan with sprint roadmap"], estimatedHours: 48 },
            { phase: 2, name: "UI/UX Design", tasks: ["User flow & information architecture", "Wireframes for all key screens", "Interactive prototype", "Design system & component library", "Client approval"], estimatedHours: 64 },
            { phase: 3, name: "Backend Development", tasks: ["Database schema & migrations", "API endpoints & authentication", "Business logic & data validation", "Third-party integrations", "API documentation"], estimatedHours: 100 },
            { phase: 4, name: "Frontend Development", tasks: ["Component development & state management", "API integration & data fetching", "Form handling & validation", "Real-time features (WebSocket/SSE)", "Responsive design implementation"], estimatedHours: 100 },
            { phase: 5, name: "Testing & QA", tasks: ["Unit & integration tests", "End-to-end testing", "Security audit & penetration testing", "Performance & load testing", "User acceptance testing"], estimatedHours: 48 },
            { phase: 6, name: "Deployment & Launch", tasks: ["CI/CD pipeline setup", "Staging environment verification", "Production deployment", "Monitoring & alerting setup", "Documentation & handover"], estimatedHours: 24 },
          ],
          mobile: [
            { phase: 1, name: "Discovery & Planning", tasks: ["Requirements & feature prioritization", "Platform strategy (iOS/Android/cross-platform)", "UX research & persona mapping", "Technical specification"], estimatedHours: 40 },
            { phase: 2, name: "UI/UX Design", tasks: ["App flow & navigation design", "Screen wireframes for all views", "Interactive prototype", "Design system for mobile", "Usability testing"], estimatedHours: 56 },
            { phase: 3, name: "Core Development", tasks: ["Authentication & user management", "Core feature implementation", "API integration & data sync", "Push notifications", "Offline support"], estimatedHours: 120 },
            { phase: 4, name: "Polish & Testing", tasks: ["UI polish & animations", "Device testing & compatibility", "Performance optimization", "App Store preparation"], estimatedHours: 40 },
            { phase: 5, name: "Launch", tasks: ["Beta testing program", "App Store submission", "Launch marketing", "Post-launch monitoring"], estimatedHours: 20 },
          ],
          website: [
            { phase: 1, name: "Discovery & Planning", tasks: ["Requirements gathering", "Content strategy & sitemap", "Technical specification", "Project timeline"], estimatedHours: 24 },
            { phase: 2, name: "Design", tasks: ["Homepage & key page designs", "Responsive layouts", "Brand alignment & style guide", "Client review & approval"], estimatedHours: 40 },
            { phase: 3, name: "Development", tasks: ["Frontend build with CMS integration", "Content migration & formatting", "SEO optimization & meta tags", "Contact forms & email setup"], estimatedHours: 60 },
            { phase: 4, name: "Testing & Launch", tasks: ["Cross-browser & device testing", "Performance & accessibility audit", "DNS configuration & deployment", "Client training"], estimatedHours: 20 },
          ],
        }

        const phases = phaseTemplates[projectType] || phaseTemplates.website
        const totalHours = phases.reduce((sum, p) => sum + p.estimatedHours, 0)

        result = JSON.stringify({
          project: args.project_name,
          requirements: args.requirements,
          tech_stack: techStack,
          deadline: args.deadline || "To be determined",
          project_type_detected: projectType,
          total_estimated_hours: totalHours,
          phases: phases.map(p => ({
            phase: p.phase,
            name: p.name,
            tasks: p.tasks,
            estimatedHours: p.estimatedHours,
          })),
          dependencies: [
            "Phase 2 depends on Phase 1 completion and approval",
            "Phase 3 depends on Phase 2 design approval",
            "Phase 4+ depends on Phase 3 core development",
            "Each phase requires client review before proceeding",
          ],
          recommended_team: {
            design: "1 UI/UX Designer",
            development: techStack.some((t: string) => t.toLowerCase().includes("react") || t.toLowerCase().includes("next")) ? "1-2 Full-stack Developers" : "1-2 Web Developers",
            qa: "1 QA Engineer (part-time)",
          },
        }, null, 2)
        break
      }

      case "create_timeline":
        result = executeCreateTimeline(args as Parameters<typeof executeCreateTimeline>[0])
        break

      case "assess_risks":
        result = executeAssessRisks(args as Parameters<typeof executeAssessRisks>[0])
        break

      case "plan_sprint":
        result = executePlanSprint(args as Parameters<typeof executePlanSprint>[0])
        break

      case "estimate_effort":
        result = executeEstimateEffort(args as Parameters<typeof executeEstimateEffort>[0])
        break

      // ── HR tools ──
      case "analyze_workload":
        result = executeAnalyzeWorkload(args as Parameters<typeof executeAnalyzeWorkload>[0])
        break

      case "find_best_fit":
        result = executeFindBestFit(args as Parameters<typeof executeFindBestFit>[0])
        break

      case "plan_onboarding":
        result = executePlanOnboarding(args as Parameters<typeof executePlanOnboarding>[0])
        break

      case "assess_leave_conflicts":
        result = executeAssessLeaveConflicts(args as Parameters<typeof executeAssessLeaveConflicts>[0])
        break

      // ── Content tools ──
      case "research_trends":
        result = await executeWebSearch(
          `${args.topic} trends ${args.platform !== 'all' ? args.platform : ''} ${args.region || '2025'}`,
          `Researching content trends for: ${args.topic}`
        )
        break

      case "analyze_seo":
        result = await executeWebSearch(
          `${args.topic} SEO keywords search volume competition`,
          `Analyzing SEO for: ${args.topic}`
        )
        break

      case "draft_content":
        result = executeDraftContent(args as Parameters<typeof executeDraftContent>[0])
        break

      case "create_content_calendar":
        result = executeCreateContentCalendar(args as Parameters<typeof executeCreateContentCalendar>[0])
        break

      case "research_competitors":
        result = await executeWebSearch(
          `${args.our_niche} competitors content strategy`,
          `Researching competitors in: ${args.our_niche}`
        )
        break

      // ── Support tools ──
      case "troubleshoot_issue":
        result = executeTroubleshootIssue(args as Parameters<typeof executeTroubleshootIssue>[0])
        break

      case "search_knowledge_base":
        result = await executeWebSearch(
          `${args.query} ${args.category || ''} troubleshooting solution`,
          `Searching knowledge base for: ${args.query}`
        )
        break

      case "draft_client_response":
        result = executeDraftClientResponse(args as Parameters<typeof executeDraftClientResponse>[0])
        break

      case "create_kb_article":
        result = JSON.stringify({
          article: {
            title: args.title,
            category: args.category || "General",
            issue: args.issue_description,
            rootCause: args.root_cause || "To be determined",
            solution: (args.solution_steps || []).map((step: string, i: number) => `${i + 1}. ${step}`).join("\n"),
            prevention: (args.prevention_tips || []).map((tip: string) => `- ${tip}`).join("\n"),
            created_at: new Date().toISOString(),
          },
        }, null, 2)
        break

      case "assess_escalation":
        result = executeAssessEscalation(args as Parameters<typeof executeAssessEscalation>[0])
        break

      default:
        result = `Unknown tool: ${toolName}. This tool is not available for this agent.`
    }

    const elapsed = Date.now() - startTime
    // Detect errors from tool implementations that return "Error:" strings
    const isToolError = typeof result === "string" && result.startsWith("Error:")
    return {
      toolCallId: "",
      name: toolName,
      result: result || "(empty result)",
      success: !isToolError,
    }
  } catch (error: any) {
    return {
      toolCallId: "",
      name: toolName,
      result: `Error executing ${toolName}: ${error.message}`,
      success: false,
    }
  }
}

// ━━ Web Search Implementation ━━

async function executeWebSearch(query: string, purpose?: string): Promise<string> {
  try {
    // Ensure .z-ai-config exists for the SDK (same fix as web-search route)
    const fs = await import("fs")
    const path = await import("path")
    const configPath = path.join(process.cwd(), ".z-ai-config")
    try {
      fs.accessSync(configPath)
    } catch {
      const baseUrl = process.env.ZAI_BASE_URL || process.env.ZAI_API_BASE_URL
      const apiKey = process.env.ZAI_API_KEY
      if (baseUrl && apiKey) {
        fs.writeFileSync(configPath, JSON.stringify({ baseUrl, apiKey }), "utf-8")
      }
    }

    // Use Z.ai SDK directly instead of calling the API route
    // This avoids HTTP method mismatch (GET vs POST) and authentication issues
    // since the API route requires session cookies which aren't available in server-side fetch
    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = await ZAI.create()

    const searchResult = await zai.functions.invoke("web_search", {
      query,
      num: 8,
    })

    if (Array.isArray(searchResult) && searchResult.length > 0) {
      const formatted = searchResult.slice(0, 5).map((r: any, i: number) =>
        `${i + 1}. **${r.name || "Result"}**\n   URL: ${r.url}\n   ${r.snippet || ""}`
      ).join("\n\n")
      return `Web search results for: "${query}"${purpose ? ` (Purpose: ${purpose})` : ""}\n\n${formatted}`
    }

    return `Web search for: "${query}"${purpose ? ` (Purpose: ${purpose})` : ""}\n\nSearch completed but no results found. Try a more specific query.`
  } catch (error: any) {
    return `Web search failed: ${error.message}. Please try again with a different query.`
  }
}

// ━━ Client Hunter: Structured Lead Search ━━

async function executeSearchLeads(location: string, industry?: string, criteria?: string): Promise<string> {
  try {
    // Perform multiple targeted searches to gather comprehensive lead data
    const searchQueries = [
      `${industry || 'businesses'} in ${location} contact details phone website`,
      `${industry || 'companies'} ${location} ${criteria || ''} directory listing`,
      `best ${industry || 'businesses'} near ${location} reviews`,
    ]

    const allResults: Array<{ name: string; url: string; snippet: string }> = []

    // Use Z.ai SDK directly (avoids HTTP method mismatch and auth issues)
    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = await ZAI.create()

    // Run searches concurrently for better performance
    const searchPromises = searchQueries.map(async (query) => {
      try {
        const searchResult = await zai.functions.invoke("web_search", { query, num: 8 })
        if (Array.isArray(searchResult)) {
          for (const r of searchResult) {
            allResults.push({
              name: r.name || "",
              url: r.url || "",
              snippet: r.snippet || "",
            })
          }
        }
      } catch {
        // Continue with next query if one fails
      }
    })
    await Promise.all(searchPromises)

    // Deduplicate by URL
    const seenUrls = new Set<string>()
    const uniqueResults = allResults.filter(r => {
      if (seenUrls.has(r.url)) return false
      seenUrls.add(r.url)
      return true
    })

    if (uniqueResults.length === 0) {
      return `No leads found for ${industry || 'businesses'} in ${location}. Try broadening your search criteria or trying a different location.`
    }

    // Parse results into structured lead format
    const leads = uniqueResults.slice(0, 8).map((r, idx) => {
      const snippet = r.snippet || ""
      // Try to extract phone number from snippet
      const phoneMatch = snippet.match(/(?:\+44|0)\s?\d[\d\s\-]{8,12}\d/)
      const phone = phoneMatch ? phoneMatch[0] : null

      // Try to extract email
      const emailMatch = snippet.match(/[\w.-]+@[\w.-]+\.\w+/)
      const email = emailMatch ? emailMatch[0] : null

      // Try to extract address
      const addressMatch = snippet.match(/(\d+[\w\s,]+(?:Street|Road|Lane|Avenue|Drive|Way|Place|Harrow|London|Manchester|Birmingham|Leeds|Bristol|Edinburgh)[\w\s,]*)/i)
      const address = addressMatch ? addressMatch[1].trim() : null

      return {
        id: idx + 1,
        businessName: r.name || `Business ${idx + 1}`,
        website: r.url || null,
        phone: phone,
        email: email,
        address: address,
        industry: industry || "General",
        location: location,
        notes: snippet.substring(0, 200),
      }
    })

    // Format as structured output
    const formattedLeads = leads.map(lead => {
      const lines = [
        `LEAD #${lead.id}:`,
        `  Business Name: ${lead.businessName}`,
        `  Location: ${lead.location}`,
        `  Industry: ${lead.industry}`,
        lead.website ? `  Website: ${lead.website}` : "  Website: Not found",
        lead.phone ? `  Phone: ${lead.phone}` : "  Phone: Not found",
        lead.email ? `  Email: ${lead.email}` : "  Email: Not found",
        lead.address ? `  Address: ${lead.address}` : "  Address: Not found",
        `  Notes: ${lead.notes.substring(0, 150)}`,
      ]
      return lines.join("\n")
    }).join("\n\n")

    const summary = `Found ${leads.length} potential leads for ${industry || 'businesses'} in ${location}.\n\n${formattedLeads}\n\nNEXT STEPS: Use score_lead to evaluate each lead, then use draft_email for HOT/WARM leads. Present results in a clear table with columns: Business, Location, Website, Score, Tier.`

    return summary
  } catch (error: any) {
    return `Lead search failed: ${error.message}. Please try again with different parameters.`
  }
}

// ━━ Dev Agent Tool Implementations ━━

async function executeReadFile(filePath: string, purpose?: string): Promise<string> {
  const fullPath = resolveWorkspacePath(filePath, false)
  if (!isPathWithinWorkspace(fullPath, false)) return `Error: Cannot read files outside project directory.`

  // SECURITY: Block reading sensitive files
  const blockedReadPatterns = [
    /\/etc\//i,               // System configuration directory
    /\/proc\//i,              // Process information directory
    /\/sys\//i,               // System kernel directory
    /\.env(\.|$)/i,           // .env, .env.local, .env.production, etc.
    /\.git(\/|$)/i,           // .git directory and its contents
    /\.key$/i,                // Private key files
    /\.pem$/i,                // Certificate files
    /\.p12$/i,                // PKCS12 files
    /\.cert$/i,               // Certificate files
    /credentials/i,           // Credentials files
    /serviceAccountKey/i,     // Firebase service account
    /id_rsa/i,                // SSH private keys
    /id_ed25519/i,            // SSH private keys
    /ssh/i,                   // SSH config/keys
    /aws/i,                   // AWS config/credentials
  ]
  const readBasename = path.basename(fullPath)
  const relativePath = filePath.replace(/\\/g, '/')
  for (const pattern of blockedReadPatterns) {
    if (pattern.test(readBasename) || pattern.test(relativePath)) {
      return `Error: Cannot read sensitive file: ${filePath}. This file is protected for security.`
    }
  }

  if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}`

  try {
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) return `Error: ${filePath} is a directory, not a file. Use list_files instead.`
    if (stat.size > 500 * 1024) return `Error: File too large (${Math.round(stat.size / 1024)}KB). Maximum is 500KB.`

    const content = fs.readFileSync(fullPath, "utf-8")
    const lineCount = content.split("\n").length
    return `File: ${filePath} (${lineCount} lines, ${Math.round(stat.size / 1024)}KB)${purpose ? `\nPurpose: ${purpose}` : ""}\n\n${content}`
  } catch (error: any) {
    return `Error reading file: ${error.message}`
  }
}

async function executeWriteFile(filePath: string, content: string, description?: string): Promise<string> {
  // Use writable workspace (fixes EROFS on Vercel where /var/task/ is read-only)
  const fullPath = resolveWorkspacePath(filePath, true)
  if (!isPathWithinWorkspace(fullPath, true)) return `Error: Cannot write files outside project directory.`

  // Prevent overwriting critical files
  const criticalFiles = [
    '.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test',
    'next.config.js', 'next.config.ts', 'next.config.mjs',
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'tsconfig.json',
    '.gitignore', '.gitattributes',
    'vercel.json', 'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
    'prisma/schema.prisma',
  ]
  const basename = path.basename(fullPath)
  if (criticalFiles.includes(basename)) {
    return `Error: Cannot overwrite critical file: ${basename}. This file is protected for safety.`
  }
  if (basename.startsWith('.env')) {
    return 'Error: Cannot write to environment configuration files for security reasons.'
  }

  try {
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content, "utf-8")
    const lines = content.split("\n").length
    // Include code preview (first 30 lines) so users can see the generated code
    const previewLines = content.split("\n").slice(0, 30)
    const preview = previewLines.length < lines
      ? previewLines.join("\n") + `\n... (${lines - 30} more lines)`
      : content
    // Detect language from file extension for syntax highlighting
    const ext = path.extname(filePath).slice(1)
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      css: "css", scss: "scss", html: "html", json: "json", yaml: "yaml",
      yml: "yaml", md: "markdown", sql: "sql", sh: "bash", bash: "bash",
      php: "php",
    }
    const lang = langMap[ext] || ext
    return `File written successfully: ${filePath}\nLines: ${lines}\nSize: ${Math.round(content.length / 1024)}KB${description ? `\nDescription: ${description}` : ""}\n\n\`\`\`${lang}\n${preview}\n\`\`\``
  } catch (error: any) {
    const isVirtual = isReadOnlyFS()
    const lines = content.split("\n").length
    const previewLines = content.split("\n").slice(0, 30)
    const preview = previewLines.length < lines
      ? previewLines.join("\n") + `\n... (${lines - 30} more lines)`
      : content
    const ext = path.extname(filePath).slice(1)
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      css: "css", scss: "scss", html: "html", json: "json", yaml: "yaml",
      yml: "yaml", md: "markdown", sql: "sql", sh: "bash", bash: "bash",
      php: "php",
    }
    const lang = langMap[ext] || ext
    if (isVirtual) {
      return `⚠️ Virtual file (read-only server): ${filePath}\nLines: ${lines}${description ? `\nDescription: ${description}` : ""}\n\nNote: This server has a read-only filesystem. The file was created in memory but will be lost when this session ends. To persist changes, use git_commit_push to save to GitHub.\n\n\`\`\`${lang}\n${preview}\n\`\`\``
    }
    console.error(`[agent-tools] write_file failed for ${filePath}:`, error.message)
    return `Error writing file ${filePath}: ${error.message}\n\n\`\`\`${lang}\n${preview}\n\`\`\``
  }
}

async function executeEditFile(filePath: string, oldContent: string, newContent: string, description?: string): Promise<string> {
  // SECURITY: Block editing critical configuration files
  const criticalFiles = [
    '.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test',
    'next.config.js', 'next.config.ts', 'next.config.mjs',
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'tsconfig.json',
    '.gitignore', '.gitattributes',
    'vercel.json', 'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
    'prisma/schema.prisma',
  ]
  const resolvedPath = path.resolve(PROJECT_ROOT, filePath)
  const fileName = path.basename(resolvedPath)
  if (criticalFiles.includes(fileName) || fileName.startsWith('.env')) {
    return 'Error: Cannot edit critical configuration files for security reasons.'
  }

  // Try writable workspace first for existing files, then fall back to read path
  let fullPath = resolveWorkspacePath(filePath, true)
  if (!fs.existsSync(fullPath)) {
    // File might be in the read-only project root - copy it to workspace first
    const readPath = path.resolve(PROJECT_ROOT, filePath)
    if (fs.existsSync(readPath) && isPathWithinWorkspace(readPath, false)) {
      // Copy file to writable workspace
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(readPath, fullPath)
    }
  }
  if (!isPathWithinWorkspace(fullPath, true)) return `Error: Cannot edit files outside project directory.`
  if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}. Use write_file to create new files.`

  try {
    const content = fs.readFileSync(fullPath, "utf-8")
    if (!content.includes(oldContent)) {
      const lines = content.split("\n")
      const searchLines = oldContent.split("\n").filter(l => l.trim())
      let foundLine = -1
      for (const searchLine of searchLines) {
        const idx = lines.findIndex(l => l.includes(searchLine.trim()))
        if (idx >= 0) { foundLine = idx + 1; break }
      }
      return `Error: Could not find the exact content to replace in ${filePath}. ${foundLine > 0 ? `Similar content found at line ${foundLine}. Please read the file first and use the exact text.` : "No similar content found."}`
    }
    // Count occurrences to warn about multiple matches
    const occurrences = content.split(oldContent).length - 1
    if (occurrences > 1) {
      // For multiple occurrences, only replace the first one but warn the agent
      const newFileContent = content.replace(oldContent, newContent)
      fs.writeFileSync(fullPath, newFileContent, "utf-8")
      const editPreviewLines = newContent.split("\n").slice(0, 20)
      const editPreview = newContent.split("\n").length > 20
        ? editPreviewLines.join("\n") + `\n... (${newContent.split("\n").length - 20} more lines)`
        : newContent
      const editExt = path.extname(filePath).slice(1)
      const editLangMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", css: "css", html: "html", json: "json" }
      return `File edited successfully: ${filePath}${description ? `\nDescription: ${description}` : ""}\nReplaced ${oldContent.split("\n").length} lines with ${newContent.split("\n").length} lines.\nWARNING: Found ${occurrences} occurrences of this pattern. Only the FIRST occurrence was replaced.\n\n\`\`\`${editLangMap[editExt] || editExt}\n${editPreview}\n\`\`\``
    }
    const newFileContent = content.replace(oldContent, newContent)
    fs.writeFileSync(fullPath, newFileContent, "utf-8")
    // Include preview of the new content
    const newLines = newContent.split("\n")
    const previewLines = newLines.slice(0, 20)
    const preview = newLines.length > 20
      ? previewLines.join("\n") + `\n... (${newLines.length - 20} more lines)`
      : newContent
    const ext = path.extname(filePath).slice(1)
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      css: "css", scss: "scss", html: "html", json: "json", yaml: "yaml",
      yml: "yaml", md: "markdown", sql: "sql", sh: "bash", bash: "bash",
    }
    const lang = langMap[ext] || ext
    return `File edited successfully: ${filePath}${description ? `\nDescription: ${description}` : ""}\nReplaced ${oldContent.split("\n").length} lines with ${newContent.split("\n").length} lines.\n\n\`\`\`${lang}\n${preview}\n\`\`\``
  } catch (error: any) {
    return `Error editing file: ${error.message}`
  }
}

async function executeListFiles(dirPath: string, pattern?: string): Promise<string> {
  const fullPath = resolveWorkspacePath(dirPath === "." ? "" : dirPath, false)
  if (!isPathWithinWorkspace(fullPath, false)) return `Error: Cannot list files outside project directory.`
  if (!fs.existsSync(fullPath)) {
    // Try workspace root
    const wsPath = path.resolve(getWorkspaceRoot(), dirPath === "." ? "" : dirPath)
    if (fs.existsSync(wsPath)) {
      return listDirContents(wsPath, dirPath, pattern)
    }
    return `Error: Directory not found: ${dirPath}`
  }
  return listDirContents(fullPath, dirPath, pattern)
}

function listDirContents(fullPath: string, dirPath: string, pattern?: string): string {
  try {
    const stat = fs.statSync(fullPath)
    if (!stat.isDirectory()) return `Error: ${dirPath} is a file, not a directory. Use read_file instead.`

    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    const results = entries
      .filter(e => {
        const name = e.name
        if (name.startsWith(".") && name !== ".env.example") return false
        if (name === "node_modules" || name === ".next" || name === "dist" || name === "build") return false
        if (pattern) {
          const safePattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, ".*").replace(/\?/g, ".")
          if (!name.match(new RegExp(safePattern))) return false
        }
        return true
      })
      .map(e => {
        const type = e.isDirectory() ? "[DIR]" : "[FILE]"
        const size = e.isFile() ? ` (${Math.round(fs.statSync(path.join(fullPath, e.name)).size / 1024)}KB)` : ""
        return `${type} ${e.name}${size}`
      })
    return `Directory: ${dirPath} (${results.length} entries)\n\n${results.join("\n")}`
  } catch (error: any) {
    return `Error listing files: ${error.message}`
  }
}

async function executeRunCommand(command: string, purpose?: string): Promise<string> {
  // CRITICAL FIX: Block newlines and carriage returns that bypass shell metacharacter filter
  const dangerousChars = /[;|&`$\n\r]/
  if (dangerousChars.test(command)) {
    return `Error: Command contains blocked shell metacharacters (; | & $ \` newlines). Only simple commands are allowed.`
  }

  // Block subshell syntax $(...) and backticks (already covered above but explicit)
  if (/\$\(|\)\s*;|`\s/.test(command)) {
    return `Error: Command contains blocked subshell or chaining syntax.`
  }

  // Block rm -rf on ANY path (not just /)
  if (/rm\s+-[a-zA-Z]*f/i.test(command)) {
    return 'Error: Recursive force delete (rm -rf) is not allowed. Delete files individually instead.'
  }

  // Blocklist: comprehensive dangerous patterns
  const blockedPatterns = [
    /node\s+(-e|--eval)\s/i,                        // Block inline JavaScript execution
    /mkfs/i,                                        // Format filesystem
    /dd\s+if=/i,                                    // Disk dump
    />\s*\/dev\//i,                                 // Redirect to /dev
    /shutdown|reboot|halt|poweroff/i,                // System control
    /format\s+[a-zA-Z]:/i,                           // Windows format
    /:\(\)\{\s*:\|:&\}/i,                            // Fork bomb (correct pattern)
    /chmod\s+[0-7]*777/i,                            // chmod 777
    />(\/etc\/|\/boot\/|\/usr\/sbin)/i,              // Overwrite system files
    /git\s+(push\s+.*--force|reset\s+--hard|clean\s+-[dfx])/i,  // Dangerous git ops
    /curl\s/i, /wget\s/i, /nc\s/i, /socat\s/i,
    /perl\s/i, /ruby\s/i,
  ]
  for (const pattern of blockedPatterns) {
    if (pattern.test(command)) return `Error: Command blocked for security: "${command}". This command pattern is not allowed.`
  }

  // Allowlist approach: only allow common development commands
  const allowedPrefixes = [
    'npm', 'npx', 'node', 'yarn', 'pnpm', 'bun',
    'git ', 'ls', 'head ', 'tail ', 'wc ',
    'grep ', 'rg ', 'find ', 'echo ',
    'tsc', 'eslint', 'prettier',
    'prisma',
    'mkdir ', 'cp ', 'mv ', 'touch ',
  ]
  const firstWord = command.trim().split(/\s+/)[0]
  const isAllowed = allowedPrefixes.some(prefix => firstWord === prefix.trim() || command.trim().startsWith(prefix))
  if (!isAllowed) {
    return `Error: Command "${firstWord}" is not in the allowed list. Allowed: npm, npx, node, yarn, pnpm, bun, git, ls, head, tail, wc, grep, rg, find, echo, tsc, eslint, prettier, prisma, mkdir, cp, mv, touch.`
  }

  try {
    // CRITICAL FIX: Use execSafe (execFile) instead of raw exec() to prevent shell injection.
    // Split command into binary + args array so no shell interpretation occurs.
    const parts = command.trim().split(/\s+/)
    const cmd = parts[0]
    const args = parts.slice(1)
    const { stdout, stderr } = await execSafe(cmd, args, {
      cwd: getWorkspaceRoot(),
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    } as any)
    const output: string[] = []
    if (stdout) output.push(stdout.slice(-3000))
    if (stderr) output.push(`STDERR: ${stderr.slice(-1000)}`)
    return `Command: ${command}${purpose ? `\nPurpose: ${purpose}` : ""}\n\n${output.join("\n") || "(no output)"}`
  } catch (error: any) {
    const output: string[] = []
    if (error.stdout) output.push(error.stdout.slice(-2000))
    if (error.stderr) output.push(error.stderr.slice(-1000))
    return `Command: ${command}${purpose ? `\nPurpose: ${purpose}` : ""}\nExit code: ${error.code || "unknown"}\n\n${output.join("\n") || error.message}`
  }
}

async function executeAnalyzeCode(filePath: string, focus: string): Promise<string> {
  const fullPath = resolveWorkspacePath(filePath, false)
  if (!isPathWithinWorkspace(fullPath, false)) return `Error: Cannot analyze files outside project directory.`
  if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}`

  try {
    const content = fs.readFileSync(fullPath, "utf-8")
    const lines = content.split("\n")
    const ext = path.extname(filePath).toLowerCase()
    const issues: string[] = []
    const warnings: string[] = []
    const info: string[] = [`File: ${filePath}`, `Lines: ${lines.length}, Size: ${Math.round(content.length / 1024)}KB`, `Type: ${ext || "unknown"}`]

    lines.forEach((line, idx) => {
      const lineNum = idx + 1
      const trimmed = line.trim()
      if ((focus === "security" || focus === "all") && trimmed.includes("eval(")) issues.push(`Line ${lineNum}: eval() usage - potential code injection risk`)
      if ((focus === "security" || focus === "all") && trimmed.includes("innerHTML") && !trimmed.includes("sanitize")) warnings.push(`Line ${lineNum}: innerHTML without sanitization`)
      if ((focus === "bugs" || focus === "all") && trimmed.includes("console.log")) info.push(`Line ${lineNum}: console.log found`)
      if ((focus === "best-practices" || focus === "all") && ext === ".ts" && /: any\b|<any>|as any\b/.test(trimmed)) info.push(`Line ${lineNum}: 'any' type usage in TypeScript - consider using a specific type`)
    })

    return [
      info.join("\n"),
      issues.length > 0 ? `\nIssues (${issues.length}):\n${issues.join("\n")}` : "",
      warnings.length > 0 ? `\nWarnings (${warnings.length}):\n${warnings.slice(0, 15).join("\n")}` : "",
      issues.length === 0 && warnings.length === 0 ? "\nNo significant issues found." : "",
    ].filter(Boolean).join("\n")
  } catch (error: any) {
    return `Error analyzing code: ${error.message}`
  }
}

// ━━ Git/GitHub Tool Implementations ━━

async function executeGitStatus(purpose?: string): Promise<string> {
  try {
    const opts = { cwd: getWorkspaceRoot(), timeout: 15000 }
    const [{ stdout: statusOut }, { stdout: branchOut }, { stdout: remoteOut }] = await Promise.all([
      execSafe('git', ['status', '--porcelain'], opts),
      execSafe('git', ['branch', '--show-current'], opts),
      execSafe('git', ['remote', '-v'], opts),
    ])
    const output = `${statusOut.trim()}
---BRANCH---
${branchOut.trim()}
---REMOTE---
${remoteOut.trim()}`
    return `Git Status${purpose ? ` (Purpose: ${purpose})` : ""}:\n${output}`
  } catch (error: any) {
    return `Error checking git status: ${error.message}`
  }
}

async function executeGitCreateBranch(name: string, purpose?: string): Promise<string> {
  // Validate branch name
  if (!/^[a-zA-Z0-9\/\-_]+$/.test(name)) {
    return `Error: Invalid branch name "${name}". Use only letters, numbers, hyphens, underscores, and slashes.`
  }
  try {
    const { stdout: currentBranch } = await execSafe('git', ['branch', '--show-current'], { cwd: getWorkspaceRoot(), timeout: 10000 })
    const { stdout } = await execSafe('git', ['checkout', '-b', name], { cwd: getWorkspaceRoot(), timeout: 15000 })
    return `Created and switched to branch "${name}" from "${currentBranch.trim()}"${purpose ? `\nPurpose: ${purpose}` : ""}\n${stdout.trim()}\n\nYou can now make changes on this branch. Use git_commit_push to push when ready.`
  } catch (error: any) {
    return `Error creating branch: ${error.message}`
  }
}

async function executeGitDiff(filePath?: string, purpose?: string): Promise<string> {
  try {
    // Sanitize filePath to prevent command injection
    const safeFilePath = (filePath || '').replace(/[^a-zA-Z0-9._\-\/]/g, '')
    const opts = { cwd: getWorkspaceRoot(), timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
    const { stdout } = safeFilePath
      ? await execSafe('git', ['diff', '--', safeFilePath], opts)
      : await execSafe('git', ['diff', '--stat'], opts)
    if (!stdout.trim()) {
      return "No unstaged changes found. (Staged changes not shown - use 'git diff --cached' to see staged changes)"
    }
    // Limit output to prevent overwhelming the context
    const truncated = stdout.length > 10000 ? stdout.substring(0, 10000) + "\n... (diff truncated, too many changes)" : stdout
    return `Git Diff${purpose ? ` (Purpose: ${purpose})` : ""}:\n${truncated}`
  } catch (error: any) {
    return `Error checking git diff: ${error.message}`
  }
}

async function executeGitCommitPush(
  message: string,
  files: string[],
  branch?: string,
  description?: string
): Promise<string> {
  try {
    // 1. Stage files
    // Sanitize file paths - only allow relative paths without special chars
    const safeFiles = files.map(f => {
      const clean = f.replace(/[^a-zA-Z0-9._\-\/]/g, '')
      return clean
    }).filter(f => f.length > 0 && !f.startsWith('/') && !f.includes('..'))
    if (safeFiles.length === 0) return "Error: No valid file paths provided."
    const filesArg = safeFiles.length === 1 && safeFiles[0] === "." ? "." : safeFiles.map(f => `"${f}"`).join(" ")
    const addArgs = safeFiles.length === 1 && safeFiles[0] === "." ? ['add', '.'] : ['add', ...safeFiles]
    await execSafe('git', addArgs, { cwd: getWorkspaceRoot(), timeout: 15000 })

    // 2. Check what's staged
    const { stdout: staged } = await execSafe('git', ['diff', '--cached', '--stat'], { cwd: getWorkspaceRoot(), timeout: 15000 })
    if (!staged.trim()) {
      return "No changes to commit. All files are already up to date."
    }

    // 3. Commit
    // Sanitize commit message - remove shell metacharacters
    const safeMessage = message.replace(/["`$\\]/g, '').replace(/\n/g, ' ').substring(0, 200)
    const { stdout: commitOut } = await execSafe('git', ['commit', '-m', safeMessage], {
      cwd: getWorkspaceRoot(),
      timeout: 30000,
    })

    // 4. Push
    // Sanitize branch name for push
    const safeBranch = (branch || '').replace(/[^a-zA-Z0-9\/_\-]/g, '')
    // SECURITY: Block pushes to protected branches
    const protectedBranches = ['main', 'master', 'production', 'release', 'staging']
    if (protectedBranches.includes(safeBranch)) {
      return `Error: Cannot push directly to protected branch "${safeBranch}". Please create a feature branch and use a pull request.`
    }
    const pushArgs = safeBranch ? ['push', 'origin', safeBranch] : ['push']
    const { stdout: pushOut } = await execSafe('git', pushArgs, { cwd: getWorkspaceRoot(), timeout: 60000 })

    return [
      `✅ Git commit & push successful!`,
      `${description ? `Description: ${description}` : ""}`,
      `Commit: ${safeMessage}`,
      `Files staged: ${filesArg}`,
      ``,
      `Commit output: ${commitOut.trim()}`,
      `Push output: ${pushOut.trim()}`,
      ``,
      `Changes are now live on GitHub.`,
    ].filter(Boolean).join("\n")
  } catch (error: any) {
    // If commit succeeded but push failed, report partial success
    if (error.message?.includes("push") || error.message?.includes("remote")) {
      return `⚠️ Commit succeeded but push failed: ${error.message}\n\nThe changes are committed locally. You can try pushing again manually.`
    }
    return `Error during git commit/push: ${error.message}`
  }
}

// ━━ Client Hunter Tool Implementations ━━

function executeScoreLead(args: { business_name: string; business_type: string; website_status?: string; location?: string; notes?: string }): string {
  const needScore = args.website_status === "no website" ? 30 : args.website_status === "outdated" ? 25 : 15
  const budgetScore = args.business_type?.match(/restaurant|retail|clinic|salon/i) ? 20 : 15
  const urgencyScore = args.website_status === "no website" ? 20 : 10
  const fitScore = 20
  const totalScore = Math.min(100, needScore + budgetScore + urgencyScore + fitScore)
  const tier = totalScore >= 80 ? "HOT" : totalScore >= 60 ? "WARM" : totalScore >= 40 ? "COOL" : "COLD"

  return JSON.stringify({
    lead: args.business_name,
    type: args.business_type,
    location: args.location || "Not specified",
    website_status: args.website_status || "Unknown",
    scores: {
      need_for_services: needScore,
      budget_potential: budgetScore,
      urgency: urgencyScore,
      fit_with_trishulhub: fitScore,
    },
    total_score: totalScore,
    tier,
    recommendation: totalScore >= 70
      ? "High priority lead - pursue immediately with personalized outreach"
      : totalScore >= 50
        ? "Good potential - add to outreach pipeline with standard approach"
        : "Lower priority - monitor and revisit when circumstances change",
  }, null, 2)
}

function executeDraftEmail(args: { recipient_business: string; recipient_name?: string; pain_point: string; service?: string; email_type: string }): string {
  const emailTemplates: Record<string, string> = {
    cold_outreach: `Subject: Enhancing ${args.recipient_business}'s Online Presence

Hi${args.recipient_name ? ` ${args.recipient_name}` : ""},

I noticed that ${args.recipient_business} could benefit from a stronger online presence. Specifically, ${args.pain_point} is something we help businesses like yours resolve every day.

At TrishulHub, we specialize in creating professional, results-driven websites and digital solutions that help businesses attract more customers and grow revenue.

Would you be open to a quick 15-minute chat about how we could help ${args.recipient_business} stand out online?

Best regards,
TrishulHub Team`,

    follow_up: `Subject: Following Up - ${args.recipient_business} Online Presence

Hi${args.recipient_name ? ` ${args.recipient_name}` : ""},

I reached out recently about helping ${args.recipient_business} with ${args.pain_point}. I wanted to follow up and share a quick insight:

Businesses that invest in professional web design see an average 68% increase in leads within the first 6 months.

I'd love to show you what we could do for ${args.recipient_business}. Would this week work for a brief call?

Best regards,
TrishulHub Team`,

    proposal: `Subject: Proposal for ${args.recipient_business} - ${args.service || 'Web Development Services'}

Hi${args.recipient_name ? ` ${args.recipient_name}` : ""},

Thank you for your interest in our ${args.service || "services"}. Based on our discussion about ${args.pain_point}, I've prepared a tailored proposal for ${args.recipient_business}.

I'd like to schedule a call to walk through the details and answer any questions. When would be convenient for you?

Best regards,
TrishulHub Team`,

    meeting_request: `Subject: Quick Chat About ${args.recipient_business}'s Digital Growth

Hi${args.recipient_name ? ` ${args.recipient_name}` : ""},

I'd love to schedule a brief meeting to discuss how TrishulHub can help ${args.recipient_business} address ${args.pain_point} and grow your online presence.

Would any of these times work?
- Tuesday 2-4 PM
- Wednesday 10 AM-12 PM
- Thursday 3-5 PM

Looking forward to connecting!

Best regards,
TrishulHub Team`,
  }

  return emailTemplates[args.email_type] || emailTemplates.cold_outreach
}

// ━━ Finance Tool Implementations ━━

function executeCalculateEstimate(args: { project_type: string; complexity: string; features?: string[]; hourly_rate?: number }): string {
  // UK agency rates (updated to realistic market rates)
  const rates: Record<string, number> = { simple: 75, moderate: 95, complex: 120, enterprise: 150 }
  const hours: Record<string, number> = { simple: 40, moderate: 80, complex: 160, enterprise: 320 }
  const rate = args.hourly_rate || rates[args.complexity] || 95
  const baseHours = hours[args.complexity] || 80
  // Feature multiplier: account for feature complexity, not just count
  const featureCount = args.features?.length || 1
  const featureMultiplier = Math.max(1, featureCount * 0.12 + (featureCount > 5 ? 0.2 : 0))
  const totalHours = Math.round(baseHours * featureMultiplier)
  const contingencyPercent = args.complexity === "enterprise" ? 0.20 : args.complexity === "complex" ? 0.18 : 0.15
  const contingency = Math.round(totalHours * contingencyPercent)
  const designHours = Math.round(totalHours * 0.25)
  const devHours = totalHours - Math.round(totalHours * 0.25) - Math.round(totalHours * 0.15) - Math.round(totalHours * 0.05) - Math.round(totalHours * 0.10)
  const testHours = Math.round(totalHours * 0.15)
  const deployHours = Math.round(totalHours * 0.05)
  const maintainHours = Math.round(totalHours * 0.10)

  return JSON.stringify({
    project_type: args.project_type,
    complexity: args.complexity,
    features: args.features || [],
    breakdown: {
      design: { hours: designHours, cost: designHours * rate },
      development: { hours: devHours, cost: devHours * rate },
      testing: { hours: testHours, cost: testHours * rate },
      deployment: { hours: deployHours, cost: deployHours * rate },
      maintenance: { hours: maintainHours, cost: maintainHours * rate },
    },
    contingency: { hours: contingency, cost: parseFloat((contingency * rate).toFixed(2)), percentage: `${Math.round(contingencyPercent * 100)}%` },
    total: {
      hours: totalHours + contingency,
      cost: parseFloat(((totalHours + contingency) * rate).toFixed(2)),
      hourly_rate: rate,
      currency: "GBP",
    },
    timeline_weeks: Math.ceil((totalHours + contingency) / 40),
  }, null, 2)
}

function executeGenerateQuotation(args: { client_name: string; project_title: string; items?: LineItem[]; payment_terms?: string; valid_days?: number; client_address?: string; project_scope?: string; deliverables?: string[]; timeline?: string }): string {
  const items = args.items || []
  const subtotal = items.reduce((sum: number, item: LineItem) => sum + (item.quantity || 1) * (item.unit_price || 0), 0)
  const vat = parseFloat((subtotal * 0.2).toFixed(2))
  const total = parseFloat((subtotal + vat).toFixed(2))

  return JSON.stringify({
    quotation: {
      quotation_number: `QUO-${Date.now().toString(36).toUpperCase()}`,
      client: args.client_name,
      client_address: args.client_address || "To be confirmed",
      project: args.project_title,
      scope: args.project_scope || args.project_title,
      deliverables: args.deliverables || items.map((i: LineItem) => i.description).filter(Boolean),
      timeline: args.timeline || "To be agreed",
      date: new Date().toISOString().split("T")[0],
      valid_until: new Date(Date.now() + (args.valid_days || 30) * 86400000).toISOString().split("T")[0],
      items: items.map((item: LineItem, i: number) => ({
        id: i + 1,
        description: item.description || "Service",
        quantity: item.quantity || 1,
        unit_price: parseFloat((item.unit_price || 0).toFixed(2)),
        total: parseFloat(((item.quantity || 1) * (item.unit_price || 0)).toFixed(2)),
      })),
      subtotal: parseFloat(subtotal.toFixed(2)),
      vat: vat,
      vat_rate: "20%",
      total: total,
      currency: "GBP",
      payment_terms: args.payment_terms || "50% upfront, 50% on completion",
      company: {
        name: "TrishulHub",
        address: "Harrow, London, UK",
        email: "info@trishulhub.in",
        website: "trishulhub.com",
      },
      terms_and_conditions: "This quotation is valid for 30 days. Prices are in GBP. VAT at 20% applies where applicable. Payment terms as stated above.",
    },
  }, null, 2)
}

function executeGenerateInvoice(args: { client_name: string; items?: LineItem[]; invoice_number?: string; due_date?: string; tax_rate?: number; payment_terms?: string; project_title?: string; client_address?: string }): string {
  const items = args.items || []
  const subtotal = items.reduce((sum: number, item: LineItem) => sum + (item.quantity || 1) * (item.unit_price || 0), 0)
  const taxRate = args.tax_rate || 20
  const tax = parseFloat((subtotal * (taxRate / 100)).toFixed(2))
  const total = parseFloat((subtotal + tax).toFixed(2))

  return JSON.stringify({
    invoice: {
      invoice_number: args.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`,
      client: args.client_name,
      client_address: args.client_address || "To be confirmed",
      project: args.project_title || "Web Development Services",
      date: new Date().toISOString().split("T")[0],
      due_date: args.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      items: items.map((item: LineItem, i: number) => ({
        id: i + 1,
        description: item.description || "Service",
        quantity: item.quantity || 1,
        unit_price: parseFloat((item.unit_price || 0).toFixed(2)),
        total: parseFloat(((item.quantity || 1) * (item.unit_price || 0)).toFixed(2)),
      })),
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: tax,
      tax_rate: `${taxRate}%`,
      total: total,
      currency: "GBP",
      payment_terms: args.payment_terms || "Payment due within 30 days of invoice date",
      bank_details: {
        bank: "To be provided",
        account_name: "TrishulHub",
        sort_code: "To be provided",
        account_number: "To be provided",
        reference: `Please quote invoice number as reference`,
      },
      company: {
        name: "TrishulHub",
        address: "Harrow, London, UK",
        email: "info@trishulhub.in",
        website: "trishulhub.com",
      },
    },
  }, null, 2)
}

function executeCalculateROI(args: { calculation_type: string; revenue: number; costs: number; timeframe_months?: number }): string {
  const { revenue, costs, timeframe_months = 12 } = args
  const profit = revenue - costs
  const roi = costs > 0 ? ((profit / costs) * 100).toFixed(1) : "N/A"
  const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "N/A"
  const monthlyProfit = timeframe_months > 0 ? parseFloat((profit / timeframe_months).toFixed(2)) : profit
  // Fix division by zero: ensure timeframe_months > 0 AND monthly profit > 0
  const monthlyProfitValue = timeframe_months > 0 ? profit / timeframe_months : 0
  const breakEvenMonths = (profit > 0 && monthlyProfitValue > 0) ? Math.ceil(costs / monthlyProfitValue) : "N/A"

  return JSON.stringify({
    calculation_type: args.calculation_type,
    revenue,
    costs,
    timeframe_months,
    results: {
      profit: profit,
      roi_percentage: roi === "N/A" ? "N/A" : `${roi}%`,
      profit_margin: profitMargin === "N/A" ? "N/A" : `${profitMargin}%`,
      monthly_profit: monthlyProfit,
      break_even_months: breakEvenMonths,
    },
    currency: "GBP",
  }, null, 2)
}

// ━━ Project Manager Tool Implementations ━━

function executeCreateTimeline(args: { project_name: string; phases?: TimelinePhase[]; start_date?: string }): string {
  const startDate = new Date(args.start_date || Date.now())
  let currentDate = new Date(startDate)

  const timelinePhases = (args.phases || []).map((phase: TimelinePhase) => {
    const phaseStart = new Date(currentDate)
    const phaseEnd = new Date(currentDate.getTime() + (phase.duration_days || 14) * 86400000)
    currentDate = new Date(phaseEnd.getTime() + 86400000) // next day
    return {
      name: phase.name,
      start: phaseStart.toISOString().split("T")[0],
      end: phaseEnd.toISOString().split("T")[0],
      duration_days: phase.duration_days || 14,
      dependencies: phase.dependencies || [],
    }
  })

  return JSON.stringify({
    project: args.project_name,
    start_date: startDate.toISOString().split("T")[0],
    estimated_end: currentDate.toISOString().split("T")[0],
    total_duration_days: Math.ceil((currentDate.getTime() - startDate.getTime()) / 86400000),
    phases: timelinePhases,
  }, null, 2)
}

function executeAssessRisks(args: { project_name: string; project_scope: string; known_concerns?: string }): string {
  const scope = (args.project_scope || "").toLowerCase()
  const concerns = args.known_concerns || "None specified"

  // Build contextual risks based on project scope
  const risks = [
    { risk: "Scope creep", probability: "Medium", impact: "High", mitigation: "Define clear scope document with sign-off, change request process with cost impact" },
    { risk: "Timeline delays", probability: "Medium", impact: "Medium", mitigation: "Build buffer into timeline, regular progress reviews, early warning system" },
    { risk: "Client communication gaps", probability: "Medium", impact: "Medium", mitigation: "Weekly status updates, single point of contact, documented decisions" },
  ]

  // Add scope-specific risks
  if (scope.includes("e-commerce") || scope.includes("ecommerce") || scope.includes("payment")) {
    risks.push({ risk: "Payment integration complexity", probability: "Medium", impact: "High", mitigation: "Use established payment providers (Stripe/PayPal), test thoroughly with sandbox, plan for PCI compliance" })
    risks.push({ risk: "Security vulnerabilities", probability: "Low", impact: "Critical", mitigation: "Security audit, HTTPS enforcement, input validation, regular dependency updates" })
  }
  if (scope.includes("api") || scope.includes("integration") || scope.includes("third-party")) {
    risks.push({ risk: "Third-party API changes or downtime", probability: "Medium", impact: "High", mitigation: "Implement fallback mechanisms, cache API responses, monitor API status, document all dependencies" })
  }
  if (scope.includes("mobile") || scope.includes("responsive")) {
    risks.push({ risk: "Cross-device compatibility issues", probability: "Medium", impact: "Medium", mitigation: "Test on multiple devices early, use progressive enhancement, establish browser support matrix" })
  }
  if (scope.includes("cms") || scope.includes("content management")) {
    risks.push({ risk: "Content migration issues", probability: "Medium", impact: "Medium", mitigation: "Audit existing content, plan migration in phases, validate migrated content thoroughly" })
  }
  if (scope.includes("real-time") || scope.includes("websocket") || scope.includes("live")) {
    risks.push({ risk: "Real-time performance and scaling", probability: "Medium", impact: "High", mitigation: "Load testing, connection pooling, graceful degradation, CDN for static assets" })
  }

  // Always include resource risk
  risks.push({ risk: "Resource availability", probability: "Low", impact: "High", mitigation: "Cross-training team members, backup resources identified, knowledge documentation" })

  // If known concerns are specified, add them as additional risks
  if (concerns !== "None specified") {
    risks.push({ risk: `Known concern: ${concerns}`, probability: "Medium", impact: "Medium", mitigation: "Address proactively, assign dedicated owner, monitor closely during execution" })
  }

  return JSON.stringify({
    project: args.project_name,
    scope: args.project_scope,
    risks,
    overall_risk_level: risks.filter(r => r.impact === "High" || r.impact === "Critical").length > 2 ? "High" : risks.filter(r => r.impact === "High" || r.impact === "Critical").length > 0 ? "Medium" : "Low",
    known_concerns: concerns,
  }, null, 2)
}

function executePlanSprint(args: { sprint_goal: string; sprint_duration_weeks?: number; team_size?: number; backlog_items?: string[] }): string {
  return JSON.stringify({
    sprint: {
      goal: args.sprint_goal,
      duration_weeks: args.sprint_duration_weeks || 2,
      team_size: args.team_size || 3,
      capacity_hours: (args.team_size || 3) * (args.sprint_duration_weeks || 2) * 30,
      backlog: (args.backlog_items || []).map((item: string, i: number) => {
        // Deterministic story points based on item description length and keywords
        const desc = (item || "").toLowerCase()
        let points = 3 // default
        if (desc.includes("fix") || desc.includes("typo") || desc.includes("text")) points = 1
        else if (desc.includes("create") || desc.includes("add") || desc.includes("build")) points = 3
        else if (desc.includes("integrate") || desc.includes("implement") || desc.includes("refactor")) points = 5
        else if (desc.includes("design") || desc.includes("architect") || desc.includes("system")) points = 5
        else if (desc.includes("migrate") || desc.includes("overhaul") || desc.includes("rewrite")) points = 8
        else if (item.length > 100) points = 5
        else if (item.length > 50) points = 3
        return {
          id: i + 1,
          description: item,
          story_points: points,
          priority: i < 2 ? "Must Have" : i < 4 ? "Should Have" : "Could Have",
        }
      }),
      definition_of_done: [
        "Code reviewed and merged",
        "Unit tests passing",
        "No critical bugs",
        "Documentation updated",
        "Product owner approval",
      ],
    },
  }, null, 2)
}

function executeEstimateEffort(args: { tasks: EffortTask[]; hourly_rate?: number }): string {
  const complexityHours: Record<string, number> = { trivial: 1, simple: 4, moderate: 8, complex: 16, unknown: 8 }
  const rate = args.hourly_rate || 40

  const estimates = (args.tasks || []).map((task: EffortTask) => {
    const hours = complexityHours[task.complexity || "unknown"] || 8
    return { task: task.name, complexity: task.complexity, estimated_hours: hours, estimated_cost: hours * rate }
  })

  const totalHours = estimates.reduce((sum: number, e) => sum + e.estimated_hours, 0)
  return JSON.stringify({ estimates, total_hours: totalHours, total_cost: totalHours * rate, currency: "GBP" }, null, 2)
}

// ━━ HR Tool Implementations ━━

function executeAnalyzeWorkload(args: { team_members: WorkloadMember[] }): string {
  const members = args.team_members || []
  const totalTasks = members.reduce((sum: number, m: WorkloadMember) => sum + (m.current_tasks || 0), 0)
  const avgTasks = members.length > 0 ? totalTasks / members.length : 0

  const analysis = members.map((m: WorkloadMember) => ({
    name: m.name,
    current_tasks: m.current_tasks || 0,
    hours_per_week: m.hours_per_week || 40,
    status: (m.current_tasks || 0) > avgTasks * 1.5 ? "OVERLOADED" : (m.current_tasks || 0) < avgTasks * 0.5 ? "UNDERUTILIZED" : "BALANCED",
    recommendation: (m.current_tasks || 0) > avgTasks * 1.5 ? "Redistribute tasks to other team members" : (m.current_tasks || 0) < avgTasks * 0.5 ? "Can take on additional tasks" : "Workload is balanced",
  }))

  return JSON.stringify({
    team_size: members.length,
    total_tasks: totalTasks,
    average_tasks_per_person: avgTasks.toFixed(1),
    analysis,
    recommendations: analysis
      .filter((a: { status: string; name?: string; recommendation?: string }) => a.status !== "BALANCED")
      .map((a: { name?: string; recommendation?: string }) => `${a.name || "Unknown"}: ${a.recommendation || "N/A"}`),
  }, null, 2)
}

function executeFindBestFit(args: { task_description: string; required_skills: string[]; priority?: string; team_members: BestFitMember[] }): string {
  const members = args.team_members || []
  const scored = members.map((m: BestFitMember) => {
    const skillMatch = (m.skills || []).filter((s: string) => args.required_skills.some((rs: string) => s.toLowerCase().includes(rs.toLowerCase()) || rs.toLowerCase().includes(s.toLowerCase()))).length
    const loadScore = { available: 3, moderate: 2, busy: 1, overloaded: 0 }[m.current_load || "moderate"] || 2
    const totalScore = skillMatch * 10 + loadScore * 5
    return { ...m, skill_match_count: skillMatch, total_score: totalScore }
  })

  scored.sort((a: { total_score: number }, b: { total_score: number }) => b.total_score - a.total_score)

  return JSON.stringify({
    task: args.task_description,
    required_skills: args.required_skills,
    priority: args.priority || "medium",
    recommendations: scored.map((m: BestFitMember & { skill_match_count: number; total_score: number }, i: number) => ({
      rank: i + 1,
      name: m.name,
      score: m.total_score,
      matched_skills: m.skill_match_count,
      availability: m.current_load || "moderate",
      reason: m.total_score > 20 ? "Best skill match with good availability" : m.total_score > 10 ? "Good match, may need support" : "Limited match, consider training",
    })),
  }, null, 2)
}

function executePlanOnboarding(args: { role: string; department?: string; start_date?: string }): string {
  const role = (args.role || "").toLowerCase()
  const dept = args.department || (role.includes("sales") || role.includes("client") ? "Sales" : role.includes("content") || role.includes("market") ? "Marketing" : "Development")

  // Role-specific onboarding activities
  const roleSpecificWeek: Record<string, string[]> = {
    dev: ["Set up development environment", "Code repository walkthrough", "Review coding standards", "Pair programming session", "First bug fix task", "CI/CD pipeline walkthrough"],
    sales: ["CRM system training", "Review current pipeline and leads", "Shadow senior sales calls", "Learn pricing and packages", "Draft first outreach email", "Client meeting etiquette training"],
    design: ["Design tool setup (Figma/Adobe)", "Brand guidelines walkthrough", "Review design system", "First design task assignment", "Portfolio review with lead designer"],
    content: ["Content management system training", "Review editorial calendar", "Brand voice guidelines", "SEO tools walkthrough", "Draft first blog post", "Social media strategy review"],
    hr: ["HR system training", "Review company policies", "Employee handbook walkthrough", "Meet with all department heads", "Review current recruitment pipeline"],
  }

  const roleKey = role.includes("dev") || role.includes("engineer") || role.includes("programmer") ? "dev"
    : role.includes("sales") || role.includes("client") || role.includes("hunter") ? "sales"
    : role.includes("design") ? "design"
    : role.includes("content") || role.includes("writer") || role.includes("market") ? "content"
    : role.includes("hr") || role.includes("human") ? "hr"
    : "dev"

  return JSON.stringify({
    role: args.role,
    department: dept,
    start_date: args.start_date || "To be confirmed",
    plan: {
      first_day: [
        "Welcome meeting with manager",
        "IT setup: laptop, email, accounts, access credentials",
        "Office/virtual tour",
        "Introduction to team members",
        "Overview of company culture and values",
        "Review team communication channels (Slack/Teams)",
      ],
      first_week: [
        ...roleSpecificWeek[roleKey] || roleSpecificWeek.dev,
        "Meet with each team member for 1:1",
        "Review current projects and priorities",
        "Weekly check-in with manager",
      ],
      first_month: [
        "Complete onboarding checklist",
        "Take ownership of a small project/task",
        "Attend team planning meetings",
        "30-day review with manager",
        "Set quarterly goals and objectives",
        "Provide onboarding feedback",
      ],
    },
  }, null, 2)
}

function executeAssessLeaveConflicts(args: { leave_requests: LeaveRequest[]; active_projects?: string[] }): string {
  const requests = args.leave_requests || []
  const projects = args.active_projects || []

  // Parse dates and check for overlapping leave between team members
  let conflictsDetected = 0
  const assessed = requests.map((r: LeaveRequest, idx: number) => {
    // Parse date ranges
    const dates = r.dates || []
    let conflictRisk = "Low"
    let overlapWith: string[] = []

    // Check if this leave overlaps with other requests
    for (let j = 0; j < requests.length; j++) {
      if (idx === j) continue
      const otherDates = requests[j].dates || []
      const overlap = dates.some((d: string) => otherDates.includes(d))
      if (overlap && r.person !== requests[j].person) {
        conflictRisk = "High"
        if (requests[j].person) overlapWith.push(requests[j].person as string)
        conflictsDetected++
      }
    }

    // Check proximity to project deadlines
    const nearDeadline = projects.length > 0
    if (nearDeadline && conflictRisk === "Low") conflictRisk = "Medium"

    return {
      person: r.person,
      dates: r.dates,
      reason: r.reason || "Not specified",
      conflict_risk: conflictRisk,
      overlap_with: overlapWith.length > 0 ? overlapWith : undefined,
      impact: overlapWith.length > 0
        ? `Overlaps with ${overlapWith.join(", ")}'s leave - may cause resource gap`
        : `May affect: ${projects.join(", ") || "No active projects identified"}`,
      recommendation: conflictRisk === "High"
        ? "Stagger leave dates or arrange temporary coverage before approval"
        : conflictRisk === "Medium"
        ? "Ensure project coverage is arranged before approval"
        : "No significant conflicts - safe to approve",
    }
  })

  return JSON.stringify({
    leave_requests: assessed,
    summary: {
      total_requests: requests.length,
      conflicts_detected: conflictsDetected,
      high_risk: assessed.filter((a: { conflict_risk: string }) => a.conflict_risk === "High").length,
      recommendation: conflictsDetected > 0
        ? "Resolve overlapping leave dates before approval. Consider staggered leave or temporary coverage."
        : "Review each request against project deadlines before approval",
    },
  }, null, 2)
}

// ━━ Content Tool Implementations ━━

function executeDraftContent(args: { title: string; content_type: string; platform?: string; tone?: string; key_points?: string[]; call_to_action?: string }): string {
  const platformFormats: Record<string, any> = {
    instagram: { max_length: 2200, format: "Visual + Caption", hashtag_count: "15-30" },
    linkedin: { max_length: 3000, format: "Professional Article/Post", hashtag_count: "3-5" },
    twitter: { max_length: 280, format: "Concise Tweet", hashtag_count: "1-3" },
    facebook: { max_length: 63206, format: "Engaging Post", hashtag_count: "1-2" },
    website: { max_length: "Unlimited", format: "SEO-Optimized Page", hashtag_count: "N/A" },
    email: { max_length: "Recommended 200 words", format: "Personalized Email", hashtag_count: "N/A" },
  }

  const format = platformFormats[args.platform || ""] || platformFormats.website

  // Generate actual content body based on platform and key points
  const keyPoints = args.key_points || ["Professional web design services", "Custom solutions", "Affordable pricing"]
  const cta = args.call_to_action || "Contact TrishulHub today for a free consultation!"
  const title = args.title || "Untitled"
  const tone = args.tone || "professional"
  const businessName = "TrishulHub"

  let contentBody = ""
  if (args.platform === "twitter") {
    contentBody = `${title}\n\n${keyPoints.slice(0, 2).join(". ")}. ${cta}\n\n#WebDesign #TrishulHub`
  } else if (args.platform === "instagram") {
    contentBody = `${title}\n\n${keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}\n\n${cta}\n\n#WebDesign #DigitalAgency #${businessName} #WebDevelopment #SmallBusiness #UKBusiness #WebsiteDesign #DigitalMarketing`
  } else if (args.platform === "linkedin") {
    contentBody = `${title}\n\n${keyPoints.map((p: string) => `- ${p}`).join("\n")}\n\nAt ${businessName}, we help businesses establish a powerful online presence. Whether you need a new website, a redesign, or digital marketing support, we are here to help.\n\n${cta}\n\n#WebDesign #DigitalAgency #${businessName}`
  } else if (args.platform === "email") {
    contentBody = `Subject: ${title}\n\nHi [Client Name],\n\n${keyPoints.map((p: string) => `- ${p}`).join("\n")}\n\n${cta}\n\nBest regards,\n${businessName} Team\ninfo@trishulhub.in | trishulhub.com`
  } else {
    // Website / default
    contentBody = `# ${title}\n\n${keyPoints.map((p: string, i: number) => `## ${p}\n\nDetailed content about ${p.toLowerCase()} goes here. This section should be expanded with specific examples, data points, and relevant information.`).join("\n\n")}\n\n## Get Started\n\n${cta}`
  }

  return JSON.stringify({
    content_draft: {
      title: args.title,
      content_type: args.content_type,
      platform: args.platform,
      tone: tone,
      body: contentBody,
      key_points: keyPoints,
      call_to_action: cta,
      format_guidelines: format,
      suggested_hashtags: args.platform === "instagram" ? ["#WebDesign", "#DigitalAgency", "#TrishulHub", "#WebDevelopment", "#SmallBusiness", "#UKBusiness"] : ["#WebDesign", "#TrishulHub"],
      next_steps: [
        "Review and customize the content body",
        "Add specific images/graphics",
        "Personalize with client/business details",
        "Schedule for optimal posting time",
        "Submit for approval before publishing",
      ],
    },
  }, null, 2)
}

function executeCreateContentCalendar(args: { duration_weeks: number; content_themes: string[]; platforms?: string[]; posting_frequency?: string }): string {
  const themes = args.content_themes || []
  const platforms = args.platforms || ["instagram", "linkedin", "twitter"]
  const weeks = args.duration_weeks || 2
  const frequency = args.posting_frequency || "3x_week"

  const calendar: { week: number; posts: { day: string; platform: string; theme: string; topic: string }[] }[] = []
  const daysMap: Record<string, number[]> = {
    daily: [1, 2, 3, 4, 5],
    "3x_week": [1, 3, 5],
    "2x_week": [1, 4],
    weekly: [1],
  }
  const postingDays = daysMap[frequency] || [1, 3, 5]

  for (let w = 0; w < weeks; w++) {
    for (const day of postingDays) {
      const themeIdx = (w * postingDays.length + postingDays.indexOf(day)) % themes.length
      const platformIdx = (w + day) % platforms.length
      const selectedPlatform = platforms[platformIdx]
      calendar.push({
        week: w + 1,
        posts: [{
          day: `Day ${day}`,
          platform: selectedPlatform,
          theme: themes[themeIdx] || "General content",
          topic: `${themes[themeIdx] || "General"} content for ${selectedPlatform}`,
        }],
      })
    }
  }

  return JSON.stringify({
    calendar: {
      duration_weeks: weeks,
      platforms,
      frequency,
      total_posts: calendar.length,
      entries: calendar,
    },
  }, null, 2)
}

// ━━ Support Tool Implementations ━━

function executeTroubleshootIssue(args: { issue_description: string; platform?: string; severity?: string }): string {
  const troubleshootingGuides: Record<string, string[]> = {
    website: [
      "Check if the website is accessible from different devices/browsers",
      "Verify DNS records are pointing to the correct server",
      "Check SSL certificate status and expiration",
      "Review server logs for error messages",
      "Clear browser cache and try again",
      "Check hosting server status and resource usage",
      "Verify recent code deployments or changes",
      "Test database connectivity",
    ],
    email: [
      "Verify email account credentials are correct",
      "Check incoming/outgoing server settings (IMAP/SMTP)",
      "Verify DNS MX records are properly configured",
      "Check if email quota is exceeded",
      "Review spam filter settings and blocked lists",
      "Test with a different email client",
      "Check for email forwarding rules",
      "Verify SSL/TLS settings",
    ],
    hosting: [
      "Check hosting account status and billing",
      "Verify server resource usage (CPU, RAM, disk)",
      "Review error logs for server issues",
      "Check if maintenance is scheduled",
      "Verify DNS propagation status",
      "Test server response time and uptime",
      "Review .htaccess/server configuration",
    ],
    domain: [
      "Verify domain registration is active and not expired",
      "Check DNS records (A, CNAME, MX, TXT)",
      "Verify nameservers are correctly configured",
      "Check domain propagation status globally",
      "Review WHOIS information for accuracy",
      "Test domain accessibility from different locations",
    ],
    dns: [
      "Verify DNS record types and values",
      "Check DNS propagation across global servers",
      "Verify nameserver configuration",
      "Review TTL (Time to Live) settings",
      "Test DNS resolution with dig/nslookup",
      "Check for conflicting DNS records",
    ],
  }

  const steps = troubleshootingGuides[args.platform || ""] || troubleshootingGuides.website
  const severityOrder: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 }

  return JSON.stringify({
    issue: args.issue_description,
    platform: args.platform,
    severity: args.severity || "medium",
    troubleshooting_steps: steps.map((step: string, i: number) => ({
      step: i + 1,
      action: step,
      expected_outcome: "Issue identified and resolved, or escalated if persistent",
    })),
    escalation_threshold: args.severity === "critical" ? "3 steps" : "5 steps",
    estimated_resolution_time: args.severity === "critical" ? "1-2 hours" : args.severity === "high" ? "2-4 hours" : "4-8 hours",
  }, null, 2)
}

function executeDraftClientResponse(args: { client_name: string; issue_summary: string; resolution: string; tone?: string }): string {
  const toneTemplates: Record<string, string> = {
    helpful: `Dear ${args.client_name},

Thank you for reaching out regarding ${args.issue_summary}.

${args.resolution}

If you need any further assistance, please don't hesitate to contact us. We're here to help!

Best regards,
TrishulHub Support Team`,

    empathetic: `Dear ${args.client_name},

I completely understand how frustrating ${args.issue_summary} must be, and I'm sorry for the inconvenience this has caused.

${args.resolution}

We value you as a client, and I want to assure you that we're committed to resolving this fully. Please let me know if there's anything else I can help with.

Warm regards,
TrishulHub Support Team`,

    technical: `Dear ${args.client_name},

Regarding the reported issue: ${args.issue_summary}

Technical Resolution:
${args.resolution}

If you encounter any further technical difficulties, please provide the error details and we'll investigate promptly.

Best regards,
TrishulHub Technical Support`,

    follow_up: `Dear ${args.client_name},

I'm following up on the issue you reported: ${args.issue_summary}

${args.resolution}

Has everything been working well since our last interaction? If you're still experiencing any issues, please let me know and I'll be happy to assist further.

Best regards,
TrishulHub Support Team`,
  }

  return toneTemplates[args.tone || ""] || toneTemplates.helpful
}

function executeAssessEscalation(args: { issue_description: string; client_impact: string; attempts_made?: string }): string {
  const impactPriority: Record<string, number> = { revenue_loss: 1, service_down: 2, minor_inconvenience: 3, cosmetic: 4 }
  const priority = impactPriority[args.client_impact] || 3
  const shouldEscalate = priority <= 2

  return JSON.stringify({
    issue: args.issue_description,
    client_impact: args.client_impact,
    attempts_made: args.attempts_made || "Standard troubleshooting completed",
    escalation_decision: shouldEscalate ? "ESCALATE TO DEV TEAM" : "HANDLE WITHIN SUPPORT",
    urgency: priority <= 1 ? "CRITICAL - Immediate attention required" : priority <= 2 ? "HIGH - Address within 4 hours" : "MEDIUM - Address within 24 hours",
    escalation_brief: shouldEscalate ? {
      to: "Dev Agent / Development Team",
      reason: `Client impact level: ${args.client_impact}`,
      issue_summary: args.issue_description,
      troubleshooting_completed: args.attempts_made || "Standard steps completed",
      recommended_action: "Investigate root cause, implement fix, and deploy",
    } : null,
  }, null, 2)
}
