import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"

const ALL_PROJECTS_CHAT_KEY = "__all_projects__"
const SELECTED_PROJECTS_CHAT_KEY_PREFIX = "__selected_projects__"

const toKey = (value) => (value === null || value === undefined ? "" : String(value).trim())

const uniqueNonEmpty = (values) => Array.from(new Set(values.map(toKey).filter(Boolean)))

const getProjectKey = (project) =>
  project?.id ?? project?.project_id ?? project?.projectId ?? project?.uuid ?? project?.name ?? null

const getProjectIdentifiers = (project) =>
  uniqueNonEmpty([
    project?.id,
    project?.project_id,
    project?.projectId,
    project?.uuid,
    project?.name,
    project?.project_name,
  ])

const getEntryIdentifiers = (entry) =>
  uniqueNonEmpty([
    entry?.project_id,
    entry?.projectId,
    entry?.project_uuid,
    entry?.project_name,
    entry?.project,
    entry?.project?.id,
    entry?.project?.project_id,
    entry?.project?.projectId,
    entry?.project?.name,
  ])

const entryBelongsToProject = (entry, project) => {
  const entryIds = getEntryIdentifiers(entry)
  const projectIds = getProjectIdentifiers(project)
  return entryIds.some((id) => projectIds.includes(id))
}

export default function ProjectQA({ user, projects, onOpenProjectLog }) {
  const [qaScope, setQaScope] = useState("all")
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedProjectIds, setSelectedProjectIds] = useState([])
  const [chatQuestion, setChatQuestion] = useState("")
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState("")
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false)
  const [projectEntries, setProjectEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((project) => String(getProjectKey(project)) === String(selectedProjectId)),
    [projects, selectedProjectId]
  )
  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.includes(String(getProjectKey(project)))),
    [projects, selectedProjectIds]
  )
  const isAllProjectsMode = qaScope === "all"
  const isSingleProjectMode = qaScope === "single"
  const isSelectedProjectsMode = qaScope === "selected"

  const selectedProjectIdsKey = useMemo(() => [...selectedProjectIds].sort().join(","), [selectedProjectIds])
  const selectedProjectsChatKey = `${SELECTED_PROJECTS_CHAT_KEY_PREFIX}:${selectedProjectIdsKey}`
  const chatThreadProjectId = isAllProjectsMode
    ? ALL_PROJECTS_CHAT_KEY
    : isSelectedProjectsMode
      ? selectedProjectsChatKey
      : String(selectedProjectId || "")

  const isScopeSelectionValid = isAllProjectsMode
    || (isSingleProjectMode && Boolean(selectedProjectId) && Boolean(selectedProject))
    || (isSelectedProjectsMode && selectedProjectIds.length >= 2 && selectedProjectIds.length <= 3)

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId("")
      setSelectedProjectIds([])
      setChatMessages([])
      return
    }

    const selectedStillExists = projects.some(
      (project) => String(getProjectKey(project)) === String(selectedProjectId)
    )

    if (!selectedProjectId || !selectedStillExists) {
      const firstProjectKey = getProjectKey(projects[0])
      setSelectedProjectId(firstProjectKey ? String(firstProjectKey) : "")
    }

    const validIds = new Set(projects.map((project) => String(getProjectKey(project) || "")))
    setSelectedProjectIds((currentIds) => {
      const nextIds = currentIds.filter((projectId) => validIds.has(projectId)).slice(0, 3)
      return nextIds.length === currentIds.length && nextIds.every((id, index) => id === currentIds[index])
        ? currentIds
        : nextIds
    })
  }, [projects, selectedProjectId])

  useEffect(() => {
    if (!isSelectedProjectsMode || projects.length === 0) return

    setSelectedProjectIds((currentIds) => {
      if (currentIds.length >= 2) return currentIds.slice(0, 3)

      const topIds = projects
        .map((project) => String(getProjectKey(project) || ""))
        .filter(Boolean)
        .slice(0, 3)

      return topIds.length >= 2 ? topIds : currentIds
    })
  }, [isSelectedProjectsMode, projects])

  useEffect(() => {
    if (!isAllProjectsMode && !isSingleProjectMode && !isSelectedProjectsMode) {
      setProjectEntries([])
      setEntriesLoading(false)
      return
    }

    if (isSingleProjectMode && (!selectedProjectId || !selectedProject)) {
      setProjectEntries([])
      setEntriesLoading(false)
      return
    }

    if (isSelectedProjectsMode && selectedProjects.length === 0) {
      setProjectEntries([])
      setEntriesLoading(false)
      return
    }

    let isCancelled = false

    const loadEntries = async () => {
      setEntriesLoading(true)
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .order("created_at", { ascending: false })

      if (isCancelled) {
        return
      }

      if (error) {
        setChatError(error.message)
        setProjectEntries([])
      } else {
        const projectByIdentifier = new Map()
        projects.forEach((project) => {
          const identifiers = getProjectIdentifiers(project)
          identifiers.forEach((id) => {
            projectByIdentifier.set(id, project)
          })
        })

        const entriesWithProject = (data || []).map((entry) => {
          const entryProject = getEntryIdentifiers(entry)
            .map((id) => projectByIdentifier.get(id))
            .find(Boolean)

          return {
            ...entry,
            project_name_context: entryProject?.name || entry?.project_name || "Unknown Project",
          }
        })

        const filteredEntries = isAllProjectsMode
          ? entriesWithProject.filter((entry) => entry.project_name_context !== "Unknown Project")
          : isSelectedProjectsMode
            ? entriesWithProject.filter((entry) => selectedProjects.some((project) => entryBelongsToProject(entry, project)))
            : entriesWithProject.filter((entry) => entryBelongsToProject(entry, selectedProject))

        setProjectEntries(filteredEntries)
      }

      setEntriesLoading(false)
    }

    loadEntries()

    return () => {
      isCancelled = true
    }
  }, [
    selectedProjectId,
    selectedProject,
    selectedProjectIdsKey,
    isAllProjectsMode,
    isSingleProjectMode,
    isSelectedProjectsMode,
    projects,
  ])

  useEffect(() => {
    setChatQuestion("")
    setChatMessages([])
    setChatError("")
  }, [qaScope, selectedProjectId, selectedProjectsChatKey])

  useEffect(() => {
    if (!chatThreadProjectId || !isScopeSelectionValid || !user?.id) {
      setChatMessages([])
      setChatHistoryLoading(false)
      return
    }

    const loadChatHistory = async () => {
      setChatHistoryLoading(true)
      setChatError("")

      const { data, error } = await supabase
        .from("project_chat_messages")
        .select("id, role, content, cited_entry_ids, created_at")
        .eq("project_id", String(chatThreadProjectId))
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })

      if (error) {
        setChatError(error.message)
        setChatMessages([])
      } else {
        setChatMessages(
          (data || []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citedEntryIds: Array.isArray(message.cited_entry_ids) ? message.cited_entry_ids : [],
          }))
        )
      }

      setChatHistoryLoading(false)
    }

    loadChatHistory()
  }, [chatThreadProjectId, isScopeSelectionValid, user?.id])

  const askProjectQuestion = async (e) => {
    e.preventDefault()

    const trimmedQuestion = chatQuestion.trim()
    if (!trimmedQuestion) {
      alert("Enter a question about a project.")
      return
    }

    if (!isScopeSelectionValid) {
      if (isSelectedProjectsMode) {
        alert("Selected Projects mode requires choosing 2 or 3 projects.")
      } else {
        alert("Select a project first.")
      }
      return
    }

    if (projectEntries.length === 0) {
      if (isAllProjectsMode) {
        setChatError("No diary entries found across your projects yet.")
      } else if (isSelectedProjectsMode) {
        setChatError("No diary entries found for the selected projects.")
      } else {
        setChatError("This project has no diary entries yet.")
      }
      return
    }

    setChatLoading(true)
    setChatError("")

    try {
      const response = await fetch("/api/project-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: isAllProjectsMode
            ? "All Projects"
            : isSelectedProjectsMode
              ? selectedProjects.map((project) => project.name).join(", ")
              : (selectedProject?.name || ""),
          projectScope: isAllProjectsMode ? "all" : isSelectedProjectsMode ? "selected" : "single",
          question: trimmedQuestion,
          entries: projectEntries,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to query Claude.")
      }

      const assistantContent = payload.answerBody || payload.answer
      const assistantCitations = Array.isArray(payload.citedEntryIds) ? payload.citedEntryIds : []

      const { data: insertedMessages, error: saveError } = await supabase
        .from("project_chat_messages")
        .insert([
          {
            project_id: String(chatThreadProjectId),
            user_id: user.id,
            role: "user",
            content: trimmedQuestion,
            cited_entry_ids: [],
          },
          {
            project_id: String(chatThreadProjectId),
            user_id: user.id,
            role: "assistant",
            content: assistantContent,
            cited_entry_ids: assistantCitations,
          },
        ])
        .select("id, role, content, cited_entry_ids, created_at")
        .order("created_at", { ascending: true })

      if (saveError) {
        throw new Error("Failed to save chat history: " + saveError.message)
      }

      setChatMessages((currentMessages) => [
        ...currentMessages,
        ...((insertedMessages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citedEntryIds: Array.isArray(message.cited_entry_ids) ? message.cited_entry_ids : [],
        }))),
      ])
      setChatQuestion("")
    } catch (error) {
      setChatError(error.message || "Failed to query Claude.")
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div style={{ marginTop: "20px", border: "1px solid #dbe7f3", backgroundColor: "#f7fbff", borderRadius: "8px", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Project AI Q&A</h3>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4b5563" }}>
            Ask in Single Project mode, compare 2-3 projects in Selected Projects mode, or query everything in All Projects mode.
          </p>
        </div>
        <span style={{ fontSize: "12px", color: "#4b5563", backgroundColor: "white", border: "1px solid #dbe7f3", borderRadius: "999px", padding: "6px 10px" }}>
          {entriesLoading ? "Loading entries..." : `${projectEntries.length} ${projectEntries.length === 1 ? "entry" : "entries"} in context`}
        </span>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label>
          Q&amp;A scope:{" "}
          <select value={qaScope} onChange={(e) => setQaScope(e.target.value)} style={{ minWidth: "220px" }}>
            <option value="single">Single Project</option>
            <option value="selected">Selected Projects (2-3)</option>
            <option value="all">All Projects</option>
          </select>
        </label>
      </div>

      <div style={{ marginBottom: "12px" }}>
        {isSingleProjectMode && (
        <label>
          Project for Q&amp;A:{" "}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ minWidth: "240px" }}
          >
            {projects.map((project) => (
              <option key={String(getProjectKey(project) || project.name)} value={String(getProjectKey(project) || "")}>
                {project.name} ({project.address || "No address"})
              </option>
            ))}
          </select>
        </label>
        )}

        {isSelectedProjectsMode && (
          <div>
            <div style={{ marginBottom: "6px", fontSize: "14px", color: "#334155" }}>Choose 2 or 3 projects:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {projects.map((project) => {
                const projectId = String(getProjectKey(project) || "")
                const checked = selectedProjectIds.includes(projectId)
                const limitReached = selectedProjectIds.length >= 3 && !checked

                return (
                  <label key={projectId} style={{ display: "flex", alignItems: "center", gap: "6px", border: "1px solid #dbe7f3", borderRadius: "999px", backgroundColor: "white", padding: "6px 10px", opacity: limitReached ? 0.6 : 1 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={limitReached}
                      onChange={() => {
                        setSelectedProjectIds((currentIds) => {
                          if (currentIds.includes(projectId)) {
                            return currentIds.filter((id) => id !== projectId)
                          }

                          if (currentIds.length >= 3) {
                            return currentIds
                          }

                          return [...currentIds, projectId]
                        })
                      }}
                    />
                    <span style={{ fontSize: "13px" }}>{project.name}</span>
                  </label>
                )
              })}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "12px", color: selectedProjectIds.length >= 2 && selectedProjectIds.length <= 3 ? "#166534" : "#92400e" }}>
              {selectedProjectIds.length >= 2 && selectedProjectIds.length <= 3
                ? `${selectedProjectIds.length} selected`
                : "Select at least 2 and at most 3 projects."}
            </p>
          </div>
        )}

        {isSingleProjectMode && selectedProject && (
          <button
            type="button"
            onClick={() => onOpenProjectLog?.(selectedProject)}
            style={{ marginLeft: "10px", padding: "6px 10px", border: "1px solid #0d6efd", borderRadius: "4px", color: "#0d6efd", backgroundColor: "white", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
          >
            Open Project Log
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "14px", maxHeight: "320px", overflowY: "auto", paddingRight: "2px" }}>
        {chatHistoryLoading && (
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "white", border: "1px dashed #c9d8e6", color: "#4b5563", fontSize: "14px" }}>
            Loading saved Q&amp;A history...
          </div>
        )}

        {!chatHistoryLoading && chatMessages.length === 0 && (
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "white", border: "1px dashed #c9d8e6", color: "#4b5563", fontSize: "14px" }}>
            {isAllProjectsMode
              ? "No questions asked yet in All Projects mode."
              : isSelectedProjectsMode
                ? "No questions asked yet for this selected project set."
                : "No questions asked yet for this project."}
          </div>
        )}

        {chatMessages.map((message) => (
          <div
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "90%",
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: message.role === "user" ? "#0d6efd" : "white",
              color: message.role === "user" ? "white" : "#1f2937",
              border: message.role === "user" ? "none" : "1px solid #dbe7f3",
              boxShadow: message.role === "user" ? "none" : "0 4px 12px rgba(15, 23, 42, 0.05)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            <div>{message.content}</div>
            {message.role === "assistant" && Array.isArray(message.citedEntryIds) && message.citedEntryIds.length > 0 && (
              <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#4b5563" }}>Cited entries:</span>
                {message.citedEntryIds.map((entryId) => (
                  <span
                    key={`${message.id}-${entryId}`}
                    style={{
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "#0d6efd",
                      backgroundColor: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: "999px",
                      padding: "4px 8px",
                    }}
                  >
                    {entryId}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {chatLoading && (
          <div style={{ alignSelf: "flex-start", padding: "12px 14px", borderRadius: "12px", backgroundColor: "white", border: "1px solid #dbe7f3", color: "#4b5563" }}>
            {isAllProjectsMode
              ? "Claude is reviewing diaries across all projects..."
              : isSelectedProjectsMode
                ? "Claude is comparing diaries for selected projects..."
                : "Claude is reviewing this project&apos;s diary..."}
          </div>
        )}
      </div>

      {chatError && <p style={{ marginTop: 0, marginBottom: "12px", color: "#b00020" }}>{chatError}</p>}

      <form onSubmit={askProjectQuestion}>
        <div style={{ display: "flex", gap: "10px", alignItems: "stretch", flexWrap: "wrap" }}>
          <textarea
            placeholder={
              isAllProjectsMode
                ? "Ask a cross-project question (compare timelines, deliveries, issues, etc.)"
                : isSelectedProjectsMode
                  ? "Ask to compare the 2-3 selected projects"
                  : "Ask a question about the selected project's diary entries"
            }
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            style={{
              flex: 1,
              minWidth: "260px",
              minHeight: "90px",
              padding: "10px",
              fontSize: "15px",
              borderRadius: "8px",
              border: "1px solid #bfd3e6",
              backgroundColor: "white",
            }}
          />
          <button
            type="submit"
            disabled={chatLoading || chatHistoryLoading || entriesLoading || !isScopeSelectionValid}
            style={{
              padding: "10px 18px",
              minWidth: "120px",
              backgroundColor: "#0d6efd",
              color: "white",
              borderRadius: "8px",
              border: "none",
              cursor: chatLoading || chatHistoryLoading || entriesLoading || !isScopeSelectionValid ? "not-allowed" : "pointer",
              fontWeight: "bold",
              opacity: chatLoading || chatHistoryLoading || entriesLoading || !isScopeSelectionValid ? 0.7 : 1,
            }}
          >
            {chatLoading ? "Asking..." : "Ask Claude"}
          </button>
        </div>
      </form>
    </div>
  )
}
