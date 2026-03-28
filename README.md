# site-diary

Vite + React skeleton with Tailwind and Supabase (minimal).

Quick start:

```powershell
cd site-diary
npm install
npm run dev
```

Claude parsing setup:

```powershell
# .env.local
ANTHROPIC_API_KEY=your_claude_api_key
# optional
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

If your Claude API key cannot access that model, set `ANTHROPIC_MODEL` to one your account supports. The app will also try a small fallback list automatically.

When a user submits an entry with text, the app now sends that text to the server route at `/api/claude-parse`, applies the construction diary system prompt, and stores the returned JSON in the `entries.ai_parsed` column during the same Supabase insert.

Project AI Q&A persistence:

Run the SQL in [supabase/project_chat_messages.sql](supabase/project_chat_messages.sql) to create the `project_chat_messages` table and RLS policies. Project Q&A history is then loaded from Supabase on project open and each user question plus Claude answer is saved there so the conversation survives page reloads.
