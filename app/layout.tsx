import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Baseline — Your Health Intelligence',
  description: 'Track your health metrics, understand your baselines, and prepare for medical appointments with AI-powered insights.',
  keywords: ['health tracking', 'HRV', 'sleep', 'wellness', 'medical', 'baseline'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-slate-900 text-slate-100 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
