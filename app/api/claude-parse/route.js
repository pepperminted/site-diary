const CLAUDE_SYSTEM_PROMPT = `You are a construction diary parser. Extract structured data from site log entries. Return only JSON, no other text: {"type":"delivery|inspection|note|issue","material":"name if delivery","quantity":number or null, "unit":"m3|kg|pcs|bag|m|m2 etc", "supplier":"name if mentioned", "issue_description":"if type is issue"}`

const ALLOWED_TYPES = new Set(["delivery", "inspection", "note", "issue"])
const DEFAULT_CLAUDE_MODELS = [
  "claude-3-5-haiku-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-haiku-latest",
]

const INVALID_MODEL_NAMES = new Set(["default", "test", "placeholder", ""])

function stripCodeFences(value) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

function normalizeParsedEntry(parsed) {
  const safeType = typeof parsed?.type === "string" ? parsed.type.trim().toLowerCase() : "note"
  const quantity = typeof parsed?.quantity === "number"
    ? parsed.quantity
    : Number.isFinite(Number(parsed?.quantity))
      ? Number(parsed.quantity)
      : null

  return {
    type: ALLOWED_TYPES.has(safeType) ? safeType : "note",
    material: typeof parsed?.material === "string" && parsed.material.trim() ? parsed.material.trim() : null,
    quantity,
    unit: typeof parsed?.unit === "string" && parsed.unit.trim() ? parsed.unit.trim() : null,
    supplier: typeof parsed?.supplier === "string" && parsed.supplier.trim() ? parsed.supplier.trim() : null,
    issue_description:
      typeof parsed?.issue_description === "string" && parsed.issue_description.trim()
        ? parsed.issue_description.trim()
        : null,
  }
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

  const entryText = typeof body?.text === "string" ? body.text.trim() : ""
  if (!entryText) {
    return Response.json({ error: "Text is required for parsing." }, { status: 400 })
  }

  const claudeResult = await requestClaudeMessage({
    apiKey,
    system: CLAUDE_SYSTEM_PROMPT,
    maxTokens: 300,
    userContent: entryText,
  })

  if (claudeResult.error) {
    return Response.json({ error: claudeResult.error }, { status: claudeResult.status || 502 })
  }

  const anthropicPayload = claudeResult.payload

  const textBlock = anthropicPayload?.content?.find((block) => block?.type === "text")
  const rawText = typeof textBlock?.text === "string" ? stripCodeFences(textBlock.text) : ""

  if (!rawText) {
    return Response.json({ error: "Claude returned an empty response." }, { status: 502 })
  }

  try {
    const parsed = JSON.parse(rawText)
    return Response.json({ parsed: normalizeParsedEntry(parsed) })
  } catch {
    return Response.json(
      {
        error: "Claude returned invalid JSON.",
        raw: rawText,
      },
      { status: 502 }
    )
  }
}