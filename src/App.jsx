'use client'

import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"
import ProjectForm from "./ProjectForm"
import ProjectList from "./ProjectList"
import EntryLogger from "./EntryLogger"

export default function App() {
  const [session, setSession] = useState(null)
  const [projects, setProjects] = useState([])
  const [currentView, setCurrentView] = useState("dashboard") // "dashboard", "entry-logger"

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => listener.subscription.unsubscribe()
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

  if (!session) return <Auth setSession={setSession} />

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
          <ProjectList projects={projects} />
        </div>
      )}

      {currentView === "entry-logger" && <EntryLogger user={session.user} projects={projects} />}
    </div>
  )
}
