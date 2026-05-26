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
 * Used by the settings UI to validate the configured credentials.
 */
export async function testGitConnection(config: {
  repoUrl: string;
  tokenEncrypted: string;
  tokenIv: string;
  tokenTag: string;
}): Promise<{ success: boolean; error?: string; repoName?: string }> {
  try {
    await ensureProtocolTables();

    // Decrypt the token
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

    // Parse the repo URL
    const parsed = parseRepoUrl(config.repoUrl);
    if (!parsed) {
      return {
        success: false,
        error: `Invalid GitHub repo URL: ${config.repoUrl}`,
      };
    }

    const { owner, repo } = parsed;

    // Fetch repo info from GitHub
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
 * Main sync function — reads ALL tasks from DB and pushes to GitHub.
 * Called automatically when tasks change.
 * Runs asynchronously (fire-and-forget from the caller).
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

    if (!config.isEnabled) {
      console.log("[git-sync] Git sync is disabled — skipping");
      return { success: false, error: "Git sync is disabled" };
    }

    if (!config.repoUrl) {
      return { success: false, error: "Repository URL not configured" };
    }

    // ── 2. Decrypt token ──────────────────────────────────────────────────
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

    // ── 3. Parse repo URL ─────────────────────────────────────────────────
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

    // ── 4. Query all projects and tasks ────────────────────────────────────
    console.log(
      `[git-sync] Starting sync to ${owner}/${repo} (branch: ${branch})`
    );

    let projects: any[];
    let tasks: any[];

    try {
      projects = await db.$queryRawUnsafe(
        `SELECT p.id, p.name, p.status, p.deadline, p.progress, p.budget FROM "Project" p`
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

    try {
      tasks = await db.$queryRawUnsafe(
        `SELECT t.id, t.title, t.description, t."projectId", t."assignedTo", t."assigneeType", t.status, t.priority, t.deadline, t."completedAt", t."approvedBy", t."approvedAt", t."createdAt", t."updatedAt", u.name as "assigneeName" FROM "Task" t LEFT JOIN "User" u ON t."assignedTo" = u.id`
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

    // ── 5. Build the JSON structure ────────────────────────────────────────
    const byStatus: Record<string, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      AWAITING_APPROVAL: 0,
      DONE: 0,
    };

    // Count tasks by status
    for (const task of tasks) {
      const s = task.status as string;
      if (s in byStatus) {
        byStatus[s]++;
      }
    }

    const gitContent: any = {
      lastUpdated: new Date().toISOString(),
      summary: {
        totalProjects: projects.length,
        totalTasks: tasks.length,
        byStatus,
      },
      projects: {} as Record<string, any>,
    };

    // Group tasks by project
    for (const project of projects) {
      const slug = slugify(project.name) || project.id;
      const projectTasks = tasks.filter(
        (t: any) => t.projectId === project.id
      );

      gitContent.projects[slug] = {
        id: project.id,
        name: project.name,
        status: project.status,
        progress: project.progress,
        deadline: project.deadline,
        budget: project.budget,
        tasks: projectTasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assignee: t.assigneeName || null,
          assigneeType: t.assigneeType || null,
          deadline: t.deadline,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          completedAt: t.completedAt,
          approvedBy: t.approvedBy,
          approvedAt: t.approvedAt,
        })),
      };
    }

    const timestamp = new Date().toISOString();
    let filesUpdated = 0;
    const errors: string[] = [];

    // ── 6. Push master index ───────────────────────────────────────────────
    console.log(
      `[git-sync] Pushing /tasks/index.json (${tasks.length} tasks across ${projects.length} projects)...`
    );
    const indexResult = await githubPut(
      token,
      owner,
      repo,
      "tasks/index.json",
      JSON.stringify(gitContent, null, 2),
      branch,
      `Sync tasks - ${timestamp}`
    );

    if (indexResult.ok) {
      filesUpdated++;
      console.log(`[git-sync] ✓ tasks/index.json pushed`);
    } else {
      const errMsg = `Failed to push tasks/index.json: ${indexResult.error}`;
      console.error(`[git-sync] ${errMsg}`);
      errors.push(errMsg);
    }

    // ── 7. Push individual project files ───────────────────────────────────
    for (const [slug, projectData] of Object.entries(gitContent.projects)) {
      const projectTasks = (projectData as any).tasks as any[];
      console.log(
        `[git-sync] Pushing /tasks/${slug}/tasks.json (${projectTasks.length} tasks)...`
      );

      const result = await githubPut(
        token,
        owner,
        repo,
        `tasks/${slug}/tasks.json`,
        JSON.stringify(projectData, null, 2),
        branch,
        `Sync project "${(projectData as any).name}" - ${timestamp}`
      );

      if (result.ok) {
        filesUpdated++;
        console.log(`[git-sync] ✓ tasks/${slug}/tasks.json pushed`);
      } else {
        const errMsg = `Failed to push tasks/${slug}/tasks.json: ${result.error}`;
        console.error(`[git-sync] ${errMsg}`);
        errors.push(errMsg);
      }
    }

    // ── 8. Update sync status in DB ───────────────────────────────────────
    if (errors.length === 0) {
      // Full success
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
      // Partial success — some files pushed, some failed
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
      // Complete failure
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
    // Top-level catch — this should never happen, but just in case
    const message = err?.message || String(err);
    console.error(`[git-sync] Unexpected error:`, message);

    // Try to update the DB status if possible
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
