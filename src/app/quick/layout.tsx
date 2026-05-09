import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Quick Timer',
  manifest: '/manifest-quick.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Timer',
  },
}

export default function QuickLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
