'use client'

import React, { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"

export default function Entry({ entry }) {
  const [photoUrl, setPhotoUrl] = useState(null)
  const createdAt = new Date(entry.created_at).toLocaleString()

  useEffect(() => {
    if (entry.photo_path) {
      loadPhotoUrl()
    }
  }, [entry.photo_path])

  const loadPhotoUrl = async () => {
    const { data } = supabase.storage.from("entry-photos").getPublicUrl(entry.photo_path)
    if (data) setPhotoUrl(data.publicUrl)
  }

  return (
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
            {entry.type.toUpperCase()}
          </span>
          <p style={{ margin: "8px 0 0 0", lineHeight: "1.5" }}>{entry.text || "(No text)"}</p>
        </div>

        {photoUrl && (
          <img
            src={photoUrl}
            alt="entry photo"
            style={{
              width: "80px",
              height: "80px",
              objectFit: "cover",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            title="Click to view full size"
          />
        )}
      </div>
    </div>
  )
}