import type { Metadata } from 'next'
import './globals.css'
import { SyncWrapper } from '@/components/sync/SyncWrapper'
import { ThemeProvider } from '@/contexts/ThemeContext'
// Initialize queue system (scheduler + worker)
import '@/lib/queues/init'

// Use system font stack instead of Google Fonts to avoid network dependency during build
const fontClassName = 'font-sans'

export const metadata: Metadata = {
  title: 'Inventory Advisor',
  description: 'AI-Powered Inventory Management System',
  icons: {
    icon: '/logo.png',
  },
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
      <body className={fontClassName}>
        <ThemeProvider>
          <SyncWrapper>
            {children}
          </SyncWrapper>
        </ThemeProvider>
      </body>
    </html>
  )
}


