'use client'

import React, { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"
import EntryList from "./EntryList"

export default function EntryLogger({ user, projects }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || null)
  const [text, setText] = useState("")
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Fetch entries for selected project
  useEffect(() => {
    fetchEntries()
  }, [selectedProjectId])

  const fetchEntries = async () => {
    if (!selectedProjectId) return
    setLoading(true)
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("project_id", selectedProjectId)
      .order("created_at", { ascending: false })

    if (!error) setEntries(data || [])
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
    if (!text.trim() && !photoFile) return alert("Enter text or upload a photo")

    setLoading(true)
    let photoPath = null
    if (photoFile) {
      photoPath = await uploadPhoto(photoFile)
    }

    const { error } = await supabase.from("entries").insert([
      {
        project_id: selectedProjectId,
        user_id: user.id,
        text,
        photo_path: photoPath,
        type: "text",
      },
    ])

    if (error) {
      alert("Failed to save entry: " + error.message)
    } else {
      setText("")
      setPhotoFile(null)
      setPhotoPreview(null)
      fetchEntries()
    }
    setLoading(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const audioChunks = []

      recorder.ondataavailable = (e) => audioChunks.push(e.data)
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" })
        // For now, we'll just add a voice entry placeholder
        // Full voice upload can be added later
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
      setIsRecording(false)
    }
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
              <option key={p.id} value={p.id}>
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
                {isRecording ? "🔴 Stop Recording" : "🎤 Voice"}
              </button>

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
          </form>
        </div>
      )}

      <h3>Entry History</h3>
      <EntryList entries={entries} loading={loading} />
    </div>
  )
}