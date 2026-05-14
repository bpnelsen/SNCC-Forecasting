import type { Metadata } from 'next'
import './globals.css'
import { Navigation } from '@/components/layout/Navigation'

export const metadata: Metadata = {
  title: 'SNCC Portfolio Forecasting',
  description: 'Construction lending portfolio intelligence for Security National',
}

// Applies the persisted theme before React hydrates so we never flash the
// light theme on a dark-mode session (or vice versa).
const themeBootstrap = `
(function(){try{
  var t = localStorage.getItem('sncc-theme');
  if (t === 'dark') document.documentElement.classList.add('dark');
}catch(e){}})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex h-screen overflow-hidden bg-bg">
        <Navigation />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
