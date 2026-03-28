'use client'

import React, { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"

export default function Entry({ entry }) {
  const [photoUrl, setPhotoUrl] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const createdAt = new Date(entry.created_at).toLocaleString()

  useEffect(() => {
    if (entry.photo_urls) {
      loadPhotoUrl()
    } else {
      setPhotoUrl(null)
    }

    if (entry.audio_url) {
      loadAudioUrl()
    } else {
      setAudioUrl(null)
    }
  }, [entry.photo_urls, entry.audio_url])

  const resolveStorageUrl = async (bucket, path) => {
    if (!path) return null

    if (/^https?:\/\//i.test(path)) {
      return path
    }

    const { data: signedData, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (!error && signedData?.signedUrl) {
      return signedData.signedUrl
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
    return publicData?.publicUrl ?? null
  }

  const loadPhotoUrl = async () => {
    const resolvedUrl = await resolveStorageUrl("entry-photos", entry.photo_urls)
    setPhotoUrl(resolvedUrl)
  }

  const loadAudioUrl = async () => {
    const resolvedUrl = await resolveStorageUrl("entry-audio", entry.audio_url)
    setAudioUrl(resolvedUrl)
  }

  return (
    <>
      <div
        style={{
          border: "1px solid #eee",
          padding: "15px",
          marginBottom: "10px",
          borderRadius: "6px",
          backgroundColor: "#f9f9f9",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "10px" }}>
          {/* Left: text + audio */}
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#999" }}>{createdAt}</p>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: "bold",
                backgroundColor: "#e7f3ff",
                color: "#0066cc",
                borderRadius: "4px",
                marginBottom: "8px",
              }}
            >
              {entry.type?.toUpperCase()}
            </span>

            {entry.text && (
              <p style={{ margin: "8px 0 0 0", lineHeight: "1.5" }}>{entry.text}</p>
            )}

            {audioUrl && (
              <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🎤</span>
                <audio controls src={audioUrl} style={{ height: "32px", flex: 1 }} />
              </div>
            )}
          </div>

          {/* Right: photo thumbnail */}
          {photoUrl && (
            <div
              onClick={() => setLightboxOpen(true)}
              style={{
                position: "relative",
                width: "90px",
                height: "90px",
                flexShrink: 0,
                cursor: "zoom-in",
                borderRadius: "6px",
                overflow: "hidden",
                border: "2px solid #ddd",
              }}
            >
              <img
                src={photoUrl}
                alt="entry photo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,0.45)",
                  color: "white",
                  fontSize: "10px",
                  textAlign: "center",
                  padding: "2px 0",
                  letterSpacing: "0.03em",
                }}
              >
                🔍 expand
              </div>
            </div>
          )}
        </div>
      </div>

      {lightboxOpen && photoUrl && (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img
              src={photoUrl}
              alt="full size entry photo"
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "8px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxOpen(false)}
              style={{
                position: "absolute",
                top: "-14px",
                right: "-14px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: "white",
                color: "#333",
                fontSize: "16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}