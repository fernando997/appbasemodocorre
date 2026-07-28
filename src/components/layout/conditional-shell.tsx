'use client'

import { usePathname } from 'next/navigation'
import { AppShell } from './app-shell'

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/login' || pathname === '/liberacao' || pathname.startsWith('/vistoria-entrega')) return <>{children}</>

  return <AppShell>{children}</AppShell>
}
