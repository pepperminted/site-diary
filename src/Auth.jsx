'use client'

import React, { useState } from "react"
import { supabase } from "./supabaseClient"

export default function Auth({ setSession }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)

  // Sign-up modal state
  const [showSignUp, setShowSignUp] = useState(false)
  const [signUpEmail, setSignUpEmail] = useState("")
  const [signUpPassword, setSignUpPassword] = useState("")
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("")
  const [signUpLoading, setSignUpLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoginLoading(false)
    if (error) {
      alert(error.message)
    } else {
      setSession(data.session)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!signUpEmail.trim()) return alert("Please enter an email address.")
    if (signUpPassword.length < 6) return alert("Password must be at least 6 characters.")
    if (signUpPassword !== signUpConfirmPassword) return alert("Passwords do not match.")

    setSignUpLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: signUpEmail.trim(),
      password: signUpPassword,
    })
    setSignUpLoading(false)

    if (error) {
      // Supabase returns a generic error when the email is already registered
      if (error.message.toLowerCase().includes("already registered") ||
          error.message.toLowerCase().includes("already been registered") ||
          error.status === 422) {
        alert("This email address is already registered. Please log in instead.")
      } else {
        alert(error.message)
      }
      return
    }

    if (data?.session) {
      setSession(data.session)
      closeSignUp()
      return
    }

    setEmail(signUpEmail.trim())
    setPassword(signUpPassword)
    closeSignUp()
    alert("Account created. Please log in.")
  }

  const closeSignUp = () => {
    setShowSignUp(false)
    setSignUpEmail("")
    setSignUpPassword("")
    setSignUpConfirmPassword("")
  }

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  }

  const modalStyle = {
    background: "#fff",
    borderRadius: 10,
    padding: "36px 32px 28px",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    position: "relative",
  }

  const inputStyle = {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    marginBottom: 14,
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: 15,
    boxSizing: "border-box",
  }

  const btnPrimary = {
    width: "100%",
    padding: "11px 0",
    background: "#ffc107",
    color: "#222",
    border: "none",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    marginBottom: 8,
  }

  const btnSecondary = {
    padding: "9px 22px",
    background: "#fff",
    color: "#333",
    border: "1px solid #aaa",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f4f4",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: "44px 36px 36px",
        width: "100%",
        maxWidth: 360,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
      }}>
        <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 700, textAlign: "center", color: "#222" }}>
          Site Diary
        </h2>

        <form onSubmit={handleLogin}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#555" }}>
            Email
          </label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#555" }}>
            Password
          </label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          <button type="submit" disabled={loginLoading} style={{ ...btnPrimary, marginTop: 6 }}>
            {loginLoading ? "Logging in…" : "Log In"}
          </button>
        </form>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button onClick={() => setShowSignUp(true)} style={btnSecondary}>
            Sign Up
          </button>
        </div>
      </div>

      {/* Sign-Up Modal */}
      {showSignUp && (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) closeSignUp() }}>
          <div style={modalStyle}>
            <button
              onClick={closeSignUp}
              style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}
            >
              ✕
            </button>

            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#222" }}>Create Account</h3>
            <form onSubmit={handleSignUp}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#555" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="your@email.com"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                required
                style={inputStyle}
              />

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#555" }}>
                Password
              </label>
              <input
                type="password"
                placeholder="Min. 6 characters"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                required
                style={inputStyle}
              />

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#555" }}>
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={signUpConfirmPassword}
                onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                required
                style={inputStyle}
              />

              <button type="submit" disabled={signUpLoading} style={{ ...btnPrimary, marginTop: 4 }}>
                {signUpLoading ? "Creating account…" : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
