import type { Metadata } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'

export const metadata: Metadata = {
  title: 'SNCC Portfolio Forecasting',
  description: 'Construction lending portfolio intelligence for Security National',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-[#0D1117]">
        <Navigation />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
