'use client'

import React, { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"
import EntryList from "./EntryList"

export default function EntryLogger({ user, projects, initialProjectId }) {
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

  const selectedProject = projects.find((p) => String(getProjectKey(p)) === String(selectedProjectId))

  useEffect(() => {
    if (!initialProjectId || projects.length === 0) return

    const requestedProjectExists = projects.some(
      (p) => String(getProjectKey(p)) === String(initialProjectId)
    )

    if (requestedProjectExists) {
      setSelectedProjectId(String(initialProjectId))
    }
  }, [initialProjectId, projects])

  // Ensure we always have a valid selected project after projects load.
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() && !photoFile && !audioFile) return alert("Enter text, upload a photo, or record / upload audio")

    setLoading(true)
    let photoPath = null
    let audioPath = null

    if (photoFile) {
      photoPath = await uploadPhoto(photoFile)
    }

    if (audioFile) {
      audioPath = await uploadAudio(audioFile)
    }

    const selectedProjectForInsert = projects.find((p) => String(getProjectKey(p)) === String(selectedProjectId))
    const projectIdForInsert = getProjectKey(selectedProjectForInsert) ?? selectedProjectId
    const entryType = audioFile ? "voice" : photoFile ? "photo" : "text"

    const { error } = await supabase.from("entries").insert([
      {
        project_id: projectIdForInsert,
        user_id: user.id,
        text: text || null,
        photo_urls: photoPath,
        audio_url: audioPath,
        type: entryType,
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
    setLoading(false)
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
          <h3>{selectedProject.name}</h3>
          <p>{selectedProject.address}</p>
          <p><strong>Phase:</strong> {selectedProject.phase}</p>

          <form onSubmit={handleSubmit}>
            <textarea
              placeholder="What's happening on site today?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: "100%",
                minHeight: "150px",
                padding: "10px",
                marginBottom: "10px",
                fontSize: "16px",
              }}
            />

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

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#ffc107",
                  color: "black",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {loading ? "Saving..." : "Log Entry"}
              </button>
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
        onDeleteEntry={handleDeleteEntry}
      />
    </div>
  )
}