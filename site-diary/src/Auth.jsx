import React, { useState } from "react"
import { supabase } from "./supabaseClient"

export default function Auth({ setSession }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")

  const handleSignUp = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) return alert(error.message)

    if (data.user) {
      await supabase.from("users").insert([
        {
          id: data.user.id,
          email: data.user.email,
          name,
          role: "engineer",
        },
      ])
    }

    alert("Check your email to confirm signup")
  }

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) alert(error.message)
    else setSession(data.session)
  }

  return (
    <div>
      <h2>Login / Sign Up</h2>

      <input placeholder="Name" onChange={(e) => setName(e.target.value)} />
      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

      <button onClick={handleLogin}>Login</button>
      <button onClick={handleSignUp}>Sign Up</button>
    </div>
  )
}
