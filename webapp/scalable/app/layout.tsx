import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Orbitron } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

/** Runs before React — MetaMask (and similar) inject inpage.js and reject promises; Next dev overlay must ignore them. */
const suppressWalletExtensionNoise = `
(function () {
  function isNoise(msg, src) {
    var m = (msg || '').toLowerCase()
    var s = (src || '').toLowerCase()
    if (m.indexOf('metamask') !== -1) return true
    if (m.indexOf('failed to connect') !== -1) return true
    if (s.indexOf('nkbihfbeogaeaoehlefnkodbefgpgknn') !== -1) return true
    if (s.indexOf('inpage.js') !== -1) return true
    return false
  }
  function reasonToMsg(r) {
    if (r == null) return ''
    if (typeof r === 'string') return r
    try {
      if (typeof r.message === 'string') return r.message
      if (r && typeof r === 'object' && typeof r.reason === 'string') return r.reason
    } catch (e) {}
    try { return String(r) } catch (e2) { return '' }
  }
  window.addEventListener(
    'unhandledrejection',
    function (e) {
      if (isNoise(reasonToMsg(e.reason), '')) e.preventDefault()
    },
    true
  )
  window.addEventListener(
    'error',
    function (e) {
      if (isNoise(e.message || '', e.filename || '')) {
        e.preventDefault()
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
      }
    },
    true
  )
})()
`

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
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: suppressWalletExtensionNoise }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
