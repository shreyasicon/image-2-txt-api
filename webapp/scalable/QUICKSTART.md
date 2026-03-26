# Iconic Vault - Quick Start Guide

Get up and running in a few minutes.

## 1. Install Dependencies

```bash
pnpm install
# or npm install
```

## 2. Environment (optional)

Create `.env.local` in `webapp/scalable` if you need a custom API or Cognito:

```env
NEXT_PUBLIC_OCR_API_BASE=https://your-api.execute-api.us-east-1.amazonaws.com/prod
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=us-east-1
```

Restart the dev server after changing `.env.local`.

## 3. Start Development Server

```bash
pnpm dev
# or npm run dev
```

## 4. Open in Browser

Visit http://localhost:3000

## What You Can Do

- **Landing** — Hero, features, sign-in
- **Dashboard** — Overview, quick actions
- **Upload** — Image upload and OCR
- **Translate** — Multi-language translation
- **Find Images** — Unsplash search
- **Vault** — Saved content (when signed in)
- **Settings** — Preferences and about

## Example Workflow

1. **Upload** — Sidebar → Upload, drop an image with text
2. **Copy / use text** — Copy extracted text or open Translate
3. **Vault** — Save items you care about (when signed in)

## Troubleshooting

### OCR not working

- Use a clear, readable image (JPG, PNG)
- Check payload size limits for your API
- Confirm `NEXT_PUBLIC_OCR_API_BASE` if not using the default

### Data not saving

- Enable LocalStorage in the browser
- Vault and some features require sign-in (Cognito)
