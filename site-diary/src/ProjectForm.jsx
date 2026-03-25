'use client'

import React, { useState } from "react"
import { supabase } from "./supabaseClient"

export default function ProjectForm({ user, refreshProjects }) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phase, setPhase] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    const { error } = await supabase.from("projects").insert([
      {
        name,
        address,
        phase,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        user_id: user.id,
      },
    ])

    if (error) return alert(error.message)

    setName("")
    setAddress("")
    setPhase("")
    setLat("")
    setLng("")

    refreshProjects()
  }

  // Grab current location from browser
  const getLocation = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported")

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude)
        setLng(position.coords.longitude)
      },
      (err) => alert("Error getting location: " + err.message)
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
      <h3>Add New Project</h3>

      <input
        placeholder="Project Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <input
        placeholder="Phase (e.g., foundations)"
        value={phase}
        onChange={(e) => setPhase(e.target.value)}
      />

      <div style={{ marginTop: "10px" }}>
        <input
          placeholder="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
        <input
          placeholder="Longitude"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
        />
        <button type="button" onClick={getLocation}>
          Use Current Location
        </button>
      </div>

      <button type="submit" style={{ marginTop: "10px" }}>
        Save Project
      </button>
    </form>
  )
}