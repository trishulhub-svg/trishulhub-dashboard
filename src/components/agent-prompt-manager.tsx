"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"

interface Prompt {
  id: string
  agentId: string
  title: string
  content: string
  isActive: boolean
  isDefault: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface AgentPromptManagerProps {
  agentId: string
  agentName: string
  agentType: string
  userRole: string // SUPER_ADMIN, ADMIN, DEVELOPER
}

export default function AgentPromptManager({ agentId, agentName, agentType, userRole }: AgentPromptManagerProps) {
  const [open, setOpen] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  const fetchPrompts = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/agents/autonomy/prompts?agentId=${agentId}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to fetch prompts")
      }
      const data = await res.json()
      setPrompts(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch prompts"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (open) fetchPrompts()
  }, [open, fetchPrompts])

  const handleActivate = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch("/api/agents/autonomy/prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action: "activate" }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to activate prompt")
      }
      toast.success("Prompt activated")
      await fetchPrompts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to activate prompt"
      toast.error(message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleEdit = (prompt: Prompt) => {
    setEditingId(prompt.id)
    setEditTitle(prompt.title)
    setEditContent(prompt.content)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    if (!editTitle.trim()) {
      toast.error("Title is required")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/agents/autonomy/prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: editingId, action: "edit", title: editTitle.trim(), content: editContent }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update prompt")
      }
      toast.success("Prompt updated")
      setEditingId(null)
      await fetchPrompts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update prompt"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const prompt = prompts.find(p => p.id === id)
    const name = prompt?.title || "this prompt"
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return

    setActionLoading(id)
    try {
      const res = await fetch(`/api/agents/autonomy/prompts?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete prompt")
      }
      toast.success("Prompt deleted")
      await fetchPrompts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete prompt"
      toast.error(message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error("Title is required")
      return
    }
    if (newContent.trim().length < 10) {
      toast.error("Content must be at least 10 characters")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/agents/autonomy/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          title: newTitle.trim(),
          content: newContent.trim(),
          makeActive: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create prompt")
      }
      toast.success("Prompt created and activated")
      setNewTitle("")
      setNewContent("")
      setCreating(false)
      await fetchPrompts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create prompt"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // Show button only for admin users
  if (!isAdminUser) return null

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-900/30 transition-colors"
      >
        Manage Prompts
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { setOpen(false); setEditingId(null); setCreating(false) }}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Autonomous Prompts
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {agentName} — Configure what the agent does when running autonomously
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); setEditingId(null); setCreating(false) }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-400 mb-4">
                  <p className="font-medium mb-1">Error loading prompts</p>
                  <p>{error}</p>
                  <button
                    onClick={fetchPrompts}
                    className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loading && !error && (
                <div className="space-y-3">
                  {prompts.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No prompts found for this agent.
                      </p>
                    </div>
                  )}

                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className={`rounded-lg border p-4 transition-colors ${
                        prompt.isActive
                          ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white text-sm">
                              {prompt.title}
                            </span>
                            {prompt.isActive && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                Active
                              </span>
                            )}
                            {prompt.isDefault && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                                System Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {prompt.content.substring(0, 150)}{prompt.content.length > 150 ? "..." : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!prompt.isActive && (
                            <button
                              onClick={() => handleActivate(prompt.id)}
                              disabled={actionLoading === prompt.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === prompt.id ? "..." : "Activate"}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(prompt)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors"
                          >
                            Edit
                          </button>
                          {!prompt.isDefault && (
                            <button
                              onClick={() => handleDelete(prompt.id)}
                              disabled={actionLoading === prompt.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === prompt.id ? "..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Editor */}
                      {editingId === prompt.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-3">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            placeholder="Prompt title"
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            disabled={prompt.isDefault}
                            rows={6}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Prompt instructions for autonomous mode"
                          />
                          {prompt.isDefault && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              <svg className="w-3 h-3 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              Default prompt content is permanent and cannot be modified. Only the title can be changed.
                            </p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Create New Prompt */}
                  {!creating ? (
                    <button
                      onClick={() => setCreating(true)}
                      className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:border-violet-500 dark:hover:text-violet-400 transition-colors"
                    >
                      + Create New Prompt
                    </button>
                  ) : (
                    <div className="border border-violet-200 dark:border-violet-800 rounded-lg p-4 bg-violet-50/50 dark:bg-violet-900/10 space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New Custom Prompt</h4>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        placeholder="e.g., Lead Scoring Focus Mode"
                      />
                      <textarea
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y"
                        placeholder="Describe what this agent should focus on when running autonomously..."
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setCreating(false); setNewTitle(""); setNewContent("") }}
                          className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreate}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                        >
                          {saving ? "Creating..." : "Create & Activate"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 shrink-0">
              Only one prompt can be active at a time. The agent uses the active prompt during autonomous thinking cycles.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
