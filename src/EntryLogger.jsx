'use client'

import React, { useState, useEffect, useRef } from "react"
import { supabase } from "./supabaseClient"
import EntryList from "./EntryList"

export default function EntryLogger({ user, projects, initialProjectId, refreshProjects }) {
  const toKey = (value) => (value === null || value === undefined ? "" : String(value).trim())

  const uniqueNonEmpty = (values) => Array.from(new Set(values.map(toKey).filter(Boolean)))

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

  const getProjectKey = (project) =>
    project?.id ?? project?.project_id ?? project?.projectId ?? project?.uuid ?? project?.name ?? null

  const entryBelongsToProject = (entry, project) => {
    const entryIds = getEntryIdentifiers(entry)
    const projectIds = getProjectIdentifiers(project)
    return entryIds.some((id) => projectIds.includes(id))
  }

  const getEntryAnchorId = (entryId) => `entry-${String(entryId ?? "").replace(/[^a-zA-Z0-9_-]/g, "-")}`

  const getAssistantMessageDisplay = (message) => {
    if (message.role !== "assistant") {
      return {
        body: message.content,
        citedEntryIds: [],
      }
    }

    const citationMatch = message.content.match(/(?:^|\n)Cited entry ids:\s*(.+)$/i)
    const body = citationMatch
      ? message.content.replace(/\n?Cited entry ids:\s*.+$/i, "").trim()
      : message.content

    return {
      body,
      citedEntryIds: Array.isArray(message.citedEntryIds) ? message.citedEntryIds : [],
    }
  }

  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [text, setText] = useState("")
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState("")
  const [deletingEntryId, setDeletingEntryId] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [audioChunksRef] = useState({ current: [] })
  const [audioFile, setAudioFile] = useState(null)   // recorded blob or picked file
  const [audioName, setAudioName] = useState("")     // display label
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [isEditingProjectDetails, setIsEditingProjectDetails] = useState(false)
  const [projectNameInput, setProjectNameInput] = useState("")
  const [projectClientInput, setProjectClientInput] = useState("")
  const [projectContactInput, setProjectContactInput] = useState("")
  const [projectPhaseInput, setProjectPhaseInput] = useState("")
  const [projectAddressInput, setProjectAddressInput] = useState("")
  const [chatQuestion, setChatQuestion] = useState("")
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState("")
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false)
  const [highlightedEntryId, setHighlightedEntryId] = useState(null)
  const highlightTimeoutRef = useRef(null)

  const selectedProject = projects.find((p) => String(getProjectKey(p)) === String(selectedProjectId))

  useEffect(() => {
    if (!selectedProject) return

    setProjectNameInput(selectedProject.name || "")
    setProjectClientInput(selectedProject.client || "")
    setProjectContactInput(selectedProject.contact || "")
    setProjectPhaseInput(selectedProject.phase || "")
    setProjectAddressInput(selectedProject.address || "")
  }, [selectedProject])

  useEffect(() => {
    if (!initialProjectId || projects.length === 0) return

    const requestedProjectExists = projects.some(
      (p) => String(getProjectKey(p)) === String(initialProjectId)
    )

    if (requestedProjectExists) {
      setSelectedProjectId(String(initialProjectId))
    }
  }, [initialProjectId, projects])

  useEffect(() => {
    setChatQuestion("")
    setChatMessages([])
    setChatError("")
    setHighlightedEntryId(null)
  }, [selectedProjectId])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedProjectId || !user?.id) {
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
        .eq("project_id", String(selectedProjectId))
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Failed to load chat history:", error.message)
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
  }, [selectedProjectId, user?.id])

  // Ensure we always have a valid selected project after projects load.
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null)
      return
    }

    const requestedProjectExists = initialProjectId && projects.some(
      (p) => String(getProjectKey(p)) === String(initialProjectId)
    )

    // If a specific project was requested from dashboard, wait for that
    // selection to be applied instead of immediately falling back.
    if (requestedProjectExists && String(selectedProjectId) !== String(initialProjectId)) {
      return
    }

    const stillExists = projects.some((p) => String(getProjectKey(p)) === String(selectedProjectId))
    if (!selectedProjectId || !stillExists) {
      const firstProjectKey = getProjectKey(projects[0])
      setSelectedProjectId(firstProjectKey ? String(firstProjectKey) : null)
    }
  }, [projects, selectedProjectId])

  // Fetch entries for selected project
  useEffect(() => {
    fetchEntries(selectedProjectId)
  }, [selectedProjectId])

  const fetchEntries = async (projectId) => {
    if (!projectId) {
      setFetchError("")
      setEntries([])
      return
    }

    setLoading(true)
    setFetchError("")
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch entries:", error.message)
      setFetchError(error.message)
      setEntries([])
    } else {
      const selectedProjectForFilter = projects.find((p) => String(getProjectKey(p)) === String(projectId))
      const allEntries = data || []
      const filteredEntries = selectedProjectForFilter
        ? allEntries.filter((entry) => entryBelongsToProject(entry, selectedProjectForFilter))
        : []
      setEntries(filteredEntries)
    }
    setLoading(false)
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = (evt) => setPhotoPreview(evt.target.result)
      reader.readAsDataURL(file)
    }
  }

  const uploadPhoto = async (file) => {
    if (!file) return null
    const timestamp = Date.now()
    const path = `${user.id}/${selectedProjectId}/${timestamp}-${file.name}`
    const { error } = await supabase.storage.from("entry-photos").upload(path, file)
    if (error) {
      alert("Photo upload failed: " + error.message)
      return null
    }
    return path
  }

  const parseEntryWithClaude = async (entryText) => {
    const response = await fetch("/api/claude-parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: entryText }),
    })

    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to parse entry with Claude.")
    }

    return payload?.parsed ?? null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() && !photoFile && !audioFile) return alert("Enter text, upload a photo, or record / upload audio")

    setLoading(true)
    let photoPath = null
    let audioPath = null
    let parsedEntry = null

    try {
      if (text.trim()) {
        parsedEntry = await parseEntryWithClaude(text.trim())
      }

      if (photoFile) {
        photoPath = await uploadPhoto(photoFile)
      }

      if (audioFile) {
        audioPath = await uploadAudio(audioFile)
      }

      const selectedProjectForInsert = projects.find((p) => String(getProjectKey(p)) === String(selectedProjectId))
      const projectIdForInsert = getProjectKey(selectedProjectForInsert) ?? selectedProjectId
      const entryType = audioFile ? "voice" : photoFile ? "photo" : "text"
      const clientCreatedAt = new Date().toISOString()

      const { error } = await supabase.from("entries").insert([
        {
          project_id: projectIdForInsert,
          user_id: user.id,
          text: text || null,
          photo_urls: photoPath,
          audio_url: audioPath,
          type: entryType,
          ai_parsed: parsedEntry,
          created_at: clientCreatedAt,
        },
      ])

      if (error) {
        alert("Failed to save entry: " + error.message)
      } else {
        setText("")
        setPhotoFile(null)
        setPhotoPreview(null)
        setAudioFile(null)
        setAudioName("")
        fetchEntries(selectedProjectId)
      }
    } catch (error) {
      alert(error.message || "Failed to submit entry.")
    } finally {
      setLoading(false)
    }
  }

  const uploadAudio = async (file) => {
    const timestamp = Date.now()
    const ext = file.name ? file.name.split(".").pop() : "webm"
    const path = `${user.id}/${selectedProjectId}/voice-${timestamp}.${ext}`
    const { error } = await supabase.storage.from("entry-audio").upload(path, file)
    if (error) {
      alert("Audio upload failed: " + error.message)
      return null
    }
    return path
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg"
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        const ext = recorder.mimeType.includes("ogg") ? "ogg" : "webm"
        const file = new File([blob], `recording.${ext}`, { type: recorder.mimeType })
        setAudioFile(file)
        setAudioName(`Recording — ${new Date().toLocaleTimeString()}`)
        setIsRecording(false)
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch (err) {
      alert("Microphone access denied: " + err.message)
    }
  }

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      mediaRecorder.stream.getTracks().forEach((track) => track.stop())
    }
  }

  const handleAudioFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setAudioFile(file)
      setAudioName(file.name)
    }
  }

  const getProjectUpdateFilter = (project) => {
    if (project?.id) return ["id", project.id]
    if (project?.project_id) return ["project_id", project.project_id]
    if (project?.uuid) return ["uuid", project.uuid]
    if (project?.name) return ["name", project.name]
    return null
  }

  const handleUpdateProjectDetails = async () => {
    if (!selectedProject) return

    const nextProjectName = projectNameInput.trim()
    if (!nextProjectName) {
      alert("Project name is required")
      return
    }

    const updateFilter = getProjectUpdateFilter(selectedProject)
    if (!updateFilter) {
      alert("Could not determine which project to update.")
      return
    }

    const updates = {
      name: nextProjectName,
      client: projectClientInput.trim() || null,
      contact: projectContactInput.trim() || null,
      phase: projectPhaseInput.trim() || null,
      address: projectAddressInput.trim() || null,
    }

    const [field, value] = updateFilter
    const { error } = await supabase.from("projects").update(updates).eq(field, value)

    if (error) {
      alert("Failed to update project details: " + error.message)
      return
    }

    if (typeof refreshProjects === "function") {
      await refreshProjects()
    }

    const updatedProjectKey = selectedProject?.id ?? selectedProject?.project_id ?? selectedProject?.uuid ?? updates.name
    if (updatedProjectKey) {
      setSelectedProjectId(String(updatedProjectKey))
    }

    setIsEditingProjectDetails(false)
  }

  const handleDeleteEntry = async (entry) => {
    const confirmed = window.confirm("Are you sure you want to delete this log entry?")
    if (!confirmed) return

    if (!entry?.id) {
      alert("Could not determine which log entry to delete.")
      return
    }

    setDeletingEntryId(entry.id)

    if (entry.photo_urls) {
      await supabase.storage.from("entry-photos").remove([entry.photo_urls])
    }

    if (entry.audio_url) {
      await supabase.storage.from("entry-audio").remove([entry.audio_url])
    }

    const { error } = await supabase.from("entries").delete().eq("id", entry.id)

    if (error) {
      alert("Failed to delete log entry: " + error.message)
    } else {
      setEntries((previousEntries) => previousEntries.filter((item) => item.id !== entry.id))
    }

    setDeletingEntryId(null)
  }

  const askProjectQuestion = async (e) => {
    e.preventDefault()

    const trimmedQuestion = chatQuestion.trim()
    if (!trimmedQuestion) {
      alert("Enter a question about this project.")
      return
    }

    if (!selectedProject) {
      alert("Select a project first.")
      return
    }

    if (entries.length === 0) {
      setChatError("This project has no diary entries yet.")
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
          projectName: selectedProject.name || "",
          question: trimmedQuestion,
          entries,
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
            project_id: String(selectedProjectId),
            user_id: user.id,
            role: "user",
            content: trimmedQuestion,
            cited_entry_ids: [],
          },
          {
            project_id: String(selectedProjectId),
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

      setChatMessages((currentMessages) => ([
        ...currentMessages,
        ...((insertedMessages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citedEntryIds: Array.isArray(message.cited_entry_ids) ? message.cited_entry_ids : [],
        }))),
      ]))
      setChatQuestion("")
    } catch (error) {
      setChatError(error.message || "Failed to query Claude.")
    } finally {
      setChatLoading(false)
    }
  }

  const handleCitationClick = (entryId, e) => {
    e.preventDefault()

    const normalizedEntryId = String(entryId ?? "")
    if (!normalizedEntryId) return

    const targetAnchorId = getEntryAnchorId(normalizedEntryId)
    const targetElement = document.getElementById(targetAnchorId)

    if (!targetElement) return

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current)
    }

    setHighlightedEntryId(normalizedEntryId)
    targetElement.scrollIntoView({ behavior: "smooth", block: "center" })

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedEntryId((currentValue) => (currentValue === normalizedEntryId ? null : currentValue))
      highlightTimeoutRef.current = null
    }, 2200)
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Project Log</h2>

      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Project:{" "}
          <select
            value={selectedProjectId || ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={String(getProjectKey(p) || p.name)} value={String(getProjectKey(p) || "")}>
                {p.name} ({p.address})
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProject && (
        <div style={{ marginBottom: "30px", border: "1px solid #ddd", padding: "15px", borderRadius: "8px" }}>
          <div style={{ marginBottom: "24px", border: "1px solid #dbe7f3", backgroundColor: "#f7fbff", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0 }}>Project AI Q&A</h3>
                <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4b5563" }}>
                  Ask about dates, quantities, deliveries, inspections, issues, or other logged site activity.
                </p>
              </div>
              <span style={{ fontSize: "12px", color: "#4b5563", backgroundColor: "white", border: "1px solid #dbe7f3", borderRadius: "999px", padding: "6px 10px" }}>
                {entries.length} {entries.length === 1 ? "entry" : "entries"} in context
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "14px" }}>
              {chatHistoryLoading && (
                <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "white", border: "1px dashed #c9d8e6", color: "#4b5563", fontSize: "14px" }}>
                  Loading saved Q&amp;A history...
                </div>
              )}

              {!chatHistoryLoading && chatMessages.length === 0 && (
                <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "white", border: "1px dashed #c9d8e6", color: "#4b5563", fontSize: "14px" }}>
                  No questions asked yet.
                </div>
              )}

              {chatMessages.map((message) => {
                const displayMessage = getAssistantMessageDisplay(message)

                return (
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
                    <div>{displayMessage.body}</div>
                    {message.role === "assistant" && displayMessage.citedEntryIds.length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "#4b5563" }}>Cited entries:</span>
                        {displayMessage.citedEntryIds.map((entryId) => (
                          <a
                            key={`${message.id}-${entryId}`}
                            href={`#${getEntryAnchorId(entryId)}`}
                            onClick={(e) => handleCitationClick(entryId, e)}
                            style={{
                              fontSize: "12px",
                              fontFamily: "monospace",
                              textDecoration: "none",
                              color: "#0d6efd",
                              backgroundColor: "#eff6ff",
                              border: "1px solid #bfdbfe",
                              borderRadius: "999px",
                              padding: "4px 8px",
                            }}
                          >
                            {entryId}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {chatLoading && (
                <div style={{ alignSelf: "flex-start", padding: "12px 14px", borderRadius: "12px", backgroundColor: "white", border: "1px solid #dbe7f3", color: "#4b5563" }}>
                  Claude is reviewing the project diary...
                </div>
              )}
            </div>

            {chatError && <p style={{ marginTop: 0, marginBottom: "12px", color: "#b00020" }}>{chatError}</p>}

            <form onSubmit={askProjectQuestion}>
              <div style={{ display: "flex", gap: "10px", alignItems: "stretch", flexWrap: "wrap" }}>
                <textarea
                  placeholder="Ask a question about this project's diary entries"
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
                  disabled={chatLoading || chatHistoryLoading || loading}
                  style={{
                    padding: "10px 18px",
                    minWidth: "120px",
                    backgroundColor: "#0d6efd",
                    color: "white",
                    borderRadius: "8px",
                    border: "none",
                    cursor: chatLoading || chatHistoryLoading || loading ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    opacity: chatLoading || chatHistoryLoading || loading ? 0.7 : 1,
                  }}
                >
                  {chatLoading ? "Asking..." : "Ask Claude"}
                </button>
              </div>
            </form>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Project Details</h3>
            <button
              type="button"
              onClick={() => setIsEditingProjectDetails((value) => !value)}
              style={{
                padding: "6px 10px",
                border: "1px solid #0d6efd",
                color: "#0d6efd",
                backgroundColor: "white",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              {isEditingProjectDetails ? "Cancel Edit" : "Edit Project Details"}
            </button>
          </div>

          <p><strong>Project:</strong> {selectedProject.name || "-"}</p>
          <p><strong>Client:</strong> {selectedProject.client || "-"}</p>
          <p><strong>Contact:</strong> {selectedProject.contact || "-"}</p>
          <p><strong>Phase:</strong> {selectedProject.phase || "-"}</p>
          <p><strong>Address:</strong> {selectedProject.address || "-"}</p>

          {isEditingProjectDetails && (
            <div style={{ marginBottom: "14px", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <input
                  placeholder="Project Name"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  style={{ flex: "1 1 180px", minWidth: "150px" }}
                />
                <input
                  placeholder="Client"
                  value={projectClientInput}
                  onChange={(e) => setProjectClientInput(e.target.value)}
                  style={{ flex: "1 1 180px", minWidth: "150px" }}
                />
                <input
                  placeholder="Contact"
                  value={projectContactInput}
                  onChange={(e) => setProjectContactInput(e.target.value)}
                  style={{ flex: "1 1 180px", minWidth: "150px" }}
                />
                <input
                  placeholder="Phase"
                  value={projectPhaseInput}
                  onChange={(e) => setProjectPhaseInput(e.target.value)}
                  style={{ flex: "1 1 160px", minWidth: "130px" }}
                />
                <input
                  placeholder="Address"
                  value={projectAddressInput}
                  onChange={(e) => setProjectAddressInput(e.target.value)}
                  style={{ flex: "1 1 260px", minWidth: "200px" }}
                />
                <button
                  type="button"
                  onClick={handleUpdateProjectDetails}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    borderRadius: "4px",
                    backgroundColor: "#198754",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Save Project Details
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "10px", display: "flex", gap: "10px", alignItems: "stretch", flexWrap: "wrap" }}>
              <textarea
                placeholder="What's happening on site today?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "260px",
                  minHeight: "150px",
                  padding: "10px",
                  fontSize: "16px",
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "8px 20px",
                  minWidth: "110px",
                  backgroundColor: "#ffc107",
                  color: "black",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {loading ? "Entering..." : "Enter"}
              </button>
            </div>

            <div style={{ marginBottom: "10px", display: "flex", gap: "10px" }}>
              <label style={{ cursor: "pointer", padding: "8px 16px", backgroundColor: "#007bff", color: "white", borderRadius: "4px" }}>
                📸 Photo
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
              </label>

              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                style={{
                  padding: "8px 16px",
                  backgroundColor: isRecording ? "#dc3545" : "#28a745",
                  color: "white",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isRecording ? "🔴 Stop Recording" : "🎤 Record Voice"}
              </button>

              <label style={{ cursor: "pointer", padding: "8px 16px", backgroundColor: "#6c757d", color: "white", borderRadius: "4px" }}>
                🔊 Upload Audio
                <input type="file" accept="audio/*" onChange={handleAudioFileChange} style={{ display: "none" }} />
              </label>
            </div>

            {photoPreview && (
              <div style={{ marginBottom: "10px" }}>
                <img src={photoPreview} alt="preview" style={{ maxWidth: "200px", maxHeight: "200px" }} />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null)
                    setPhotoPreview(null)
                  }}
                  style={{ marginLeft: "10px", padding: "4px 8px" }}
                >
                  Remove
                </button>
              </div>
            )}

            {audioFile && (
              <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px", backgroundColor: "#f0fff0", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c3e6c3" }}>
                <span style={{ fontSize: "20px" }}>🎤</span>
                <span style={{ fontSize: "13px", flex: 1 }}>{audioName}</span>
                <audio controls src={URL.createObjectURL(audioFile)} style={{ height: "32px" }} />
                <button
                  type="button"
                  onClick={() => { setAudioFile(null); setAudioName("") }}
                  style={{ padding: "2px 8px", fontSize: "12px" }}
                >
                  Remove
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      <h3>Entry History</h3>
      {fetchError && <p style={{ color: "#b00020" }}>Failed to load entries: {fetchError}</p>}
      <EntryList
        entries={entries}
        loading={loading}
        deletingEntryId={deletingEntryId}
        getEntryAnchorId={getEntryAnchorId}
        highlightedEntryId={highlightedEntryId}
        onDeleteEntry={handleDeleteEntry}
      />
    </div>
  )
}