# Iconic Vault

**Create. Store. Elevate.**

A production-ready personal content vault built with Next.js. Extract text from images, translate, discover images, and organize everything in one interface.

## Features

- **Image to Text Extraction** - OCR via the custom AWS Lambda API
- **Translation** - Multi-language translation via integrated translation API
- **Find Images** - Search stock photos (Unsplash)
- **Personal Vault** - Store, organize, and manage content locally and with your account
- **Glassmorphism UI** - Modern dark-themed interface with neon accents and smooth animations
- **Fully Responsive** - Optimized for desktop and mobile devices

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Icons**: Lucide React
- **Fonts**: Orbitron (headings), Geist (body)
- **OCR**: Custom AWS Lambda OCR API
- **Auth**: AWS Amplify + Cognito
- **Storage**: Browser LocalStorage (client-side)

## Getting Started

### Prerequisites

- Node.js 18+ with npm or pnpm
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
# OCR API (optional; defaults to deployed demo endpoint)
NEXT_PUBLIC_OCR_API_BASE=https://your-api.execute-api.us-east-1.amazonaws.com/prod
# Cognito (for Sign in, My Uploads, Vault – e.g. from deploy-webapp-lambda.js or deploy.js)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=us-east-1
```

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
    /vault           - Store and manage your content
    /settings        - Configuration and preferences
    layout.tsx       - Dashboard layout with sidebar
    page.tsx         - Main dashboard

/components
  logo.tsx           - Iconic Vault logo with glowing vault icon
  sidebar.tsx        - Navigation sidebar
  upload-card.tsx    - File upload component with drag-drop
  ocr-result-card.tsx - Display extracted text with confidence
  vault-card.tsx     - Vault item display card
  glass-card.tsx     - Reusable glass morphism card
  glow-button.tsx    - Custom button with glow effects
  loading-spinner.tsx - Animated loading indicator

/lib
  api.ts             - API integration (OCR, translation, Unsplash)
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

### 2. Store & Organize

Visit your **Vault** to:
- View all stored content with preview
- Search by title or content
- Filter by type (captions, text, images)
- Copy content to clipboard
- Delete items as needed

### 3. Configure

Adjust **Settings** to:
- Review API configuration
- Manage preferences
- Clear browser cache
- Learn about technologies used

## API Integrations

### OCR API

**Endpoint:** `POST https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod/ocr`

Requires multipart/form-data with field name `image`. Returns extracted text and confidence score.

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
| `NEXT_PUBLIC_OCR_API_BASE` | No | OCR API base URL (defaults to deployed Lambda) |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | For auth | Cognito User Pool ID |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | For auth | Cognito App Client ID |

Note: `NEXT_PUBLIC_` prefix allows the variable to be used in the browser.

## Performance Tips

- OCR extraction may take 2-5 seconds depending on image complexity
- Keep images under 20MB for optimal performance
- Use high-contrast, clear images for best OCR accuracy
- Clear old vault items occasionally to maintain browser performance

## Troubleshooting

### OCR extraction fails
- Check image is in supported format (JPG, PNG, WebP, GIF)
- Verify image file size is under 20MB
- Ensure text in image is clearly visible

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
3. Add `NEXT_PUBLIC_OCR_API_BASE`, Cognito IDs, and `NEXT_PUBLIC_AWS_REGION` as needed

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
- [AWS Amplify](https://aws.amazon.com/amplify/)
- [Lucide Icons](https://lucide.dev)

---

**Iconic Vault** - Transform your content workflow. Create. Store. Elevate.
