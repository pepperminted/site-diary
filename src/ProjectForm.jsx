'use client'

import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

export default function ProjectForm({ user, refreshProjects }) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phase, setPhase] = useState("")
  const [clientName, setClientName] = useState("")
  const [contact, setContact] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [locationStatus, setLocationStatus] = useState("Detecting device location...")

  const captureLocation = async (showError = false) => {
    if (!navigator.geolocation) {
      setLocationStatus("Location unavailable")
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLat = Number(position.coords.latitude.toFixed(6))
          const nextLng = Number(position.coords.longitude.toFixed(6))
          setLat(String(nextLat))
          setLng(String(nextLng))
          setLocationStatus(`Location captured: ${nextLat}, ${nextLng}`)
          resolve({ lat: nextLat, lng: nextLng })
        },
        (err) => {
          setLocationStatus("Location unavailable")
          if (showError) {
            alert("Error getting location: " + err.message)
          }
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
  }

  useEffect(() => {
    captureLocation(false)
  }, [])

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    const projectName = name.trim()
    if (!projectName) {
      alert("Project name is required")
      return
    }

    let projectLat = lat.trim()
    let projectLng = lng.trim()

    if (!projectLat || !projectLng) {
      const coords = await captureLocation(false)
      if (coords) {
        projectLat = String(coords.lat)
        projectLng = String(coords.lng)
      }
    }

    const parsedLat = projectLat ? Number(projectLat) : null
    const parsedLng = projectLng ? Number(projectLng) : null

    if (projectLat && !Number.isFinite(parsedLat)) {
      alert("Latitude must be a valid number")
      return
    }

    if (projectLng && !Number.isFinite(parsedLng)) {
      alert("Longitude must be a valid number")
      return
    }

    const { error } = await supabase.from("projects").insert([
      {
        name: projectName,
        address,
        phase,
        client: clientName.trim() || null,
        contact: contact.trim() || null,
        lat: parsedLat,
        lng: parsedLng,
        user_id: user.id,
      },
    ])

    if (error) return alert(error.message)

    setName("")
    setAddress("")
    setPhase("")
    setClientName("")
    setContact("")

    refreshProjects()
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
      <h3>Add New Project</h3>

      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ flex: "1 1 160px", minWidth: "120px" }}
        />

        <input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: "160px" }}
        />

        <input
          placeholder="Location auto-captured"
          value={lat && lng ? `${lat}, ${lng}` : "Pending"}
          readOnly
          style={{ flex: "1 1 220px", minWidth: "180px" }}
        />

        <input
          placeholder="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          style={{ flex: "1 1 120px", minWidth: "110px" }}
        />

        <input
          placeholder="Longitude"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          style={{ flex: "1 1 120px", minWidth: "110px" }}
        />

        <button type="button" onClick={() => captureLocation(true)} style={{ flex: "0 0 auto" }}>
          Retry Location
        </button>

        <input
          placeholder="Phase"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          style={{ flex: "1 1 140px", minWidth: "120px" }}
        />

        <input
          placeholder="Client"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: "130px" }}
        />

        <input
          placeholder="Contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: "130px" }}
        />

        <button type="submit" style={{ flex: "0 0 auto" }}>Save Project</button>
      </div>

      <p style={{ marginTop: "8px", color: "#555", fontSize: "12px" }}>
        {locationStatus}
      </p>
    </form>
  )
}