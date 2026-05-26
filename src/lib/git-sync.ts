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

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
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

    if (response.status === 409) {
      // Conflict: file may have changed since last read — try once more with SHA
      const getRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
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
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "TrishulHub-CRM",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `${message} (retry)`,
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

      return {
        ok: false,
        status: 409,
        error: "Conflict and could not resolve SHA",
      };
    }

    if (!response.ok) {
      const errBody = await response.text();
      return { ok: false, status: response.status, error: errBody };
    }

    return { ok: true, status: response.status };
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
 *   _archive/                      ← Any pre-existing repo files (moved here on first sync)
 *   projects/index.json            ← Master index with summary & project list
 *   projects/{slug}/project.json   ← Project metadata
 *   projects/{slug}/team.json      ← Team members for the project
 *   projects/{slug}/tasks.json     ← Tasks for the project
 *
 * FIRST-TIME BEHAVIOR:
 *   When lastSyncAt is null (never synced before), the system:
 *   1. Scans the repo root for existing files
 *   2. Archives important pre-existing files to _archive/
 *   3. Deletes any old projects/ folder
 *   4. Creates _sync-info.json to mark setup as done
 *   5. Then proceeds with the normal full sync
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
    //    When lastSyncAt is null, this is the very first sync.
    //    We scan the repo for existing files, archive anything important,
    //    delete our old projects/ folder, then start fresh.
    const isFirstSync = !config.lastSyncAt;
    if (isFirstSync) {
      console.log(`[git-sync] ⚡ First-time sync detected — scanning repo contents...`);
      await firstTimeRepoSetup(token, owner, repo, branch);
    }

    // ── 5. Query projects (with client info) ──────────────────────────────
    console.log(
      `[git-sync] Starting sync to ${owner}/${repo} (branch: ${branch})${isFirstSync ? " [FIRST SYNC]" : ""}`
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
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
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

// ─── First-time repo setup ──────────────────────────────────────────────────
/**
 * On the very first sync, scan the repo and clean it up:
 * 1. List all files/folders in the repo root
 * 2. Move any pre-existing non-projects content to _archive/ (one level deep)
 * 3. Delete any existing projects/ folder content (our old data, if any)
 * 4. Create _sync-info.json to mark setup as done
 *
 * This only runs ONCE when lastSyncAt is null.
 * After this, subsequent syncs just update files in-place.
 */
async function firstTimeRepoSetup(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  try {
    // List repo root contents
    const rootResult = await githubGet(token, owner, repo, "", branch);
    if (!rootResult.ok || !Array.isArray(rootResult.data)) {
      // Repo might be empty — that's fine, nothing to clean
      console.log(`[git-sync] Repo is empty or cannot list root — skipping cleanup`);
      return;
    }

    const rootItems: any[] = rootResult.data;
    const dirsToDelete: Array<{ path: string; sha: string }> = [];
    const itemsToArchive: Array<{ path: string; sha: string; type: string }> = [];

    for (const item of rootItems) {
      const name = item.name;

      // Our own managed folder — always clean on first sync
      if (name === "projects") {
        dirsToDelete.push({ path: item.path, sha: item.sha });
        continue;
      }

      // Skip hidden GitHub files, _archive folder, and common top-level files
      if (
        name.startsWith(".") ||
        name === "_archive" ||
        name === "README" ||
        name === "LICENSE" ||
        name === ".gitignore" ||
        name === ".github" ||
        name === "_sync-info.json"
      ) {
        continue;
      }

      // Everything else is pre-existing content — archive it
      itemsToArchive.push({ path: item.path, sha: item.sha, type: item.type });
    }

    // Archive pre-existing files (move them to _archive/)
    for (const item of itemsToArchive) {
      console.log(`[git-sync] Archiving existing item: ${item.path} (${item.type})`);
      if (item.type === "file") {
        // Read file content, then re-create under _archive/
        const fileResult = await githubGet(token, owner, repo, item.path, branch);
        if (fileResult.ok && fileResult.data?.content) {
          let fileContent: string;
          try {
            fileContent = Buffer.from(fileResult.data.content, "base64").toString("utf-8");
          } catch {
            fileContent = fileResult.data.content;
          }
          const archivePath = `_archive/${item.path}`;
          const putRes = await githubPut(
            token, owner, repo, archivePath, fileContent, branch,
            `Archive: move ${item.path} to _archive (first-time setup)`
          );
          if (putRes.ok) {
            await githubDelete(
              token, owner, repo, item.path, item.sha, branch,
              `Remove original after archiving: ${item.path}`
            );
            console.log(`[git-sync] Archived ${item.path} → _archive/${item.path}`);
          }
        }
      } else if (item.type === "dir") {
        // For directories, archive each file inside
        const dirResult = await githubGet(token, owner, repo, item.path, branch);
        if (dirResult.ok && Array.isArray(dirResult.data)) {
          for (const subItem of dirResult.data) {
            if (subItem.type === "file") {
              const subFileResult = await githubGet(token, owner, repo, subItem.path, branch);
              if (subFileResult.ok && subFileResult.data?.content) {
                let fileContent: string;
                try {
                  fileContent = Buffer.from(subFileResult.data.content, "base64").toString("utf-8");
                } catch {
                  fileContent = subFileResult.data.content;
                }
                const archivePath = `_archive/${subItem.path}`;
                const putRes = await githubPut(
                  token, owner, repo, archivePath, fileContent, branch,
                  `Archive: move ${subItem.path} to _archive (first-time setup)`
                );
                if (putRes.ok) {
                  await githubDelete(
                    token, owner, repo, subItem.path, subItem.sha, branch,
                    `Remove original after archiving: ${subItem.path}`
                  );
                }
              }
            }
          }
          // Try to delete the now-empty directory entry
          await githubDelete(
            token, owner, repo, item.path, item.sha, branch,
            `Remove empty dir after archiving: ${item.path}`
          );
          console.log(`[git-sync] Archived directory ${item.path} → _archive/${item.path}/`);
        }
      }
    }

    // Delete existing projects/ folder recursively (our old data)
    for (const item of dirsToDelete) {
      console.log(`[git-sync] Cleaning up existing projects/ folder...`);
      const dirResult = await githubGet(token, owner, repo, item.path, branch);
      if (dirResult.ok && Array.isArray(dirResult.data)) {
        // Collect all files recursively using BFS
        const filesToDelete: { path: string; sha: string }[] = [];
        const queue = [...dirResult.data];
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (current.type === "file") {
            filesToDelete.push({ path: current.path, sha: current.sha });
          } else if (current.type === "dir") {
            const subResult = await githubGet(token, owner, repo, current.path, branch);
            if (subResult.ok && Array.isArray(subResult.data)) {
              queue.push(...subResult.data);
            }
          }
        }
        // Delete all files
        for (const file of filesToDelete) {
          await githubDelete(
            token, owner, repo, file.path, file.sha, branch,
            `Clean old projects data: ${file.path}`
          );
        }
        console.log(`[git-sync] Deleted ${filesToDelete.length} file(s) from old projects/ folder`);
      }
      // Also delete the folder entry itself
      await githubDelete(
        token, owner, repo, item.path, item.sha, branch,
        `Clean old projects folder: ${item.path}`
      );
    }

    // Create _sync-info.json to mark that setup is complete
    const syncInfo = {
      setupDate: new Date().toISOString(),
      managedBy: "TrishulHub-CRM",
      version: "1.0",
      structure: "projects/{slug}/{project,team,tasks}.json",
      note: "This repo is auto-managed. Do not manually edit files in the projects/ folder.",
    };
    await githubPut(
      token, owner, repo, "_sync-info.json",
      JSON.stringify(syncInfo, null, 2),
      branch,
      "Initialize TrishulHub sync metadata"
    );
    console.log(`[git-sync] ✓ First-time setup complete — repo is ready for sync`);
  } catch (err: any) {
    console.error(`[git-sync] First-time setup error (non-fatal): ${err?.message || err}`);
    // Don't fail the whole sync — first-time setup is best-effort
  }
}
