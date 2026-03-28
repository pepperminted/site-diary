'use client'

import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"
import ProjectForm from "./ProjectForm"
import ProjectList from "./ProjectList"
import EntryLogger from "./EntryLogger"
import ProjectQA from "./ProjectQA"

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [projects, setProjects] = useState([])
  const [currentView, setCurrentView] = useState("dashboard") // "dashboard", "entry-logger"
  const [selectedProjectForLog, setSelectedProjectForLog] = useState(null)
  const [projectPendingDelete, setProjectPendingDelete] = useState(null)
  const [deletingProject, setDeletingProject] = useState(false)

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

  const deleteProjectRecord = async (project) => {
    const deleteAttempts = [
      ["id", project?.id],
      ["project_id", project?.project_id],
      ["uuid", project?.uuid],
      ["name", project?.name],
    ].filter(([, value]) => value !== null && value !== undefined && value !== "")

    for (const [field, value] of deleteAttempts) {
      let deleteQuery = supabase.from("projects").delete().eq(field, value)
      if (session?.user?.id) {
        deleteQuery = deleteQuery.eq("user_id", session.user.id)
      }

      const { data, error } = await deleteQuery.select("id")
      if (error) {
        return { error }
      }

      if ((data || []).length > 0) {
        return { deleted: true }
      }
    }

    return { deleted: false }
  }

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) return

      if (error) {
        console.warn("Failed to restore Supabase session:", error.message)
        await supabase.auth.signOut({ scope: "local" })
        if (!isMounted) return
        setSession(null)
        setAuthReady(true)
        return
      }

      setSession(data.session)
      setAuthReady(true)
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return

        if (event === "SIGNED_OUT") {
          setProjects([])
        }

        setSession(nextSession)
        setAuthReady(true)
      }
    )

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error) setProjects(data)
  }

  useEffect(() => {
    if (session) fetchProjects()
  }, [session])

  if (!authReady) return null

  if (!session) return <Auth setSession={setSession} />

  const handleOpenProjectLog = (project) => {
    const projectKey = getProjectKey(project)
    setSelectedProjectForLog(projectKey ? String(projectKey) : null)
    setCurrentView("entry-logger")
  }

  const handleDeleteProject = (project) => {
    setProjectPendingDelete(project)
  }

  const executeProjectDelete = async (project, deleteLogsToo) => {
    if (!project) return

    setDeletingProject(true)

    const projectChatKey = getProjectKey(project)

    if (projectChatKey && session?.user?.id) {
      const { error: deleteChatError } = await supabase
        .from("project_chat_messages")
        .delete()
        .eq("project_id", String(projectChatKey))
        .eq("user_id", session.user.id)

      if (deleteChatError) {
        alert("Failed to delete project Q&A history: " + deleteChatError.message)
        setDeletingProject(false)
        return
      }
    }

    if (deleteLogsToo) {
      const { data: allEntries, error: entriesError } = await supabase
        .from("entries")
        .select("*")

      if (entriesError) {
        alert("Failed to load project logs before delete: " + entriesError.message)
        setDeletingProject(false)
        return
      }

      const projectEntries = (allEntries || []).filter((entry) => entryBelongsToProject(entry, project))
      const photoPaths = projectEntries
        .map((entry) => entry.photo_urls)
        .filter((path) => path && !/^https?:\/\//i.test(path))
      const audioPaths = projectEntries
        .map((entry) => entry.audio_url)
        .filter((path) => path && !/^https?:\/\//i.test(path))

      if (photoPaths.length > 0) {
        await supabase.storage.from("entry-photos").remove(photoPaths)
      }

      if (audioPaths.length > 0) {
        await supabase.storage.from("entry-audio").remove(audioPaths)
      }

      const entryIds = projectEntries.map((entry) => entry.id).filter(Boolean)
      if (entryIds.length > 0) {
        const { error: deleteEntriesError } = await supabase.from("entries").delete().in("id", entryIds)
        if (deleteEntriesError) {
          alert("Failed to delete project logs: " + deleteEntriesError.message)
          setDeletingProject(false)
          return
        }
      }
    }

    if (!project?.id && !project?.project_id && !project?.uuid && !project?.name) {
      alert("Could not determine which project to delete.")
      setDeletingProject(false)
      return
    }

    const { deleted, error } = await deleteProjectRecord(project)
    if (error) {
      alert(
        "Failed to delete project: " +
          error.message +
          (deleteLogsToo ? "" : " If logs still reference this project, retry and choose the safety option to delete logs too.")
      )
      setDeletingProject(false)
      return
    }

    if (!deleted) {
      alert(
        "Project was not deleted. This usually means the row did not match the delete filter or your Supabase RLS policy does not allow DELETE on projects."
      )
      setDeletingProject(false)
      return
    }

    const deletedProjectKey = getProjectKey(project)
    if (deletedProjectKey && String(selectedProjectForLog) === String(deletedProjectKey)) {
      setSelectedProjectForLog(null)
    }

    await fetchProjects()
    setProjectPendingDelete(null)
    setDeletingProject(false)
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>Site Diary</h1>
        <button onClick={() => supabase.auth.signOut()} style={{ padding: "8px 16px" }}>
          Logout
        </button>
      </div>

      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <button
          onClick={() => setCurrentView("dashboard")}
          style={{
            padding: "8px 16px",
            backgroundColor: currentView === "dashboard" ? "#007bff" : "#e9ecef",
            color: currentView === "dashboard" ? "white" : "black",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Dashboard
        </button>
        <button
          onClick={() => setCurrentView("entry-logger")}
          style={{
            padding: "8px 16px",
            backgroundColor: currentView === "entry-logger" ? "#28a745" : "#e9ecef",
            color: currentView === "entry-logger" ? "white" : "black",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Log Entry
        </button>
      </div>

      {currentView === "dashboard" && (
        <div>
          <ProjectForm user={session.user} refreshProjects={fetchProjects} />
          <ProjectQA user={session.user} projects={projects} onOpenProjectLog={handleOpenProjectLog} />
          <ProjectList
            projects={projects}
            onOpenProjectLog={handleOpenProjectLog}
            onDeleteProject={handleDeleteProject}
            deletingProjectKey={projectPendingDelete ? String(getProjectKey(projectPendingDelete) || "") : ""}
          />
        </div>
      )}

      {currentView === "entry-logger" && (
        <EntryLogger
          user={session.user}
          projects={projects}
          initialProjectId={selectedProjectForLog}
          refreshProjects={fetchProjects}
        />
      )}

      {projectPendingDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "10px",
              padding: "24px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Delete Project</h3>
            <p style={{ marginTop: 0 }}>
              Are you sure you want to delete {projectPendingDelete.name || "this project"}?
            </p>
            <p style={{ color: "#555", fontSize: "14px", lineHeight: 1.5 }}>
              Choose whether to delete only the project record, or delete the project together with all related logs and uploaded media.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setProjectPendingDelete(null)}
                disabled={deletingProject}
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  backgroundColor: "white",
                  cursor: deletingProject ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeProjectDelete(projectPendingDelete, false)}
                disabled={deletingProject}
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  border: "1px solid #d97706",
                  backgroundColor: "#fff7ed",
                  color: "#b45309",
                  cursor: deletingProject ? "not-allowed" : "pointer",
                }}
              >
                {deletingProject ? "Deleting..." : "Delete Project Only"}
              </button>
              <button
                type="button"
                onClick={() => executeProjectDelete(projectPendingDelete, true)}
                disabled={deletingProject}
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  border: "1px solid #dc3545",
                  backgroundColor: "#dc3545",
                  color: "white",
                  cursor: deletingProject ? "not-allowed" : "pointer",
                }}
              >
                {deletingProject ? "Deleting..." : "Delete Project + Logs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
