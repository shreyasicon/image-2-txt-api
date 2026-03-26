# Setup Instructions for Iconic Vault

Follow these steps to get Iconic Vault running on your machine.

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm
- A web browser (Chrome, Firefox, Safari, or Edge)
## Step 1: Clone or Extract Project

If cloning from GitHub:
```bash
git clone <repository-url>
cd iconic-vault
```

If extracted as ZIP:
```bash
unzip iconic-vault.zip
cd iconic-vault
```

## Step 2: Install Dependencies (2-3 minutes)

```bash
pnpm install
```

Or with npm:
```bash
npm install
```

## Step 3: Environment Variables (optional)

Create `.env.local` in the project root (`webapp/scalable`) only if you need a custom OCR URL or Cognito:

```env
NEXT_PUBLIC_OCR_API_BASE=https://your-api.execute-api.us-east-1.amazonaws.com/prod
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=us-east-1
```

Do not commit `.env.local`. Restart `pnpm dev` after changes.

## Step 4: Start Development Server (1 minute)

```bash
pnpm dev
```

Or with npm:
```bash
npm run dev
```

You should see output like:
```
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Ready in 1.2s
```

## Step 5: Open in Browser

Open http://localhost:3000 in your web browser.

You should see:
- Iconic Vault logo
- Hero section with animation
- Feature highlights
- "Enter Vault" button

## Step 6: Test the Application

1. **Landing Page** — Explore the homepage
2. **Dashboard** — Enter the dashboard
3. **Upload** — Sidebar → Upload; drag an image with text
4. **Extract** — Wait for OCR result
5. **Translate / Find Images** — Optional flows from the sidebar
6. **Vault** — When signed in, manage saved content

## Troubleshooting

### Problem: "Cannot find module '@/lib/api'"
**Solution**: Make sure you're in the correct directory and installed dependencies:
```bash
cd iconic-vault
pnpm install
```

### Problem: ".env.local file not found" warning
**Solution**: Ensure `.env.local` file exists in the project root:
```bash
# Check if file exists
ls -la .env.local

# If not, create it (optional vars only)
touch .env.local
```

### Problem: OCR extraction fails
**Solution**: 
- Try a different image (JPG, PNG, WebP)
- Ensure image has clear, readable text
- Check file size is under 20MB
- Try a cropped portion of the image

### Problem: "Build failed" or other errors
**Solution**:
```bash
# Clear cache and reinstall
rm -rf node_modules .next
pnpm install
pnpm dev
```

## Advanced Setup

### Using npm instead of pnpm

```bash
npm install
npm run dev
```

### Building for Production

```bash
pnpm build
pnpm start
```

### Running with specific port

```bash
pnpm dev -- -p 3001
```

### Debugging in VS Code

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js",
      "type": "node",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

## Environment Variables Reference

| Variable | Required | Type | Example |
|----------|----------|------|---------|
| `NEXT_PUBLIC_OCR_API_BASE` | No | URL | `https://xxx.execute-api.us-east-1.amazonaws.com/prod` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | For auth | String | `us-east-1_xxxxx` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | For auth | String | App client ID |
| `NEXT_PUBLIC_AWS_REGION` | For auth | String | `us-east-1` |

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `.env.local` | Project root | Environment variables |
| `.env.local.example` | Project root | Template file |
| `QUICKSTART.md` | Project root | Quick start guide |
| `README.md` | Project root | Full documentation |

## Next Steps

1. **Explore Features** - Try all pages and features
2. **Customize** - Edit colors in `app/globals.css`
3. **Deploy** - Push to GitHub and deploy on Vercel
4. **Extend** - Add new features by creating components
5. **Share** - Share your vault with others

## Support

If you encounter issues:

1. **Check Documentation**
   - README.md - Full documentation
   - QUICKSTART.md - Quick reference
   - PROJECT_SUMMARY.md - Project overview

2. **Check Console**
   - Open browser DevTools (F12)
   - Check Console tab for errors
   - Check Network tab for API issues

3. **Verify Setup**
   - Optional `.env.local` if using custom API or Cognito
   - Dependencies are installed
   - Dev server is running

## Quick Commands Reference

```bash
# Setup
pnpm install              # Install dependencies
cp .env.local.example .env.local  # Copy env template

# Development
pnpm dev                  # Start dev server
pnpm build                # Build for production
pnpm start                # Run production build
pnpm lint                 # Check code quality

# Maintenance
pnpm update               # Update dependencies
rm -rf node_modules       # Clear node_modules
rm -rf .next              # Clear build cache
```

## Performance Notes

- Initial page load: typically 1–2 seconds
- Text extraction: depends on OCR API and image size

These times depend on network speed, API latency, and image complexity.

## Security Reminders

⚠️ **Important**:
- Never commit `.env.local` to GitHub
- Do not expose secrets in client-side code beyond intended `NEXT_PUBLIC_` vars
- Use Cognito for authenticated API calls where required

## Deployment

When ready to deploy:

1. **GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push
   ```

2. **Vercel**
   - Go to vercel.com
   - Click "New Project"
   - Select your GitHub repository
   - Add `NEXT_PUBLIC_OCR_API_BASE` and Cognito-related variables as needed
   - Deploy

## Getting Help

- **Documentation**: See README.md
- **Quick Start**: See QUICKSTART.md
- **Troubleshooting**: See this file
- **Project Info**: See PROJECT_SUMMARY.md

---

**You're all set!** 🚀

Your Iconic Vault should now be running at http://localhost:3000

**Tagline**: Create. Store. Elevate.
