# Benyezzar VC Task Manager

A voice-first task manager built for fast, natural task capture and agenda review. Benyezzar VC Task Manager combines browser speech recognition, AI command parsing, local task storage, and premium text-to-speech to create a hands-free productivity experience.

The app is intentionally lightweight: tasks and demo authentication are stored locally in the browser, while AI parsing and premium voice output are handled through secure server-side API endpoints.


## Video Demo

https://drive.google.com/file/d/1IQxvJkWU9ddRvfm9TL8fvgAS5YZIs6z_/view?usp=drive_link

## Live Demo

https://benyezzar-vctm.vercel.app/

## Github Repo

https://github.com/Wassim-Benyz/Benyezzar_VCTM.git

## Key Features

- Voice-first task creation, reading, updating, and deletion
- Natural language command parsing with AI and rule-based fallback
- Create multiple tasks in one command
- Delete single, multiple, or filtered groups of tasks with confirmation
- Semantic task matching for common phrases such as workout, LinkedIn post, meeting, sync, and call
- Conversational assistant responses with task details
- assistant supports interruption-aware conversations, allowing users to speak again while audio playback is still active.
- Realistic low-latency TTS powered by Cartesia Sonic
- Browser SpeechSynthesis fallback when premium TTS is unavailable
- Demo localStorage authentication with signup, login, session, and logout
- Fully local task persistence using localStorage

## Architecture Overview

```text
Browser UI
  |
  |-- Web Speech API captures user speech
  |-- Voice hook manages listening, thinking, and speaking states
  |
Command Parser
  |
  |-- /api/parse-command
  |-- Groq chat completion parses intent + payload
  |-- Rule-based parser fallback runs client-side if AI fails
  |
Task Engine
  |
  |-- VoiceControl resolves intent
  |-- CRUD operations write to localStorage
  |-- Conversation context supports references like "previous task"
  |
Assistant Voice
  |
  |-- /api/text-to-speech
  |-- Cartesia Sonic returns playable audio
  |-- Browser SpeechSynthesis fallback
```

The app keeps AI provider keys server-side. The frontend only calls local API endpoints and never receives provider secrets.

## Tech Stack

- React 19
- Vite 8
- JavaScript
- CSS
- Web Speech API for speech recognition
- Browser SpeechSynthesis fallback
- localStorage for tasks, demo users, sessions, and context
- ESLint

## AI Integrations

### Groq for NLP Parsing

Groq powers the AI command parser through an OpenAI-compatible chat completions endpoint. The parser returns JSON-only command objects:

```json
{
  "intent": "CREATE_TASK",
  "payload": {}
}
```

Supported intents include task creation, reading, updating, deleting, multiple task operations, small talk, and unknown commands.

### Cartesia Sonic for TTS

Cartesia Sonic provides optional premium assistant speech through:

```text
POST https://api.cartesia.ai/tts/bytes
```

The backend returns WAV audio to the frontend, where it is played automatically. If Cartesia fails or is disabled, the app falls back to browser SpeechSynthesis.

## Voice Workflow

1. The user clicks the microphone and speaks naturally.
2. The browser captures speech through the Web Speech API.
3. The transcript is sent to `/api/parse-command`.
4. Groq returns a structured intent and payload.
5. If Groq fails, the local rule-based parser handles supported commands.
6. The app executes the command against localStorage-backed tasks.
7. The assistant creates a concise natural response.
8. The response is sent to `/api/text-to-speech` when Cartesia TTS is enabled.
9. Returned audio plays automatically.
10. If the user starts speaking again, current audio is stopped and the new command is processed.

## Setup

### Prerequisites

- Node.js 20 or newer recommended
- npm
- Groq API key
- Cartesia API key and voice ID, optional but recommended for premium TTS

### Install Dependencies

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant

CARTESIA_API_KEY=your_cartesia_api_key
CARTESIA_VOICE_ID=your_cartesia_voice_id

VITE_USE_CARTESIA_TTS=true
```

Never commit real API keys. Use `.env.example` for placeholders only.

## Run Locally

Start the Vite dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run lint:

```bash
npm run lint
```

## Example Voice Commands

```text
Create task gym tomorrow at 7 AM
Remind me to go to the gym at 8 AM
Add tasks gym at 7, study at 9, and call mom at 5
What do I have tomorrow morning?
Move my morning workout to 8 PM
Change the previous task to tomorrow at 10 AM
Delete the last task
Delete gym and LinkedIn post
Delete all my tasks tomorrow
Clear all tasks
Hi
Thanks
```

## Screenshots



```text
docs/screenshots/login.png
docs/screenshots/voice-dashboard.png
docs/screenshots/task-list.png
docs/screenshots/listening-state.png
docs/screenshots/speaking-state.png
```

## Deployment

The app can be deployed to platforms that support Vite frontend hosting and serverless-style API routes.

Recommended deployment checklist:

- Add production environment variables in the hosting provider dashboard
- Keep `GROQ_API_KEY` and `CARTESIA_API_KEY` server-side only
- Confirm `/api/parse-command` is reachable in production
- Confirm `/api/text-to-speech` returns playable audio
- Run `npm run build` before deployment
- Test browser microphone permissions on the deployed domain

If deploying to a static-only host, provide equivalent backend/serverless endpoints for:

- `POST /api/parse-command`
- `POST /api/text-to-speech`

## Future Improvements

- Real user authentication with a backend and secure sessions
- Cloud task sync across devices
- Calendar integration
- Task priorities, labels, and reminders
- More robust natural language date parsing
- Streaming TTS playback
- Persistent audit log for voice commands
- Expanded semantic task matching
- End-to-end and voice workflow tests

## Important 

If external AI/TTS services become unavailable or hit quota limits,
the application gracefully falls back to local parsing and browser speech synthesis.

## Author

Built by Ouassim Benyezzar.

---

Benyezzar VC Task Manager is a AI-powered voice productivity experience. It is designed to showcase fast iteration, AI-assisted task workflows, and a polished hands-free interface.
