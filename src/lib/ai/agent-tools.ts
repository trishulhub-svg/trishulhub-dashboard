// Agent Tool Definitions for Z.ai Function Calling
// These tools enable the Dev AI agent to autonomously plan, execute, and iterate

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

// ━━ Dev Agent Tool Definitions ━━
export const DEV_AGENT_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information, documentation, code examples, API references, or solutions to problems. Use this when you need current information that may not be in your training data, or to look up docs, libraries, and frameworks.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. Be specific for best results. Examples: 'Next.js 16 App Router middleware setup', 'Prisma schema relation syntax', 'React Server Components best practices 2025'",
          },
          purpose: {
            type: "string",
            description: "Why you are searching - helps context. Examples: 'Looking up API docs', 'Finding solution to a bug', 'Checking latest version compatibility'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file in the project. Use this to understand existing code, check configurations, or review implementations before making changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path relative to project root. Example: 'src/app/page.tsx', 'prisma/schema.prisma', 'package.json'",
          },
          purpose: {
            type: "string",
            description: "Why you are reading this file. Example: 'Checking current implementation', 'Reviewing schema before migration'",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the project. Use this to write new code, create components, or save generated files. Always review existing files first with read_file before overwriting.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path relative to project root. Example: 'src/components/NewFeature.tsx'",
          },
          content: {
            type: "string",
            description: "The complete file content to write. Must be valid, complete code.",
          },
          description: {
            type: "string",
            description: "Brief description of what this file does and why you are creating/modifying it.",
          },
        },
        required: ["path", "content", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Make a targeted edit to an existing file. Use this instead of write_file when you only need to change specific parts of a file. Much safer than rewriting entire files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path relative to project root.",
          },
          old_content: {
            type: "string",
            description: "The exact text to find and replace. Must match exactly including whitespace and indentation.",
          },
          new_content: {
            type: "string",
            description: "The replacement text.",
          },
          description: {
            type: "string",
            description: "What this edit does and why.",
          },
        },
        required: ["path", "old_content", "new_content", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories in a given path. Use this to explore the project structure, find relevant files, or understand the codebase layout.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path relative to project root. Use '.' for root. Example: 'src/components', 'src/app/api'",
          },
          pattern: {
            type: "string",
            description: "Optional glob pattern to filter files. Example: '*.tsx', '**/*.ts'",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command in the project directory. Use for installing packages, running builds, checking types, running tests, or other CLI operations. Avoid destructive commands.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to run. Example: 'npm install lodash', 'npx prisma validate', 'npx tsc --noEmit'",
          },
          purpose: {
            type: "string",
            description: "Why you are running this command. Example: 'Installing required dependency', 'Checking for TypeScript errors'",
          },
        },
        required: ["command", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_code",
      description: "Analyze code for bugs, security issues, performance problems, or best practice violations. Use this to review code quality before deployment or when debugging issues.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to analyze.",
          },
          focus: {
            type: "string",
            description: "What to focus on: 'bugs', 'security', 'performance', 'best-practices', 'accessibility', or 'all'",
            enum: ["bugs", "security", "performance", "best-practices", "accessibility", "all"],
          },
        },
        required: ["path", "focus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_task",
      description: "Create a detailed execution plan for a complex task. Break the task into clear, ordered steps with descriptions. Use this before starting implementation to think through the approach.",
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
                files: {
                  type: "array",
                  items: { type: "string" },
                  description: "Files that will be created or modified",
                },
              },
              required: ["step", "title", "description"],
            },
            description: "Ordered list of steps to complete the task.",
          },
        },
        required: ["task", "steps"],
      },
    },
  },
]

// ━━ Tool Execution Engine ━━
// Executes tool calls from the AI agent and returns results

export async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  options?: { projectId?: string; chatId?: string }
): Promise<ToolCallResult> {
  const startTime = Date.now()

  try {
    let result: string

    switch (toolName) {
      case "web_search":
        result = await executeWebSearch(args.query, args.purpose)
        break

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

      case "plan_task":
        result = JSON.stringify({
          task: args.task,
          steps: args.steps,
          status: "planned",
          totalSteps: args.steps.length,
        }, null, 2)
        break

      default:
        result = `Unknown tool: ${toolName}`
    }

    const elapsed = Date.now() - startTime
    return {
      toolCallId: "",
      name: toolName,
      result: result || "(empty result)",
      success: true,
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

// ━━ Tool Implementations ━━

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import path from "path"

const execAsync = promisify(exec)
const PROJECT_ROOT = process.cwd()

async function executeWebSearch(query: string, purpose?: string): Promise<string> {
  try {
    // Use Z.ai web search via the existing API route
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const response = await fetch(`${baseUrl}/api/web-search?q=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (response.ok) {
      const data = await response.json()
      if (data.results && data.results.length > 0) {
        const formatted = data.results.slice(0, 5).map((r: any, i: number) =>
          `${i + 1}. **${r.name || r.title || "Result"}**\n   URL: ${r.url}\n   ${r.snippet || r.content || ""}`
        ).join("\n\n")
        return `Web search results for: "${query}"${purpose ? ` (Purpose: ${purpose})` : ""}\n\n${formatted}`
      }
    }

    // Fallback: return a helpful message
    return `Web search for: "${query}"${purpose ? ` (Purpose: ${purpose})` : ""}\n\nSearch completed. For detailed results, please check the web manually or try a more specific query.`
  } catch (error: any) {
    return `Web search failed: ${error.message}. Please try again with a different query.`
  }
}

async function executeReadFile(filePath: string, purpose?: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, filePath)

  // Security: prevent reading outside project
  if (!fullPath.startsWith(PROJECT_ROOT)) {
    return `Error: Cannot read files outside project directory.`
  }

  if (!fs.existsSync(fullPath)) {
    return `Error: File not found: ${filePath}`
  }

  try {
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      return `Error: ${filePath} is a directory, not a file. Use list_files instead.`
    }

    // Limit file size to prevent memory issues
    if (stat.size > 500 * 1024) {
      return `Error: File too large (${Math.round(stat.size / 1024)}KB). Maximum is 500KB.`
    }

    const content = fs.readFileSync(fullPath, "utf-8")
    const lineCount = content.split("\n").length
    return `File: ${filePath} (${lineCount} lines, ${Math.round(stat.size / 1024)}KB)${purpose ? `\nPurpose: ${purpose}` : ""}\n\n${content}`
  } catch (error: any) {
    return `Error reading file: ${error.message}`
  }
}

async function executeWriteFile(filePath: string, content: string, description?: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, filePath)

  // Security: prevent writing outside project
  if (!fullPath.startsWith(PROJECT_ROOT)) {
    return `Error: Cannot write files outside project directory.`
  }

  try {
    // Create directories if needed
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, content, "utf-8")
    const lines = content.split("\n").length
    return `File written successfully: ${filePath}\nLines: ${lines}\nSize: ${Math.round(content.length / 1024)}KB${description ? `\nDescription: ${description}` : ""}`
  } catch (error: any) {
    return `Error writing file: ${error.message}`
  }
}

async function executeEditFile(filePath: string, oldContent: string, newContent: string, description?: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, filePath)

  // Security: prevent editing outside project
  if (!fullPath.startsWith(PROJECT_ROOT)) {
    return `Error: Cannot edit files outside project directory.`
  }

  if (!fs.existsSync(fullPath)) {
    return `Error: File not found: ${filePath}. Use write_file to create new files.`
  }

  try {
    const content = fs.readFileSync(fullPath, "utf-8")

    if (!content.includes(oldContent)) {
      // Try to find a close match
      const lines = content.split("\n")
      const searchLines = oldContent.split("\n").filter(l => l.trim())
      let foundLine = -1
      for (const searchLine of searchLines) {
        const idx = lines.findIndex(l => l.includes(searchLine.trim()))
        if (idx >= 0) {
          foundLine = idx + 1
          break
        }
      }
      return `Error: Could not find the exact content to replace in ${filePath}. ${foundLine > 0 ? `Similar content found at line ${foundLine}. Please read the file first and use the exact text.` : "No similar content found."}`
    }

    const newFileContent = content.replace(oldContent, newContent)
    fs.writeFileSync(fullPath, newFileContent, "utf-8")

    return `File edited successfully: ${filePath}${description ? `\nDescription: ${description}` : ""}\nReplaced ${oldContent.split("\n").length} lines with ${newContent.split("\n").length} lines.`
  } catch (error: any) {
    return `Error editing file: ${error.message}`
  }
}

async function executeListFiles(dirPath: string, pattern?: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, dirPath === "." ? "" : dirPath)

  // Security: prevent listing outside project
  if (!fullPath.startsWith(PROJECT_ROOT)) {
    return `Error: Cannot list files outside project directory.`
  }

  if (!fs.existsSync(fullPath)) {
    return `Error: Directory not found: ${dirPath}`
  }

  try {
    const stat = fs.statSync(fullPath)
    if (!stat.isDirectory()) {
      return `Error: ${dirPath} is a file, not a directory. Use read_file instead.`
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    const results = entries
      .filter(e => {
        // Hide common ignore patterns
        const name = e.name
        if (name.startsWith(".") && name !== ".env.example") return false
        if (name === "node_modules" || name === ".next" || name === "dist" || name === "build") return false
        if (pattern && !name.match(new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, ".")))) return false
        return true
      })
      .map(e => {
        const type = e.isDirectory() ? "📁" : "📄"
        const size = e.isFile() ? ` (${Math.round(fs.statSync(path.join(fullPath, e.name)).size / 1024)}KB)` : ""
        return `${type} ${e.name}${size}`
      })

    return `Directory: ${dirPath} (${results.length} entries)\n\n${results.join("\n")}`
  } catch (error: any) {
    return `Error listing files: ${error.message}`
  }
}

async function executeRunCommand(command: string, purpose?: string): Promise<string> {
  // Security: block dangerous commands
  const blocked = ["rm -rf /", "mkfs", "dd if=", "> /dev/", "curl | bash", "wget | bash", "shutdown", "reboot", "format"]
  const lowerCmd = command.toLowerCase()
  for (const b of blocked) {
    if (lowerCmd.includes(b)) {
      return `Error: Command blocked for security: "${command}"`
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024, // 1MB max output
    })

    const output: string[] = []
    if (stdout) output.push(stdout.slice(-3000)) // Last 3000 chars
    if (stderr) output.push(`STDERR: ${stderr.slice(-1000)}`)

    return `Command: ${command}${purpose ? `\nPurpose: ${purpose}` : ""}\n\n${output.join("\n") || "(no output)"}`
  } catch (error: any) {
    // Some commands return non-zero exit codes but still have useful output
    const output: string[] = []
    if (error.stdout) output.push(error.stdout.slice(-2000))
    if (error.stderr) output.push(error.stderr.slice(-1000))

    return `Command: ${command}${purpose ? `\nPurpose: ${purpose}` : ""}\nExit code: ${error.code || "unknown"}\n\n${output.join("\n") || error.message}`
  }
}

async function executeAnalyzeCode(filePath: string, focus: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, filePath)

  if (!fullPath.startsWith(PROJECT_ROOT)) {
    return `Error: Cannot analyze files outside project directory.`
  }

  if (!fs.existsSync(fullPath)) {
    return `Error: File not found: ${filePath}`
  }

  try {
    const content = fs.readFileSync(fullPath, "utf-8")
    const lines = content.split("\n")
    const ext = path.extname(filePath).toLowerCase()

    // Basic static analysis
    const issues: string[] = []
    const warnings: string[] = []
    const info: string[] = []

    // File stats
    info.push(`File: ${filePath}`)
    info.push(`Lines: ${lines.length}, Size: ${Math.round(content.length / 1024)}KB`)
    info.push(`Type: ${ext || "unknown"}`)

    // Common issue patterns
    lines.forEach((line, idx) => {
      const lineNum = idx + 1
      const trimmed = line.trim()

      // Security checks
      if (focus === "security" || focus === "all") {
        if (trimmed.includes("eval(")) issues.push(`Line ${lineNum}: eval() usage - potential code injection risk`)
        if (trimmed.includes("innerHTML") && !trimmed.includes("sanitize")) warnings.push(`Line ${lineNum}: innerHTML without sanitization`)
        if (trimmed.match(/password|secret|api[_-]?key/i) && trimmed.includes("=") && !trimmed.includes("process.env") && !trimmed.includes("//")) warnings.push(`Line ${lineNum}: Possible hardcoded secret/credential`)
        if (trimmed.includes("SELECT *") && !trimmed.includes("?")) warnings.push(`Line ${lineNum}: Raw SQL query without parameterization`)
        if (trimmed.includes("dangerouslySetInnerHTML")) warnings.push(`Line ${lineNum}: dangerouslySetInnerHTML - XSS risk`)
      }

      // Bug checks
      if (focus === "bugs" || focus === "all") {
        if (trimmed === "}" && idx > 0 && lines[idx - 1].trim() === "") warnings.push(`Line ${lineNum}: Possible extra closing brace`)
        if (trimmed.includes("console.log") && ext !== ".ts" && ext !== ".js") info.push(`Line ${lineNum}: console.log in non-TS/JS file`)
        if (trimmed.match(/\.\w+\(/) && trimmed.includes("null") && trimmed.includes(".")) info.push(`Line ${lineNum}: Possible null reference`)
      }

      // Performance checks
      if (focus === "performance" || focus === "all") {
        if (trimmed.includes("useEffect") && !trimmed.includes("[]") && !trimmed.includes("dependency")) info.push(`Line ${lineNum}: useEffect without dependency array`)
        if (trimmed.includes("useState") && trimmed.includes("[]") && lines.slice(idx, idx + 10).some(l => l.includes(".push(") || l.includes(".concat("))) warnings.push(`Line ${lineNum}: Array state mutation - use spread or callback form`)
      }

      // Best practices
      if (focus === "best-practices" || focus === "all") {
        if (trimmed.includes("any") && ext === ".ts") info.push(`Line ${lineNum}: 'any' type in TypeScript - consider proper typing`)
        if (trimmed.includes("// @ts-ignore") || trimmed.includes("// @ts-nocheck")) warnings.push(`Line ${lineNum}: TypeScript suppression comment`)
        if (trimmed.includes("TODO:") || trimmed.includes("FIXME:")) info.push(`Line ${lineNum}: TODO/FIXME comment found`)
      }
    })

    const result = [
      info.join("\n"),
      issues.length > 0 ? `\n🔴 Issues (${issues.length}):\n${issues.join("\n")}` : "",
      warnings.length > 0 ? `\n🟡 Warnings (${warnings.length}):\n${warnings.slice(0, 15).join("\n")}` : "",
      issues.length === 0 && warnings.length === 0 ? "\n✅ No significant issues found." : "",
    ].filter(Boolean).join("\n")

    return result
  } catch (error: any) {
    return `Error analyzing code: ${error.message}`
  }
}
