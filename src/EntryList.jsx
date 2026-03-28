'use client'

import React from "react"
import Entry from "./Entry"

export default function EntryList({ entries, loading, onDeleteEntry, deletingEntryId, getEntryAnchorId, highlightedEntryId }) {
  if (loading) return <p>Loading entries...</p>

  if (entries.length === 0) return <p style={{ color: "#666" }}>No entries yet. Start logging!</p>

  return (
    <div>
      {entries.map((entry) => (
        <Entry
          key={entry.id}
          entry={entry}
          anchorId={typeof getEntryAnchorId === "function" ? getEntryAnchorId(entry.id) : undefined}
          highlighted={String(highlightedEntryId) === String(entry.id)}
          onDeleteEntry={onDeleteEntry}
          deleting={String(deletingEntryId) === String(entry.id)}
        />
      ))}
    </div>
  )
}