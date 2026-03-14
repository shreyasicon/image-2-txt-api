# Iconic Vault - Quick Start Guide

Get up and running in 5 minutes!

## 1. Install Dependencies (1 min)

```bash
pnpm install
```

## 2. Configure OpenAI API (2 min)

1. Get your API key: https://platform.openai.com/api-keys
2. Create `.env.local` in project root:

```env
NEXT_PUBLIC_OPENAI_API_KEY=your_key_here
```

3. Replace `your_key_here` with your actual OpenAI API key

## 3. Start Development Server (30 sec)

```bash
pnpm dev
```

## 4. Open in Browser (30 sec)

Visit http://localhost:3000

## What You Can Do Now

### Landing Page (Home)
- Beautiful hero section with logo
- Feature highlights
- Call-to-action buttons

### Dashboard
- Overview of your vault
- Quick stats and activity
- Navigation to all features

### Upload Page
- Drag & drop image upload
- Text extraction via OCR
- Confidence score display

### AI Tools
- **Captions**: Generate 5 social media captions (choose tone: professional, creative, viral)
- **Tags**: Auto-generate 15 relevant hashtags
- **Enhance**: Rewrite, summarize, expand, or translate content

### Vault
- Store your generated content
- Search by title or content
- Filter by type
- Copy to clipboard
- Delete items

### Settings
- API configuration info
- Preferences
- Data management
- About page

## Example Workflow

1. **Upload** → Click "Upload" in sidebar
2. **Extract** → Drop an image with text
3. **Generate** → Go to "AI Tools"
4. **Choose** → Select caption tone or generate tags
5. **Copy** → Click copy button
6. **Store** → Click save to add to Vault
7. **Manage** → View all in Vault page

## Key Features

✨ **AI-Powered**
- OpenAI GPT-4o-mini for content generation
- Advanced OCR for text extraction

🎨 **Beautiful UI**
- Dark theme with neon accents
- Glassmorphism design
- Smooth animations
- Fully responsive

🔒 **Privacy First**
- All data stored locally in browser
- No server uploads
- No tracking or analytics

⚡ **Fast & Lightweight**
- Next.js 16 with App Router
- Tailwind CSS for styling
- Optimized components

## Troubleshooting

### Error: "OpenAI API key not configured"
- Check `.env.local` file exists
- Verify key is pasted correctly
- Restart dev server: `pnpm dev`

### OCR not working
- Ensure image is clear and readable
- Try a different image format (JPG, PNG)
- Check file size (max 20MB)

### Captions not generating
- Verify OpenAI API key is valid
- Ensure text is not empty
- Wait 2-3 seconds (API calls are slow)

### Data not saving
- Check LocalStorage is enabled in browser
- Try clearing browser cache
- Refresh the page

## Environment Variables Explained

```env
NEXT_PUBLIC_OPENAI_API_KEY
├─ Used for: Caption, tag, and content enhancement
├─ Type: Public (used in browser)
├─ Get from: https://platform.openai.com
├─ Required: Yes
└─ Format: sk-proj-xxxxx...
```

The `NEXT_PUBLIC_` prefix means this variable is exposed to the browser (necessary for client-side API calls).

## Next Steps

1. **Customize Colors** → Edit `app/globals.css`
2. **Add Database** → Integrate Supabase or Neon for persistent storage
3. **Deploy** → Push to GitHub and deploy via Vercel
4. **Add Features** → Build on the existing component structure

## Commands Reference

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint

# Other
pnpm install          # Install dependencies
pnpm update           # Update dependencies
```

## Need Help?

- Check README.md for detailed documentation
- Review component code in `/components`
- Check API integration in `/lib/api.ts`
- Inspect browser console for errors

## Performance Notes

- **OCR Processing**: 2-5 seconds per image
- **Caption Generation**: 3-7 seconds
- **Tag Generation**: 2-4 seconds
- **Storage**: Limited by browser (typically 5-10MB)

Clean up old vault items to maintain performance.

## Tips & Tricks

1. **Batch Operations** - Generate multiple content types from same text
2. **Tone Selection** - Experiment with different caption tones
3. **Copy Shortcuts** - Hover over items to see copy button
4. **Search & Filter** - Use vault search for quick access
5. **Regenerate** - Click refresh icon to get new variations

---

Ready to transform your content workflow? Start uploading images now!

**Iconic Vault** - Create. Store. Elevate.
