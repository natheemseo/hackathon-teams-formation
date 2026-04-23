# Hackathon Draft — Deployment Guide

A step-by-step guide to get your app live on the internet. **No command line, no coding.** Everything happens in your browser.

**Total time:** ~30 minutes the first time. Free. No credit card needed.

---

## What you'll end up with

A normal URL like `https://hackathon-draft-abc123.vercel.app` that you share with your presenters. They open it in any browser — no login, no install.

## The 4 stages

1. **Supabase** — set up the database (~10 min)
2. **GitHub** — upload the code (~5 min)
3. **Vercel** — deploy it live (~5 min)
4. **Connect them** — paste database keys into Vercel (~5 min)

---

## STAGE 1 — Set up the database (Supabase)

Supabase is a free database service. It's where your voting data and team claims will live.

### 1.1 — Create a Supabase account

1. Go to **https://supabase.com**
2. Click **Start your project** (top right)
3. Sign up with your GitHub account (easiest — click "Continue with GitHub")

### 1.2 — Create a new project

1. After signing in, click **New project**
2. If it asks you to create an "organization" first, name it anything (e.g., your name). Pick the **Free** plan.
3. Fill in the project details:
   - **Name**: `hackathon-draft` (or anything)
   - **Database Password**: click "Generate a password" — **copy it somewhere safe** (you won't use it today, but good to have)
   - **Region**: pick the one closest to you (for India, choose **Mumbai** or **Singapore**)
   - Leave other settings as default
4. Click **Create new project**
5. Wait ~2 minutes while it provisions. You'll see a loading screen.

### 1.3 — Run the database setup script

Once your project is ready:

1. In the left sidebar, click the **SQL Editor** icon (looks like a database with `>_`)
2. Click **New query** (or **+ New snippet**)
3. Open the file `supabase-setup.sql` (included in this folder) in any text editor (e.g., Notepad). Copy ALL of its contents.
4. Paste it into the Supabase SQL editor
5. Click the green **Run** button (bottom right, or press Ctrl+Enter)
6. You should see **"Success. No rows returned"** at the bottom. ✅

This just created two tables (`sessions` and `claims`) and turned on real-time updates.

### 1.4 — Copy your database keys

You need two pieces of info to connect your app to this database.

1. In the left sidebar, click the **gear icon** (Project Settings) at the bottom
2. Click **API** in the settings menu
3. You'll see two important values — **keep this tab open**, you'll need them later:
   - **Project URL** — something like `https://abcdefghijk.supabase.co`
   - **anon public** key (under "Project API keys") — a long string starting with `eyJ...`

> 💡 The "anon" key is safe to put in your frontend code. It only has the permissions you defined in the SQL script.

**✅ Stage 1 done. Leave this tab open.**

---

## STAGE 2 — Upload the code to GitHub

### 2.1 — Create a new repository

1. Go to **https://github.com** (sign in if needed)
2. Click the **+** icon in the top-right corner → **New repository**
3. Fill in:
   - **Repository name**: `hackathon-draft`
   - **Description**: (optional)
   - Leave it as **Public**
   - ❌ Do NOT check "Add a README file" or add anything else
4. Click **Create repository**

### 2.2 — Upload the project files

You'll see a page that says "Quick setup". Look for the text **"uploading an existing file"** (it's a blue link in the middle of the page) and click it.

Now you need to upload all the files from the `deploy` folder I gave you.

1. Open the `deploy` folder on your computer in a file explorer window
2. **Select ALL the files and folders inside it** (including the hidden `.gitignore` — on Windows, enable "Show hidden files" in View settings; on Mac, press Cmd+Shift+.)
3. Drag them all into the GitHub upload area

> ⚠️ Important: upload the CONTENTS of the `deploy` folder, not the `deploy` folder itself. The file `package.json` should be at the top level of your repository, not inside a `deploy` subfolder.

4. You should see a list that includes: `index.html`, `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `supabase-setup.sql`, and a `src` folder
5. Scroll down to **Commit changes**
6. Leave the message as default and click **Commit changes**

**✅ Stage 2 done.**

---

## STAGE 3 — Deploy to Vercel

Vercel is the service that takes your code and makes it live on the internet.

### 3.1 — Create a Vercel account

1. Go to **https://vercel.com**
2. Click **Sign Up**
3. Choose **Continue with GitHub** (easiest)
4. Authorize Vercel to access your GitHub account when prompted

### 3.2 — Import your project

1. After signing in, you should see a dashboard. Click **Add New...** → **Project** (top right)
2. You'll see a list of your GitHub repositories. Find `hackathon-draft` and click **Import** next to it.
   - If you don't see it, click **"Adjust GitHub App Permissions"** and grant access to the repo.

### 3.3 — Configure the environment variables

**This is the most important step.** Before deploying, you need to paste in the Supabase keys.

1. On the "Configure Project" page, find the **Environment Variables** section (you may need to expand it)
2. Add the first variable:
   - **Name**: `VITE_SUPABASE_URL`
   - **Value**: paste your **Project URL** from Supabase (the `https://abc...supabase.co` one)
   - Click **Add**
3. Add the second variable:
   - **Name**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: paste your **anon public** key from Supabase (the long `eyJ...` string)
   - Click **Add**

> ⚠️ The variable names must be **exactly** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — case-sensitive, no typos. Copy them from this guide if you're unsure.

### 3.4 — Deploy

1. Leave all other settings as default (Framework: Vite should be auto-detected)
2. Click **Deploy**
3. Wait ~1–2 minutes. You'll see build logs scrolling. When done, you'll see confetti 🎉
4. Click **Continue to Dashboard** or click on the screenshot preview to visit your live app

**Your app is live!** The URL will be something like `https://hackathon-draft-xyz.vercel.app`

**✅ Stage 3 done.**

---

## STAGE 4 — Test it

1. Open your Vercel URL in a browser
2. You should see the **"Set up the draft"** page with some sample data pre-filled
3. Click **Start the Draft →**
4. You should land on the **Organizer Dashboard** with copyable links for each presenter

### Try a quick test:

- Copy one of the presenter links
- Open it in an **incognito/private window** (or a different browser)
- Claim a team member
- Go back to the organizer dashboard — you should see the claim appear within a second ✨

If this works, you're ready for tomorrow.

---

## Using it during the hackathon

### Before the event

1. Open your live URL
2. Replace the sample pitches with the real ones:
   ```
   Alice — Topical Authority Maps
   Bob — AI Snippet Generator
   ```
3. Paste the voting data (from whatever tool you used to collect votes):
   ```
   Priya: Alice, Carla
   Rahul: Bob, David, Alice
   ```
4. Pick team size and click **Start the Draft**
5. From the dashboard, **copy each presenter's link** and send it to them (Slack, WhatsApp, email — whatever)

### During the event

- Presenters open their links and race to claim
- The instant one presenter claims someone, that name disappears from every other presenter's list
- You can watch all the teams form live on the organizer dashboard
- If something goes wrong, you have a **Reset claims** button on the dashboard

---

## Troubleshooting

### "Database not connected" when I open the site
Your environment variables aren't set correctly. Go to **Vercel → your project → Settings → Environment Variables** and check that both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist and the values are correct. After fixing, go to **Deployments → click the latest one → the three dots menu → Redeploy**.

### "Could not save session"
Your database tables aren't set up. Go back to Stage 1.3 and run the SQL script.

### Names aren't disappearing in real-time
Real-time updates might not be enabled. Go to Supabase → **Database → Replication** in the sidebar, find the `claims` table, and make sure it's toggled ON. Or re-run the SQL script from Stage 1.3 — the last line handles this.

### I want to change the code
Edit `src/App.jsx` directly on GitHub (click the file → click the pencil icon → edit → commit). Vercel will automatically redeploy within ~1 minute.

### I want a prettier URL
In Vercel → your project → **Settings → Domains**, you can change the auto-generated name to something like `seo-draft.vercel.app` (if it's not taken).

---

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The HTML shell the browser loads |
| `package.json` | List of code libraries the app depends on |
| `vite.config.js` | Build tool config |
| `tailwind.config.js`, `postcss.config.js` | Styling config |
| `src/App.jsx` | The main app — all the UI and logic |
| `src/main.jsx` | Entry point that renders the app |
| `src/index.css` | Imports Tailwind styles |
| `supabase-setup.sql` | Database setup script (run once in Supabase) |
| `.gitignore` | Tells git to skip temp files |

You don't need to edit any of these unless you want to change how the app works.
