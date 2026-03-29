# Deploy the frontend to AWS Amplify

This lets you host the Image to Text API **web UI** on AWS so users can open it in the browser and use your Lambda API without running anything locally.

## Prerequisites

- Your Lambda API is deployed and the URL works (e.g. `https://xxxx.execute-api.us-east-1.amazonaws.com/prod`).
- Your code is in a **Git repository** (GitHub, GitLab, Bitbucket, or AWS CodeCommit), **or** you can use “Deploy without Git”.

---

## Option A: Deploy with Git (recommended)

### 1. Push your project to a Git repo

If not already:

```bash
git init
git add index.html amplify.yml scripts/
git commit -m "Add Amplify frontend"
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Create an Amplify app

1. Open **AWS Amplify Console** → [Amplify](https://console.aws.amazon.com/amplify/).
2. Click **New app** → **Host web app**.
3. Choose your provider (GitHub / GitLab / Bitbucket / CodeCommit), authorize, and select the repo and branch (e.g. `main`).
4. Amplify will detect the repo. For **Build settings** choose “Use existing build spec” and it will use the `amplify.yml` in the repo.

### 3. Set the API URL (Lambda) as an environment variable

1. In the Amplify app, go to **App settings** → **Environment variables**.
2. Add a variable:
   - **Key:** `API_BASE_URL`
   - **Value:** your API Gateway URL, e.g. `https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod`  
   (no trailing slash)
3. Save. Then run a **Redeploy this version** for the branch so the new build uses this value.

### 4. Build and deploy

1. Click **Save and deploy** (or trigger a new build).
2. The build will run `node scripts/replace-api-url.js`, which injects `API_BASE_URL` into `index.html`.
3. When the build finishes, Amplify gives you a URL (e.g. `https://main.xxxx.amplifyapp.com`). Open it to use the UI; it will already point at your Lambda API.

---

## Option B: Git-connected app (this project) — push, then release

The API demo Amplify app is **connected to Git**, so hosting does **not** accept manual zip uploads. To publish what you have locally:

1. Commit and push your changes (`api/index.html`, `amplify.yml`, `scripts/`, etc.).
2. Either wait for the automatic build on push, or trigger a build from the latest commit:

```bash
cd api
npm install
npm run amplify:release
```

(`amplify:release` runs `startJob` with `jobType: RELEASE`, which builds from the current branch tip in the remote repo — so you must **push** before the new UI is included.)

Environment variable `API_BASE_URL` (no trailing slash) should still be set under Amplify **App settings → Environment variables** so `preBuild` can inject it into `index.html`.

---

## Option C: Manual zip (`npm run deploy:amplify`) — apps **without** Git only

From the `api/` folder, with AWS credentials configured:

```bash
npm install
npm run deploy:amplify
```

This copies `index.html`, runs `scripts/replace-api-url.js`, zips `index.html`, and uploads via Amplify manual deploy. **This only works** if the Amplify app is **not** connected to a repository. If you see “App is already connected a repository”, use Option B instead.

---

## Option D: Deploy without Git (console zip)

1. In **Amplify Console** → **New app** → **Host web app**.
2. Choose **Deploy without Git**.
3. Upload a **zip** of your app. The zip must contain at the root:
   - `index.html` (with `__API_BASE_URL__` already replaced by your API URL, or leave it and type the URL in the UI).
   - Any other assets (e.g. `app.js` if you split it out).
4. To pre-fill the API URL in the zip: before zipping, run:
   ```bash
   set API_BASE_URL=https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod
   node scripts/replace-api-url.js
   ```
   Then zip the project (including the modified `index.html`) and upload.

---

## After deployment

- **Amplify URL:** e.g. `https://main.xxxx.amplifyapp.com` — open this to use the UI.
- The UI will use the injected **API base URL** (Lambda) by default, so “Extract Text” and “Fetch by Job ID” call your API.
- Users can still change the API URL in the input field if needed.

## Optional: custom domain

In Amplify: **App settings** → **Domain management** → add a custom domain and follow the steps to attach it to your app.
