# Push to Git and use with Amplify

## 1. Add these to .gitignore (already done)

- `node_modules/`, `ocr-api.zip`, `.last_deploy_hash`, `uploads/`, `.env`, etc.

## 2. Initialize Git (if not already)

```bash
cd E:\NCi\Sem2\Scalable\Proj\Code
git init
```

## 3. Add and commit

```bash
git add .
git status
git commit -m "Image to Text API: Lambda, API Gateway, S3, Amplify frontend"
```

## 4. Create a repo and push

**GitHub:**

1. Create a new repo at https://github.com/new (no README, no .gitignore).
2. Then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

**GitLab / Bitbucket / CodeCommit:**  
Same idea: create the repo, then:

```bash
git remote add origin <your-repo-clone-url>
git branch -M main
git push -u origin main
```

## 5. Connect to Amplify

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/) → **New app** → **Host web app**.
2. Choose **GitHub** (or your provider), authorize, and select this repository and branch (e.g. `main`).
3. Amplify will use the `amplify.yml` in the repo. Add **Environment variable**:
   - **Key:** `API_BASE_URL`
   - **Value:** `https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod`
4. Click **Save and deploy**. When the build finishes, your frontend will be live and will use the Lambda API by default.
