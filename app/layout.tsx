import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SyncWrapper } from '@/components/sync/SyncWrapper'
import { ThemeProvider } from '@/contexts/ThemeContext'
// Initialize queue system (scheduler + worker)
import '@/lib/queues/init'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'Inventory Advisor',
  description: 'AI-Powered Inventory Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.classList.add(theme);
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <SyncWrapper>
            {children}
          </SyncWrapper>
        </ThemeProvider>
      </body>
    </html>
  )
}


