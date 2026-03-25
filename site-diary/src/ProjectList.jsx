import React from "react"

export default function ProjectList({ projects }) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h3>Your Projects</h3>

      {projects.length === 0 && <p>No projects yet.</p>}

      {projects.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          <h4>{p.name}</h4>
          <p>{p.address}</p>
          <p><strong>Phase:</strong> {p.phase}</p>
        </div>
      ))}
    </div>
  )
}