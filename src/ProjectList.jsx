import React from "react"

const getProjectKey = (project) =>
  project?.id ?? project?.project_id ?? project?.projectId ?? project?.uuid ?? project?.name ?? null

export default function ProjectList({ projects, onOpenProjectLog, onDeleteProject }) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h3>Your Projects</h3>

      {projects.length === 0 && <p>No projects yet.</p>}

      {projects.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Project Name</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Address</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Location</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Phase</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Client</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Contact</th>
                <th style={{ textAlign: "left", border: "1px solid #d1d5db", padding: "10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={String(getProjectKey(p) || p.name)}>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>
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
                  </td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>{p.address || "-"}</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>{p.lat ?? "-"}, {p.lng ?? "-"}</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>{p.phase || "-"}</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>{p.client || "-"}</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>{p.contact || "-"}</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "10px" }}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}