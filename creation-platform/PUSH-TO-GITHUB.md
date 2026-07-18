# Saving this project to GitHub

Your repo: **https://github.com/Hunting-Fishing/366-AI-Software-Homebrew**

The easiest way (no commands, recommended): **GitHub Desktop**.

## One-time setup (~5 minutes)

1. Install **GitHub Desktop** from https://desktop.github.com and sign in with your Hunting-Fishing account.
2. In GitHub Desktop: **File → Clone repository** → pick `Hunting-Fishing/366-AI-Software-Homebrew` → choose where to put it (e.g. `Documents\366-AI`) → **Clone**.
3. Open that cloned folder in File Explorer. Copy the whole **`creation-platform`** folder (from your Claude outputs folder) into it. Also copy `BLUEPRINT.md` and the old `ai-app-builder` folder if you want the full history of the project.
4. Go back to GitHub Desktop — it will show all the new files automatically.
5. Bottom-left: type a commit message like `v0.6 — creation platform` → click **Commit to main** → click **Push origin** (top bar).

Done — your code is on GitHub.

## Every update after that (30 seconds)

1. Copy the updated `creation-platform` folder over the old one in your cloned repo folder (replace files).
2. GitHub Desktop shows what changed → **Commit to main** → **Push origin**.

## Important

- The `.gitignore` file I included makes sure your **`.env` (API keys)**, `node_modules`, and saved projects are **never uploaded**. Double-check in GitHub Desktop's changes list that `.env` is NOT listed before committing. If you ever see it there, don't push — tell me.
- Your repo is public by default unless you made it private. For code containing your product's "secret sauce" prompts, I recommend **private**: repo page → Settings → General → Danger Zone → Change visibility.

## Command-line alternative (if you ever install Git)

```
cd path\to\creation-platform
git init
git remote add origin https://github.com/Hunting-Fishing/366-AI-Software-Homebrew.git
git add .
git commit -m "v0.6 - creation platform"
git branch -M main
git push -u origin main
```
