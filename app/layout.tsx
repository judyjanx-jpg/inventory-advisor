import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SyncWrapper } from '@/components/sync/SyncWrapper'
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
    <html lang="en">
      <body className={inter.className}>
        <SyncWrapper>
          {children}
        </SyncWrapper>
      </body>
    </html>
  )
}


