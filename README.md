# Avatar Chatbot

Avatar chatbot with:
- Mobile-style avatar UI inspired by your sample design
- Text input and voice input (speech recognition)
- AI replies that follow the language used by the user
- Avatar voice output (text-to-speech)
- Configurable AI provider: Gemini (default) or OpenAI

## Requirements
- Node.js 18+
- At least one API key:
  - Gemini API key (recommended for free-tier testing)
  - or OpenAI API key

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from example:
   ```bash
   cp .env.example .env
   ```
3. Configure `.env`:
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.0-flash

   # Optional fallback provider
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini

   HOST=127.0.0.1
   PORT=3000
   ```

## Run
```bash
npm start
```
Then open: `http://127.0.0.1:3000`

## Deploy on Vercel (Beginner)
1. Push this project to GitHub.
2. Go to Vercel and click `Add New...` -> `Project`.
3. Import your GitHub repo.
4. In `Environment Variables`, add:
   - `AI_PROVIDER` = `gemini` (or `openai`)
   - `GEMINI_API_KEY` = your Gemini key
   - `GEMINI_MODEL` = `gemini-2.0-flash`
   - `OPENAI_API_KEY` (optional)
   - `OPENAI_MODEL` (optional)
5. Click `Deploy`.
6. Open your Vercel URL and test chat.

Notes:
- Vercel uses `api/chat.js` for backend and `public/` for frontend routes.
- Do not put real keys in `.env.example` or frontend files.

## Provider switching
- Use Gemini (default):
  ```env
  AI_PROVIDER=gemini
  ```
- Use OpenAI:
  ```env
  AI_PROVIDER=openai
  ```

## How it works
- Frontend uses Web Speech API for microphone input.
- Frontend can switch to keyboard typing mode.
- Backend sends messages to selected provider and enforces same-language replies via system rules.
- Frontend reads assistant responses aloud with browser text-to-speech and mouth animation.

## Notes
- If browser blocks mic, allow microphone permission and retry.
- Voice quality depends on voices installed in the browser/OS.
- Male voice is prioritized when available in your system voices.
- If no valid API key is set for selected provider, app runs in fallback mode.
