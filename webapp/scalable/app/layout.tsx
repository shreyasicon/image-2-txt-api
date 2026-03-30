import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Orbitron } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const geist = Geist({ subsets: ["latin"], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: '--font-mono' });
const orbitron = Orbitron({ subsets: ["latin"], variable: '--font-orbitron' });

export const metadata: Metadata = {
  title: 'Iconic Vault - Create. Store. Elevate.',
  description: 'Your personal content vault. Extract text, translate, find images and store your ideas.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#00FFFF',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} ${geistMono.variable} ${orbitron.variable} font-sans antialiased bg-background text-foreground`}>
        <Script
          id="suppress-wallet-extension-noise"
          src="/wallet-extension-noise-suppress.js"
          strategy="beforeInteractive"
        />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
