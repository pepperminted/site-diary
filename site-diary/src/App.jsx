import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"
import ProjectForm from "./ProjectForm"
import ProjectList from "./ProjectList"

export default function App() {
  const [session, setSession] = useState(null)
  const [projects, setProjects] = useState([])

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
    <div>
      <h1>Project Dashboard</h1>

      <button onClick={() => supabase.auth.signOut()}>Logout</button>

      <ProjectForm user={session.user} refreshProjects={fetchProjects} />

      <ProjectList projects={projects} />
    </div>
  )
}
