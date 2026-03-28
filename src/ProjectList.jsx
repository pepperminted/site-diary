import React from "react"

const getProjectKey = (project) =>
  project?.id ?? project?.project_id ?? project?.projectId ?? project?.uuid ?? project?.name ?? null

export default function ProjectList({ projects, onOpenProjectLog, onDeleteProject }) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h3>Your Projects</h3>

      {projects.length === 0 && <p>No projects yet.</p>}

      {projects.map((p) => (
        <div
          key={String(getProjectKey(p) || p.name)}
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>
            <button
              type="button"
              onClick={() => onOpenProjectLog?.(p)}
              style={{
                background: "none",
                border: "none",
                color: "#0d6efd",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
                font: "inherit",
                fontWeight: "bold",
              }}
              title="Open project log"
            >
              {p.name}
            </button>
          </h4>
          <p>{p.address}</p>
          <p><strong>Phase:</strong> {p.phase}</p>
          <div style={{ marginTop: "8px" }}>
            <button
              type="button"
              onClick={() => onDeleteProject?.(p)}
              style={{
                padding: "6px 10px",
                border: "1px solid #dc3545",
                color: "#dc3545",
                backgroundColor: "white",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Delete Project
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}