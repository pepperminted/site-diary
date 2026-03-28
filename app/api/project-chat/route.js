const PROJECT_ASSISTANT_SYSTEM_PROMPT = "You are a construction project assistant. Depending on user scope, answer from either one selected project or across all selected projects in the prompt. Use only diary entries provided. Never invent missing facts. If information is unavailable, say so clearly. Be precise with dates, numbers, units, and sequence of events. At the end of each response always add a final line in exactly this format: Cited entry ids: id1, id2"
const DEFAULT_CLAUDE_MODELS = [
  "claude-3-5-haiku-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-haiku-latest",
]

const INVALID_MODEL_NAMES = new Set(["default", "test", "placeholder", ""])

function extractCitedEntryIds(answer, entries) {
  const knownEntryIds = new Set(entries.map((entry) => String(entry?.id ?? "").trim()).filter(Boolean))
  const citationMatch = answer.match(/(?:^|\n)Cited entry ids:\s*(.+)$/i)

  if (!citationMatch) {
    return []
  }

  return Array.from(
    new Set(
      citationMatch[1]
        .split(",")
        .map((entryId) => entryId.trim().replace(/^\[|\]$/g, ""))
        .filter((entryId) => knownEntryIds.has(entryId))
    )
  )
}

function stripCitationLine(answer) {
  return answer.replace(/\n?Cited entry ids:\s*.+$/i, "").trim()
}

function formatEntryForPrompt(entry, index) {
  const entryId = entry?.id ?? `unknown-${index + 1}`
  const createdAt = entry?.created_at ? new Date(entry.created_at).toISOString() : "unknown"
  const parsedData = entry?.ai_parsed ? JSON.stringify(entry.ai_parsed) : "null"
  const text = typeof entry?.text === "string" && entry.text.trim() ? entry.text.trim() : "(no text)"
  const projectName = entry?.project_name_context || entry?.project_name || "Unknown Project"

  return [
    `Entry ${index + 1}`,
    `id: ${entryId}`,
    `project: ${projectName}`,
    `created_at: ${createdAt}`,
    `entry_type: ${entry?.type || "unknown"}`,
    `text: ${text}`,
    `ai_parsed: ${parsedData}`,
    `has_photo: ${Boolean(entry?.photo_urls)}`,
    `has_audio: ${Boolean(entry?.audio_url)}`,
  ].join("\n")
}

function buildUserPrompt(projectName, projectScope, entries, question) {
  const sortedEntries = [...entries].sort((left, right) => {
    const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0
    const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0
    return leftTime - rightTime
  })

  const formattedEntries = sortedEntries.map((entry, index) => formatEntryForPrompt(entry, index)).join("\n\n---\n\n")
  const allProjectsMode = projectScope === "all"
  const selectedProjectsMode = projectScope === "selected"

  return [
    `Selected scope: ${allProjectsMode ? "All Projects" : selectedProjectsMode ? "Selected Projects" : "Single Project"}`,
    `Selected project label: ${projectName || "Unnamed Project"}`,
    allProjectsMode
      ? "You may compare and summarize across projects when asked, but use only provided entries."
      : selectedProjectsMode
        ? "Compare and summarize only across the selected projects represented in these entries."
        : "Use only entries from this selected project.",
    "Diary entries:",
    formattedEntries,
    "",
    `Question: ${question}`,
  ].join("\n")
}

function getClaudeModelsFromEnv() {
  const configuredModels = [
    process.env.ANTHROPIC_MODEL,
    process.env.CLAUDE_MODEL,
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter((value) => value && !INVALID_MODEL_NAMES.has(value.toLowerCase()))

  return Array.from(new Set([...configuredModels, ...DEFAULT_CLAUDE_MODELS]))
}

async function requestClaudeMessage({ apiKey, system, maxTokens, userContent }) {
  const models = getClaudeModelsFromEnv()
  let lastErrorMessage = "Claude request failed."

  for (const model of models) {
    let anthropicResponse
    let anthropicPayload

    try {
      anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0,
          system,
          messages: [
            {
              role: "user",
              content: userContent,
            },
          ],
        }),
        cache: "no-store",
      })

      anthropicPayload = await anthropicResponse.json()
    } catch {
      return { error: "Failed to reach Claude.", status: 502 }
    }

    if (anthropicResponse.ok) {
      return { payload: anthropicPayload }
    }

    lastErrorMessage = anthropicPayload?.error?.message || lastErrorMessage

    const looksLikeModelError = /model/i.test(lastErrorMessage)
    if (!looksLikeModelError) {
      return { error: lastErrorMessage, status: anthropicResponse.status }
    }
  }

  return {
    error: "Claude rejected the configured model. Set ANTHROPIC_MODEL in .env.local to a model your API key can access.",
    status: 502,
  }
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY

  if (!apiKey) {
    return Response.json({ error: "Claude API key is not configured on the server." }, { status: 500 })
  }

  let body

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const projectName = typeof body?.projectName === "string" ? body.projectName.trim() : ""
  const projectScope = ["all", "selected", "single"].includes(body?.projectScope) ? body.projectScope : "single"
  const question = typeof body?.question === "string" ? body.question.trim() : ""
  const entries = Array.isArray(body?.entries) ? body.entries : []

  if (!question) {
    return Response.json({ error: "A question is required." }, { status: 400 })
  }

  if (entries.length === 0) {
    return Response.json(
      {
        error:
          projectScope === "all"
            ? "No diary entries found across selected projects."
            : projectScope === "selected"
              ? "No diary entries found for the selected project set."
              : "This project has no diary entries yet.",
      },
      { status: 400 }
    )
  }

  const claudeResult = await requestClaudeMessage({
    apiKey,
    system: PROJECT_ASSISTANT_SYSTEM_PROMPT,
    maxTokens: 800,
    userContent: buildUserPrompt(projectName, projectScope, entries, question),
  })

  if (claudeResult.error) {
    return Response.json({ error: claudeResult.error }, { status: claudeResult.status || 502 })
  }

  const anthropicPayload = claudeResult.payload

  const answer = anthropicPayload?.content
    ?.filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim()

  if (!answer) {
    return Response.json({ error: "Claude returned an empty answer." }, { status: 502 })
  }

  const citedEntryIds = extractCitedEntryIds(answer, entries)

  return Response.json({
    answer,
    answerBody: stripCitationLine(answer),
    citedEntryIds,
  })
}