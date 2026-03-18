# Iconic Vault

**Create. Store. Elevate.**

A production-ready AI-powered personal content vault built with Next.js. Extract text from images, generate captions, auto-tag content, and organize everything in one beautiful interface.

## Features

- **Image to Text Extraction** - Advanced OCR technology to extract text from images
- **AI Caption Generation** - Generate professional, creative, or viral captions using OpenAI
- **Auto-Tagging** - Automatically generate relevant hashtags for your content
- **Personal Vault** - Store, organize, and manage all your content locally
- **Content Enhancement** - Rewrite, summarize, expand, and translate your content
- **Glassmorphism UI** - Modern dark-themed interface with neon accents and smooth animations
- **Fully Responsive** - Optimized for desktop and mobile devices

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Icons**: Lucide React
- **Fonts**: Orbitron (headings), Geist (body)
- **AI**: OpenAI API (GPT-4o-mini)
- **OCR**: Custom AWS Lambda OCR API
- **Storage**: Browser LocalStorage (client-side)

## Getting Started

### Prerequisites

- Node.js 18+ with pnpm
- OpenAI API key
- Modern web browser

### Installation

1. **Clone and Install**

```bash
npm install
# or
pnpm install
```

2. **Set Up Environment Variables**

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
# OCR API (optional; defaults to demo endpoint)
NEXT_PUBLIC_OCR_API_BASE=https://your-api.execute-api.us-east-1.amazonaws.com/prod
# Cognito (optional; for Sign in and My Uploads – run API deploy.js to create the User Pool)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=us-east-1
```

Get your OpenAI API key from [platform.openai.com](https://platform.openai.com)

3. **Run Development Server**

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
/app
  /dashboard
    /upload          - Image upload & OCR extraction
    /ai-tools        - Caption generation, tagging, content enhancement
    /vault           - Store and manage your content
    /settings        - Configuration and preferences
    layout.tsx       - Dashboard layout with sidebar
    page.tsx         - Main dashboard

/components
  logo.tsx           - Iconic Vault logo with glowing vault icon
  sidebar.tsx        - Navigation sidebar
  upload-card.tsx    - File upload component with drag-drop
  ocr-result-card.tsx - Display extracted text with confidence
  caption-card.tsx   - Individual caption display card
  vault-card.tsx     - Vault item display card
  glass-card.tsx     - Reusable glass morphism card
  glow-button.tsx    - Custom button with glow effects
  loading-spinner.tsx - Animated loading indicator

/lib
  api.ts             - API integration (OCR, OpenAI)
  utils.ts           - Utility functions

/app
  page.tsx           - Landing page with hero section
  layout.tsx         - Root layout with theme setup
  globals.css        - Global styles and design tokens
```

## Usage Guide

### 1. Upload & Extract

Navigate to **Upload** page to:
- Drag and drop or select an image
- Automatically extract text using OCR
- View extraction confidence score
- Copy extracted text

### 2. Generate Content

Go to **AI Tools** to:
- **Captions**: Generate 5 captions in different tones (professional, creative, viral)
- **Tags**: Auto-generate 15 relevant hashtags
- **Enhance**: Rewrite, summarize, expand, or translate content

### 3. Store & Organize

Visit your **Vault** to:
- View all stored content with preview
- Search by title or content
- Filter by type (captions, text, images)
- Copy content to clipboard
- Delete items as needed

### 4. Configure

Adjust **Settings** to:
- Review API configuration
- Manage preferences
- Clear browser cache
- Learn about technologies used

## API Integrations

### OCR API

**Endpoint:** `POST https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod/ocr`

Requires multipart/form-data with field name `image`. Returns extracted text and confidence score.

### OpenAI API

**Model:** `gpt-4o-mini`

Used for:
- Caption generation with tone control
- Hashtag generation
- Content rewriting, summarization, expansion, and translation

## Data Storage

- **Local**: All vault items are stored in browser's LocalStorage
- **No server**: No data is sent to external servers
- **Persistent**: Data persists across browser sessions until manually cleared
- **Privacy**: 100% client-side processing

## Customization

### Theme Colors

Edit design tokens in `app/globals.css`:

```css
--background: #0B0F19;      /* Deep black */
--primary: #00FFFF;         /* Neon cyan */
--secondary: #5B21B6;       /* Electric violet */
--muted: #2D3142;           /* Dark gray */
```

### Fonts

Modify fonts in `app/layout.tsx`:

```tsx
const orbitron = Orbitron({ subsets: ["latin"] });
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_OPENAI_API_KEY` | Yes | Your OpenAI API key |

Note: `NEXT_PUBLIC_` prefix allows the variable to be used in the browser.

## Performance Tips

- OCR extraction may take 2-5 seconds depending on image complexity
- Keep images under 20MB for optimal performance
- Use high-contrast, clear images for best OCR accuracy
- Clear old vault items occasionally to maintain browser performance

## Troubleshooting

### "OpenAI API key not configured"
- Ensure `NEXT_PUBLIC_OPENAI_API_KEY` is set in `.env.local`
- Restart the dev server after adding the environment variable

### OCR extraction fails
- Check image is in supported format (JPG, PNG, WebP, GIF)
- Verify image file size is under 20MB
- Ensure text in image is clearly visible

### Captions/Tags not generating
- Verify OpenAI API key is valid and has sufficient credits
- Check that text is not empty before generating
- Confirm no API rate limits are exceeded

### Data not persisting
- Check browser's LocalStorage is not disabled
- Try clearing browser cache and reloading
- Ensure cookies/storage are allowed in browser settings

## Deployment

### Deploy to Vercel

```bash
# Push to GitHub
git push origin main

# Connect to Vercel
# Vercel will auto-deploy on push
```

Add environment variable in Vercel:
1. Go to Project Settings
2. Click Environment Variables
3. Add `NEXT_PUBLIC_OPENAI_API_KEY`

### Deploy to Other Platforms

The app is a standard Next.js application and can be deployed to:
- Netlify
- AWS Amplify
- DigitalOcean App Platform
- Self-hosted VPS

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Future Enhancements

- User authentication with Supabase
- Cloud storage integration
- Batch image processing
- Advanced content scheduling
- Social media integration
- Multi-language support
- Advanced analytics
- Collaborative vaults
- API for third-party integrations

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review API status pages

## Credits

Built with:
- [Next.js](https://nextjs.org)
- [React](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [OpenAI API](https://openai.com)
- [Lucide Icons](https://lucide.dev)

---

**Iconic Vault** - Transform your content workflow. Create. Store. Elevate.
