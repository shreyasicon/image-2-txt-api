# Setup Instructions for Iconic Vault

Follow these steps to get Iconic Vault running on your machine.

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm
- A web browser (Chrome, Firefox, Safari, or Edge)
- An OpenAI API account

## Step 1: Get OpenAI API Key (5 minutes)

1. Visit https://platform.openai.com/api-keys
2. Sign up or log in with your OpenAI account
3. Click "Create new secret key"
4. Copy the key (it starts with `sk-proj-`)
5. **Keep this key safe** - don't share it publicly

**Note**: You'll need an active OpenAI account with credits/payment method set up.

## Step 2: Clone or Extract Project

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

## Step 3: Install Dependencies (2-3 minutes)

```bash
pnpm install
```

Or with npm:
```bash
npm install
```

## Step 4: Create Environment Variables File

Create a new file named `.env.local` in the project root directory.

**Content:**
```env
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
```

Replace `your_openai_api_key_here` with your actual OpenAI key from Step 1.

**Example:**
```env
NEXT_PUBLIC_OPENAI_API_KEY=sk-proj-abc123xyz789
```

**Important Notes:**
- Do NOT commit this file to GitHub
- Do NOT share this key with anyone
- The `NEXT_PUBLIC_` prefix is required
- Make sure there are no spaces around the `=` sign

## Step 5: Verify Environment File

Check that `.env.local` is in the correct location:

```
iconic-vault/
├── .env.local          ← Should be here at root
├── .env.local.example
├── QUICKSTART.md
├── app/
├── components/
└── ...
```

**File should contain only:**
```env
NEXT_PUBLIC_OPENAI_API_KEY=sk-proj-...
```

## Step 6: Start Development Server (1 minute)

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

## Step 7: Open in Browser

Open http://localhost:3000 in your web browser.

You should see:
- Iconic Vault logo
- Hero section with animation
- Feature highlights
- "Enter Vault" button

## Step 8: Test the Application

1. **Landing Page** - Explore the homepage
2. **Dashboard** - Click "Enter Vault" to access the dashboard
3. **Upload** - Click "Upload" in the sidebar
4. **Upload Image** - Drag and drop an image with text
5. **Extract** - Wait for text extraction (2-5 seconds)
6. **AI Tools** - Try generating captions
7. **Vault** - Store your generated content

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

# If not, create it
echo "NEXT_PUBLIC_OPENAI_API_KEY=your_key_here" > .env.local
```

### Problem: "OpenAI API key not configured"
**Solution**: 
1. Check `.env.local` has the correct format
2. Verify key starts with `sk-proj-`
3. Restart the dev server after editing `.env.local`
4. Clear browser cache if needed

### Problem: OCR extraction fails
**Solution**: 
- Try a different image (JPG, PNG, WebP)
- Ensure image has clear, readable text
- Check file size is under 20MB
- Try a cropped portion of the image

### Problem: Caption generation is slow
**Solution**:
- First generation takes 3-7 seconds (normal)
- OpenAI API calls can be rate-limited
- Check your OpenAI quota/credits
- Try again in a few moments

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
| `NEXT_PUBLIC_OPENAI_API_KEY` | Yes | String | `sk-proj-abc...` |

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
   - `.env.local` file exists
   - OpenAI API key is valid
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

- Initial page load: 1-2 seconds
- Text extraction: 2-5 seconds
- Caption generation: 3-7 seconds
- Tag generation: 2-4 seconds

These times depend on:
- Network speed
- API response time
- Image complexity (for OCR)
- Current OpenAI load

## Security Reminders

⚠️ **Important**:
- Never commit `.env.local` to GitHub
- Never share your OpenAI API key
- Use the `NEXT_PUBLIC_` prefix for browser variables
- Keep your API key rotation schedule
- Monitor API usage and costs

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
   - Add `NEXT_PUBLIC_OPENAI_API_KEY` environment variable
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
