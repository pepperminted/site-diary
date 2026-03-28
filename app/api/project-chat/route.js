const PROJECT_ASSISTANT_SYSTEM_PROMPT = "you are construction project assistant. Answer questions about this project using ONLY the diary entries provided. If data isn't in the entries, state so clearly. Be very pricise with numbers and dates. At the end of each message always add a final line in exactly this format: Cited entry ids: id1, id2"
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

  return [
    `Entry ${index + 1}`,
    `id: ${entryId}`,
    `created_at: ${createdAt}`,
    `entry_type: ${entry?.type || "unknown"}`,
    `text: ${text}`,
    `ai_parsed: ${parsedData}`,
    `has_photo: ${Boolean(entry?.photo_urls)}`,
    `has_audio: ${Boolean(entry?.audio_url)}`,
  ].join("\n")
}

function buildUserPrompt(projectName, entries, question) {
  const sortedEntries = [...entries].sort((left, right) => {
    const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0
    const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0
    return leftTime - rightTime
  })

  const formattedEntries = sortedEntries.map((entry, index) => formatEntryForPrompt(entry, index)).join("\n\n---\n\n")

  return [
    `Project: ${projectName || "Unnamed Project"}`,
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
  const question = typeof body?.question === "string" ? body.question.trim() : ""
  const entries = Array.isArray(body?.entries) ? body.entries : []

  if (!question) {
    return Response.json({ error: "A question is required." }, { status: 400 })
  }

  if (entries.length === 0) {
    return Response.json({ error: "This project has no diary entries yet." }, { status: 400 })
  }

  const claudeResult = await requestClaudeMessage({
    apiKey,
    system: PROJECT_ASSISTANT_SYSTEM_PROMPT,
    maxTokens: 800,
    userContent: buildUserPrompt(projectName, entries, question),
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