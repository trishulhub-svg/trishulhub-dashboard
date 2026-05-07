"use client"

import { useState } from "react"

interface AgentHierarchyControlProps {
  agentId: string
  enabled: boolean
  status: string
  startedBy: string | null
  startedByRole: string | null
  userRole: string
  onToggle: (agentId: string, enabled: boolean) => Promise<{ success: boolean; error?: string; code?: string }>
}

export default function AgentHierarchyControl({
  agentId,
  enabled,
  status,
  startedBy,
  startedByRole,
  userRole,
  onToggle,
}: AgentHierarchyControlProps) {
  const [loading, setLoading] = useState(false)
  const [lockError, setLockError] = useState("")

  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  const isRunning = enabled && status === "RUNNING"
  const isError = status === "ERROR"

  // Check if this agent is locked by an admin
  const isAdminLocked = startedByRole === "SUPER_ADMIN" || startedByRole === "ADMIN"
  const canToggle = isAdminUser || !isAdminLocked

  const handleToggle = async () => {
    setLoading(true)
    setLockError("")

    // If user wants to START and agent is admin-locked, block non-admin users
    if (!enabled && isAdminLocked && !isAdminUser) {
      const roleName = startedByRole === "SUPER_ADMIN" ? "Super Admin" : "Admin"
      setLockError(`Started by ${roleName} — cannot override`)
      setLoading(false)
      return
    }

    try {
      const result = await onToggle(agentId, !enabled)
      if (!result.success) {
        if (result.code === "ADMIN_LOCKED") {
          setLockError(result.error || "Cannot override admin-started agent")
        } else {
          setLockError(result.error || "Failed to toggle")
        }
      }
    } catch {
      setLockError("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const getStartedByLabel = () => {
    if (!startedBy) return null
    const roleLabel = startedByRole === "SUPER_ADMIN" ? "Super Admin" : startedByRole === "ADMIN" ? "Admin" : startedByRole || "User"
    return `Started by ${roleLabel}`
  }

  const getTitle = () => {
    if (!canToggle && !enabled) return "Cannot override — agent was started by admin"
    if (isRunning) return "Pause agent"
    return "Start agent"
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={(e) => { e.stopPropagation(); handleToggle() }}
        disabled={loading || (!canToggle && !enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isRunning ? "bg-green-500" : isError ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"
        } ${!canToggle && !enabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        title={getTitle()}
        aria-label={getTitle()}
        role="switch"
        aria-checked={isRunning}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isRunning ? "translate-x-6" : "translate-x-1"
          }`}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
          </div>
        )}
      </button>

      {lockError && (
        <span className="text-xs text-red-500 dark:text-red-400" title={lockError}>
          <svg className="w-3.5 h-3.5 inline-block mr-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Locked
        </span>
      )}

      {!lockError && getStartedByLabel() && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {getStartedByLabel()}
        </span>
      )}
    </div>
  )
}
