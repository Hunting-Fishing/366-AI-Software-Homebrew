# ⚡ AI App Builder — Your In-House Lovable

Type what you want → an AI (Claude, ChatGPT, or Gemini — your choice) builds a working app → see it live → tell it what to change → save or download.

## Setup (one time, ~10 minutes)

### Step 1 — Install Node.js
Go to https://nodejs.org and install the **LTS** version. Accept all defaults. This is the engine that runs the app.

### Step 2 — Get your API keys
You need at least one (all three is better):

| Provider | Where to get the key |
|---|---|
| Anthropic (Claude) | https://console.anthropic.com → API Keys → Create Key |
| OpenAI (ChatGPT) | https://platform.openai.com/api-keys → Create new secret key |
| Google (Gemini) | https://aistudio.google.com/apikey → Create API key |

Each provider needs a payment method on file. **Set a monthly spending limit** in each console (e.g. $20) so there are no surprises. A typical app generation costs a few cents.

### Step 3 — Add your keys
1. In this folder, find the file `.env.example`.
2. Make a copy of it and rename the copy to exactly `.env` (nothing before the dot).
3. Open `.env` in Notepad and paste your keys after the `=` signs. Save.

### Step 4 — Install and run
Open a terminal **in this folder** (on Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter). Then run:

```
npm install
npm start
```

You'll see "✅ AI App Builder is running!" — open **http://localhost:3000** in your browser.

## Using it

1. Pick an AI from the dropdown (🟢 = key configured).
2. Describe your app: *"A budget tracker with categories and a pie chart."*
3. Wait 20–60 seconds. Your app appears in the live preview.
4. Iterate: *"Make it dark mode"*, *"Add a delete button to each row."*
5. **💾 Save** keeps it in your projects list. **⬇ Download** gives you a single `.html` file that runs anywhere — email it, host it, or open it by double-clicking.

## Turning an app into a real mobile app

Downloaded apps are mobile-responsive websites. To make an installable Android app, use **Capacitor** (free): put your `my-app.html` in a folder as `index.html`, then follow https://capacitorjs.com/docs/getting-started. This is how many commercial app builders do it too.

## How the code is organized

```
ai-app-builder/
├── server.js       ← the web server + the system prompt (the "brain instructions")
├── providers.js    ← the multi-LLM gateway (Claude / OpenAI / Gemini adapters)
├── public/
│   └── index.html  ← the user interface you see in the browser
├── projects/       ← your saved apps (created automatically)
├── .env            ← your secret API keys (you create this — never share it)
└── package.json    ← project settings
```

Want to change how apps are generated? Edit `SYSTEM_PROMPT` in `server.js` — that one block of text is the heart of the product. Want to add another AI provider? Copy one adapter in `providers.js`.

## Troubleshooting

- **"No API key set"** → your `.env` file is missing, misnamed (must be exactly `.env`), or the key wasn't pasted. Restart the server after editing it (`Ctrl+C`, then `npm start`).
- **"npm is not recognized"** → Node.js isn't installed, or reopen the terminal after installing.
- **Port already in use** → add `PORT=3001` to `.env`.
- **Generation fails with a provider error** → check the key is valid and the account has billing enabled; try another provider from the dropdown.

## Important notes

- This runs on **your machine** for **your team**. Before putting it on the public internet, add a login and rate limiting — otherwise strangers could spend your API credits.
- Model names in `.env.example` were current as of mid-2026; when providers release new models, just update the names in `.env`.
