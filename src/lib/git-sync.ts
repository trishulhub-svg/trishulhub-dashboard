import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse a GitHub repo URL into { owner, repo } */
function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    // Supports: https://github.com/owner/repo, git@github.com:owner/repo.git, owner/repo
    const httpsMatch = repoUrl.match(
      /github\.com\/([^/]+)\/([^/\s#?]+?)(\.git)?\s*$/
    );
    if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

    const sshMatch = repoUrl.match(
      /git@github\.com:([^/]+)\/([^/\s#?]+?)(\.git)?\s*$/
    );
    if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

    const shorthand = repoUrl.match(/^([^/\s]+)\/([^/\s#?]+)$/);
    if (shorthand) return { owner: shorthand[1], repo: shorthand[2] };

    return null;
  } catch {
    return null;
  }
}

// ─── GitHub API helpers ─────────────────────────────────────────────────────

async function githubGet(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const url = path
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
      : `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "TrishulHub-CRM",
      },
    });
    if (!response.ok) {
      return { ok: false, error: `GET ${path} failed: ${response.status}` };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function githubDelete(
  token: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  branch: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "TrishulHub-CRM",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, sha, branch }),
      }
    );
    if (!response.ok) {
      const errBody = await response.text();
      return { ok: false, error: errBody };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function githubPut(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string,
  message: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base64Content = Buffer.from(content, "utf-8").toString("base64");

  /** Helper: fetch current file SHA and retry the PUT */
  const retryWithSha = async (retryMessage: string): Promise<{ ok: boolean; status: number; error?: string }> => {
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "TrishulHub-CRM",
        },
      }
    );

    if (getRes.ok) {
      const fileData = await getRes.json();
      const retryRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "TrishulHub-CRM",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: retryMessage,
            content: base64Content,
            branch,
            sha: fileData.sha,
          }),
        }
      );

      if (!retryRes.ok) {
        const errBody = await retryRes.text();
        return { ok: false, status: retryRes.status, error: errBody };
      }
      return { ok: true, status: retryRes.status };
    }

    const status = getRes.status;
    if (status === 404) {
      // File doesn't exist — original PUT should have worked as a create.
      // Something else is wrong; return original error.
      return { ok: false, status, error: `Could not resolve SHA: file not found at ${path}` };
    }
    return { ok: false, status, error: `Could not resolve SHA: GET returned ${status}` };
  };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "TrishulHub-CRM",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content: base64Content,
          branch,
        }),
      }
    );

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    // 422 = "sha wasn't supplied" → file already exists, fetch SHA and retry
    // 409 = Conflict → file changed, fetch latest SHA and retry
    if (response.status === 422 || response.status === 409) {
      console.log(`[git-sync] File ${path} returned ${response.status} — fetching SHA and retrying...`);
      return retryWithSha(`${message} (update)`);
    }

    const errBody = await response.text();
    return { ok: false, status: response.status, error: errBody };
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Test the GitHub connection by fetching repo info.
 */
export async function testGitConnection(config: {
  repoUrl: string;
  tokenEncrypted: string;
  tokenIv: string;
  tokenTag: string;
}): Promise<{ success: boolean; error?: string; repoName?: string }> {
  try {
    await ensureProtocolTables();

    let token: string;
    try {
      token = decrypt(config.tokenEncrypted, config.tokenIv, config.tokenTag);
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to decrypt token: ${err?.message || String(err)}`,
      };
    }

    if (!token) {
      return { success: false, error: "Decrypted token is empty" };
    }

    const parsed = parseRepoUrl(config.repoUrl);
    if (!parsed) {
      return {
        success: false,
        error: `Invalid GitHub repo URL: ${config.repoUrl}`,
      };
    }

    const { owner, repo } = parsed;

    console.log(`[git-sync] Testing connection to ${owner}/${repo}...`);
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "TrishulHub-CRM",
        },
      }
    );

    if (response.status === 401) {
      return {
        success: false,
        error: "Authentication failed: invalid or expired token",
      };
    }

    if (response.status === 404) {
      return {
        success: false,
        error: `Repository ${owner}/${repo} not found or token lacks access`,
      };
    }

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `GitHub API error (${response.status}): ${body}`,
      };
    }

    const repoData = await response.json();
    console.log(`[git-sync] Connection successful: ${repoData.full_name}`);

    return { success: true, repoName: repoData.full_name };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[git-sync] Connection test failed:`, message);
    return { success: false, error: message };
  }
}

/**
 * Main sync function — reads ALL projects, team members, and tasks from DB
 * and pushes a structured folder layout to GitHub.
 *
 * Structure pushed:
 *   _sync-info.json                ← Metadata about this sync (created on first sync)
 *   projects/index.json            ← Master index with summary & project list
 *   projects/{slug}/project.json   ← Project metadata
 *   projects/{slug}/team.json      ← Team members for the project
 *   projects/{slug}/tasks.json     ← Tasks for the project
 *
 * CLEANUP BEHAVIOR:
 *   The system checks for _sync-info.json in the repo. If it doesn't exist,
 *   the repo is cleaned up using the Git Trees API (instant, 1 commit) —
 *   all unmanaged files/folders are removed, keeping only:
 *   projects/, _archive/, .gitignore, README.md, LICENSE
 *
 * SUBSEQUENT SYNCS:
 *   Just update files in-place. No cleanup needed.
 *
 * NEVER throws — always catches errors and returns them gracefully.
 */
export async function syncTasksToGit(): Promise<{
  success: boolean;
  error?: string;
  filesUpdated?: number;
}> {
  try {
    await ensureProtocolTables();

    // ── 1. Get config from DB ──────────────────────────────────────────────
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT * FROM "TaskGitConfig" LIMIT 1`
    );

    if (!rows.length) {
      console.log("[git-sync] No TaskGitConfig row found — skipping sync");
      return { success: false, error: "Git sync not configured" };
    }

    const config = rows[0];

    // SQLite stores booleans as 0/1 — handle both
    if (!config.isEnabled || config.isEnabled === 0) {
      console.log("[git-sync] Git sync is disabled — skipping");
      return { success: false, error: "Git sync is disabled" };
    }

    if (!config.repoUrl) {
      return { success: false, error: "Repository URL not configured" };
    }

    // ── 1.5 DEDUPLICATION: skip if a sync is already running or completed recently ──
    const lastStatus = config.lastSyncStatus as string | null;
    const lastSync = config.lastSyncAt ? new Date(config.lastSyncAt) : null;
    const now = Date.now();

    if (lastStatus === 'PENDING' && lastSync && (now - lastSync.getTime()) < 60000) {
      console.log("[git-sync] Sync already in progress (PENDING < 60s ago) — skipping");
      return { success: true, filesUpdated: 0, error: "Sync already in progress" };
    }

    if (lastStatus === 'SUCCESS' && lastSync && (now - lastSync.getTime()) < 15000) {
      console.log("[git-sync] Sync completed recently (< 15s ago) — skipping to avoid API rate limits");
      return { success: true, filesUpdated: 0, error: "Recently synced" };
    }

    // ── 2. Load encryption key from DB if stored ────────────────────────
    //    The saveConfig route stores the key in DB. We must load it here
    //    so that decrypt() can find it in process.env.ENCRYPTION_KEY.
    if (config.encryptionKey && config.encryptionKey.length === 64) {
      process.env.ENCRYPTION_KEY = config.encryptionKey;
      console.log("[git-sync] Loaded encryption key from DB config");
    }

    // ── 3. Decrypt token ──────────────────────────────────────────────────
    let token: string;
    try {
      token = decrypt(config.tokenEncrypted, config.tokenIv, config.tokenTag);
    } catch (err: any) {
      const errMsg = `Failed to decrypt token: ${err?.message || String(err)}`;
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    if (!token) {
      const errMsg = "Decrypted token is empty";
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    // ── 4. Parse repo URL ─────────────────────────────────────────────────
    const parsed = parseRepoUrl(config.repoUrl);
    if (!parsed) {
      const errMsg = `Invalid GitHub repo URL: ${config.repoUrl}`;
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    const { owner, repo } = parsed;
    const branch = config.branch || "main";

    // ── 4.5 FIRST-TIME SYNC: cleanup existing repo content ────────────────
    //    Uses Git Trees API for instant cleanup (1 commit, no file-by-file).
    //    Checks for _sync-info.json in the repo instead of relying on lastSyncAt
    //    (which might have been set by a previous partial/timed-out sync).
    const needsCleanup = await checkRepoNeedsCleanup(token, owner, repo, branch);
    if (needsCleanup) {
      console.log(`[git-sync] ⚡ Repo needs cleanup — using Git Trees API...`);
      await fastRepoCleanup(token, owner, repo, branch);
    }

    // ── 5. Query projects (with client info) ──────────────────────────────
    console.log(
      `[git-sync] Starting sync to ${owner}/${repo} (branch: ${branch})${needsCleanup ? " [CLEANUP DONE]" : ""}`
    );

    let projects: any[];
    try {
      projects = await db.$queryRawUnsafe(
        `SELECT p.id, p.name, p.description, p.status, p.progress, p.deadline, p.budget, p."createdAt", p."updatedAt",
                c.name as "clientName", c.email as "clientEmail", c.company as "clientCompany"
         FROM "Project" p
         LEFT JOIN "Client" c ON p."clientId" = c.id`
      );
    } catch (err: any) {
      const errMsg = `Failed to query projects: ${err?.message || String(err)}`;
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    // ── 6. Query team members per project ──────────────────────────────────
    let teamMembers: any[];
    try {
      teamMembers = await db.$queryRawUnsafe(
        `SELECT pm."projectId", pm."userId", pm.role as "projectRole", pm."createdAt" as "addedAt",
                u.name, u.email, u.role, u.department
         FROM "ProjectMember" pm
         LEFT JOIN "User" u ON pm."userId" = u.id`
      );
    } catch (err: any) {
      const errMsg = `Failed to query team members: ${err?.message || String(err)}`;
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    // ── 7. Query tasks (with assignee details) ─────────────────────────────
    let tasks: any[];
    try {
      tasks = await db.$queryRawUnsafe(
        `SELECT t.id, t.title, t.description, t."projectId", t."assignedTo", t."assigneeType", t.status, t.priority, t.deadline, t."completedAt", t."approvedBy", t."approvedAt", t."createdAt", t."updatedAt",
                u.name as "assigneeName", u.id as "assigneeId"
         FROM "Task" t
         LEFT JOIN "User" u ON t."assignedTo" = u.id`
      );
    } catch (err: any) {
      const errMsg = `Failed to query tasks: ${err?.message || String(err)}`;
      console.error(`[git-sync] ${errMsg}`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        errMsg,
        config.id
      );
      return { success: false, error: errMsg };
    }

    // ── 8. Build data structures ──────────────────────────────────────────

    // Count tasks by status globally
    const tasksByStatus: Record<string, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      AWAITING_APPROVAL: 0,
      DONE: 0,
    };
    for (const task of tasks) {
      const s = task.status as string;
      if (s in tasksByStatus) {
        tasksByStatus[s]++;
      }
    }

    // Build per-project lookups
    const tasksByProject = new Map<string, any[]>();
    for (const task of tasks) {
      const pid = task.projectId;
      if (!tasksByProject.has(pid)) tasksByProject.set(pid, []);
      tasksByProject.get(pid)!.push(task);
    }

    const teamByProject = new Map<string, any[]>();
    for (const member of teamMembers) {
      const pid = member.projectId;
      if (!teamByProject.has(pid)) teamByProject.set(pid, []);
      teamByProject.get(pid)!.push(member);
    }

    // Count unique team members across all projects (deduplicated by userId)
    const uniqueMemberIds = new Set<string>();
    for (const member of teamMembers) {
      if (member.userId) uniqueMemberIds.add(member.userId);
    }

    const timestamp = new Date().toISOString();
    let filesUpdated = 0;
    const errors: string[] = [];

    // ── 9. Build and push projects/index.json ─────────────────────────────
    const indexProjects = projects.map((p: any) => {
      const slug = slugify(p.name) || p.id;
      const projectTasks = tasksByProject.get(p.id) || [];
      const projectTeam = teamByProject.get(p.id) || [];
      return {
        slug,
        name: p.name,
        status: p.status,
        progress: p.progress,
        teamCount: projectTeam.length,
        taskCount: projectTasks.length,
        deadline: p.deadline || null,
        client: p.clientName || null,
      };
    });

    const indexData = {
      lastUpdated: timestamp,
      summary: {
        totalProjects: projects.length,
        totalTeamMembers: uniqueMemberIds.size,
        totalTasks: tasks.length,
        tasksByStatus,
      },
      projects: indexProjects,
    };

    console.log(
      `[git-sync] Pushing projects/index.json (${projects.length} projects, ${uniqueMemberIds.size} team members, ${tasks.length} tasks)...`
    );
    const indexResult = await githubPut(
      token,
      owner,
      repo,
      "projects/index.json",
      JSON.stringify(indexData, null, 2),
      branch,
      `Sync projects index - ${timestamp}`
    );

    if (indexResult.ok) {
      filesUpdated++;
      console.log(`[git-sync] ✓ projects/index.json pushed`);
    } else {
      const errMsg = `Failed to push projects/index.json: ${indexResult.error}`;
      console.error(`[git-sync] ${errMsg}`);
      errors.push(errMsg);
    }

    // ── 10. Push individual project files ──────────────────────────────────
    for (const project of projects) {
      const slug = slugify(project.name) || project.id;
      const projectTasks = tasksByProject.get(project.id) || [];
      const projectTeam = teamByProject.get(project.id) || [];

      // --- project.json ---
      const projectData = {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        progress: project.progress,
        deadline: project.deadline || null,
        budget: project.budget,
        client: {
          name: project.clientName || null,
          email: project.clientEmail || null,
          company: project.clientCompany || null,
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };

      console.log(
        `[git-sync] Pushing projects/${slug}/project.json...`
      );
      const projectResult = await githubPut(
        token,
        owner,
        repo,
        `projects/${slug}/project.json`,
        JSON.stringify(projectData, null, 2),
        branch,
        `Sync project "${project.name}" - ${timestamp}`
      );

      if (projectResult.ok) {
        filesUpdated++;
        console.log(`[git-sync] ✓ projects/${slug}/project.json pushed`);
      } else {
        const errMsg = `Failed to push projects/${slug}/project.json: ${projectResult.error}`;
        console.error(`[git-sync] ${errMsg}`);
        errors.push(errMsg);
      }

      // --- team.json ---
      const teamData = {
        lastUpdated: timestamp,
        projectSlug: slug,
        projectName: project.name,
        members: projectTeam.map((m: any) => ({
          userId: m.userId,
          name: m.name || null,
          email: m.email || null,
          role: m.role || null,
          projectRole: m.projectRole || "MEMBER",
          department: m.department || null,
          addedAt: m.addedAt || null,
        })),
      };

      console.log(
        `[git-sync] Pushing projects/${slug}/team.json (${teamData.members.length} members)...`
      );
      const teamResult = await githubPut(
        token,
        owner,
        repo,
        `projects/${slug}/team.json`,
        JSON.stringify(teamData, null, 2),
        branch,
        `Sync team for "${project.name}" - ${timestamp}`
      );

      if (teamResult.ok) {
        filesUpdated++;
        console.log(`[git-sync] ✓ projects/${slug}/team.json pushed`);
      } else {
        const errMsg = `Failed to push projects/${slug}/team.json: ${teamResult.error}`;
        console.error(`[git-sync] ${errMsg}`);
        errors.push(errMsg);
      }

      // --- tasks.json ---
      const tasksData = {
        lastUpdated: timestamp,
        projectSlug: slug,
        projectName: project.name,
        tasks: projectTasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assignee: t.assignedTo
            ? {
                id: t.assignedTo,
                name: t.assigneeName || null,
                type: t.assigneeType || "HUMAN",
              }
            : null,
          deadline: t.deadline || null,
          completedAt: t.completedAt || null,
          approvedBy: t.approvedBy || null,
          approvedAt: t.approvedAt || null,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      };

      console.log(
        `[git-sync] Pushing projects/${slug}/tasks.json (${tasksData.tasks.length} tasks)...`
      );
      const tasksResult = await githubPut(
        token,
        owner,
        repo,
        `projects/${slug}/tasks.json`,
        JSON.stringify(tasksData, null, 2),
        branch,
        `Sync tasks for "${project.name}" - ${timestamp}`
      );

      if (tasksResult.ok) {
        filesUpdated++;
        console.log(`[git-sync] ✓ projects/${slug}/tasks.json pushed`);
      } else {
        const errMsg = `Failed to push projects/${slug}/tasks.json: ${tasksResult.error}`;
        console.error(`[git-sync] ${errMsg}`);
        errors.push(errMsg);
      }
    }

    // ── 11. Update sync status in DB ──────────────────────────────────────
    if (errors.length === 0) {
      console.log(
        `[git-sync] ✓ Sync complete — ${filesUpdated} file(s) updated`
      );
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncAt" = ?, "lastSyncStatus" = 'SUCCESS', "lastSyncError" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        timestamp,
        config.id
      );
      return { success: true, filesUpdated };
    } else if (filesUpdated > 0) {
      const combinedError = errors.join("; ");
      console.warn(
        `[git-sync] Partial sync — ${filesUpdated} file(s) updated, ${errors.length} error(s)`
      );
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncAt" = ?, "lastSyncStatus" = 'PARTIAL', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        timestamp,
        combinedError,
        config.id
      );
      return {
        success: true,
        filesUpdated,
        error: `${errors.length} file(s) failed: ${combinedError}`,
      };
    } else {
      const combinedError = errors.join("; ");
      console.error(`[git-sync] ✗ Sync failed — all files failed`);
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncAt" = ?, "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        timestamp,
        combinedError,
        config.id
      );
      return { success: false, error: combinedError };
    }
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[git-sync] Unexpected error:`, message);

    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT id FROM "TaskGitConfig" LIMIT 1`
      );
      if (rows.length) {
        await db.$executeRawUnsafe(
          `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
          message,
          rows[0].id
        );
      }
    } catch {
      // If even updating the DB fails, just log and return
    }

    return { success: false, error: message };
  }
}

// ─── Repo cleanup using Git Trees API (instant, 1 commit) ────────────────

/** Items to keep at the repo root during cleanup */
const KEEP_ROOT_ITEMS = new Set([
  "projects", "_archive", "_sync-info.json",
  "worklogs", "sessions", "blueprints",
  ".gitignore", ".github", "README.md", "LICENSE",
]);

/** GitHub API helper for the Git Trees API */
async function gitApi(
  method: string,
  token: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "TrishulHub-CRM",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.github.com${path}`, opts);
  return res.json();
}

/**
 * Check if the repo needs cleanup by looking for _sync-info.json.
 * If it doesn't exist, this is an unmanaged repo that needs cleanup.
 */
async function checkRepoNeedsCleanup(
  token: string, owner: string, repo: string, branch: string,
): Promise<boolean> {
  try {
    const result = await githubGet(token, owner, repo, "_sync-info.json", branch);
    // If file not found (404), repo needs cleanup
    return !result.ok;
  } catch {
    return true;
  }
}

/**
 * Fast repo cleanup using the Git Data API (Trees + Commits).
 * Deletes ALL files/folders except our managed ones in a SINGLE commit.
 * This replaces the old file-by-file approach that could take 100+ API calls.
 */
async function fastRepoCleanup(
  token: string, owner: string, repo: string, branch: string,
): Promise<void> {
  try {
    // 1. Get current commit SHA
    const ref = await gitApi("GET", token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (!ref.object?.sha) {
      console.log("[git-sync] Cannot get branch ref — skipping cleanup");
      return;
    }
    const commitSha = ref.object.sha;

    // 2. Get the commit's tree
    const commit = await gitApi("GET", token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);
    if (!commit.tree?.sha) {
      console.log("[git-sync] Cannot get commit tree — skipping cleanup");
      return;
    }
    const treeSha = commit.tree.sha;

    // 3. Get full recursive tree
    const tree = await gitApi("GET", token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
    if (!tree.tree || !Array.isArray(tree.tree)) {
      console.log("[git-sync] Cannot list tree — skipping cleanup");
      return;
    }

    // 4. Filter: keep only items whose top-level folder is in our keep list
    const keptItems = tree.tree.filter(
      (item: any) => KEEP_ROOT_ITEMS.has(item.path.split("/")[0])
    );
    const removedCount = tree.tree.length - keptItems.length;

    if (removedCount === 0) {
      console.log("[git-sync] Repo is already clean — no cleanup needed");
      return;
    }

    console.log(
      `[git-sync] Cleanup: keeping ${keptItems.length} items, removing ${removedCount} items`
    );

    // 5. Create new tree (WITHOUT base_tree = full replacement)
    const treeEntries = keptItems.map((item: any) => ({
      path: item.path,
      mode: item.mode,
      type: item.type,
      sha: item.sha,
    }));

    const newTree = await gitApi("POST", token, `/repos/${owner}/${repo}/git/trees`, {
      tree: treeEntries,
    });
    if (!newTree.sha) {
      console.error("[git-sync] Failed to create new tree:", JSON.stringify(newTree).slice(0, 300));
      return;
    }

    // 6. Create commit
    const newCommit = await gitApi("POST", token, `/repos/${owner}/${repo}/git/commits`, {
      message: "chore: TrishulHub sync — cleanup repo, remove unmanaged files",
      tree: newTree.sha,
      parents: [commitSha],
    });
    if (!newCommit.sha) {
      console.error("[git-sync] Failed to create commit:", JSON.stringify(newCommit).slice(0, 300));
      return;
    }

    // 7. Update branch ref
    const updated = await gitApi("PATCH", token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: newCommit.sha,
    });
    if (!updated.object?.sha) {
      console.error("[git-sync] Failed to update ref:", JSON.stringify(updated).slice(0, 300));
      return;
    }

    console.log(
      `[git-sync] ✓ Repo cleaned: ${removedCount} items removed in 1 commit (${newCommit.sha.slice(0, 7)})`
    );

    // 8. Create _sync-info.json to mark repo as managed
    const syncInfo = {
      setupDate: new Date().toISOString(),
      managedBy: "TrishulHub-CRM",
      version: "2.0",
      structure: "projects/{slug}/{project,team,tasks}.json",
      note: "This repo is auto-managed by TrishulHub CRM. Do not manually edit files in the projects/ folder.",
    };
    const putResult = await githubPut(
      token, owner, repo, "_sync-info.json",
      JSON.stringify(syncInfo, null, 2), branch,
      "Initialize TrishulHub sync metadata"
    );
    if (putResult.ok) {
      console.log(`[git-sync] ✓ _sync-info.json created — repo is now managed`);
    }
  } catch (err: any) {
    console.error(`[git-sync] Fast cleanup error (non-fatal): ${err?.message || err}`);
  }
}
