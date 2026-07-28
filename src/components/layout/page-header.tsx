'use client'

import { useEffect, useRef, useState } from 'react'
import { UserCircle, Building2, ChevronDown } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ReactNode
  iconColor?: string
  actions?: React.ReactNode
}

type Unidade = { _id: string; 'Nome Unidade': string }

type UserInfo = {
  nome: string
  tipo: string
  unidades: Unidade[]
}

export function PageHeader({ title, description, icon, iconColor = 'bg-[#1B2043]', actions }: PageHeaderProps) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      const nome = raw?.Nome ?? raw?.Name ?? raw?.nome ?? ''
      const tipo = raw?.Tipo ?? raw?.tipo ?? ''
      const unidades: Unidade[] = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]')
      if (nome) setUser({ nome, tipo, unidades })
    } catch {
      // sem dados
    }
  }, [])

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const isAdmin = user && (user.tipo === 'ADMIN' || user.unidades.length > 1)

  return (
    <div className="flex items-center gap-3 px-5 sm:px-8 py-2.5 bg-white border-b border-[#E2E4F0] sticky top-0 z-10 shadow-[0_1px_8px_rgba(99,102,241,0.06)]">

      {/* Ícone + título */}
      {icon && (
        <div className={`p-2 rounded-xl shrink-0 ${iconColor}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">{title}</h1>
        {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>

      {/* Actions + usuário */}
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}

      {user && (
        <div ref={ref} className="relative shrink-0">
          <button
            onClick={() => setAberto((v) => !v)}
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted transition-colors border border-transparent hover:border-[#6C63FF]/20"
          >
            <UserCircle className="w-5 h-5 text-[#6C63FF] shrink-0" />
            <span className="hidden sm:inline text-sm font-semibold leading-none">{user.nome.split(' ')[0]}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${aberto ? 'rotate-180' : ''}`} />
          </button>

          {aberto && (
            <div className="absolute right-0 top-full mt-2.5 z-50 w-60 rounded-xl bg-white border border-[#E2E4F0] shadow-[0_8px_24px_rgba(99,102,241,0.12)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E2E4F0]">
                <p className="text-sm font-semibold truncate">{user.nome}</p>
                <p className="text-xs text-muted-foreground mt-1">Perfil ativo</p>
              </div>
              <div className="px-5 py-4">
                {isAdmin ? (
                  <div className="flex items-center gap-3 bg-[#6C63FF]/10 border border-[#6C63FF]/25 rounded-xl px-4 py-3">
                    <Building2 className="w-4 h-4 text-[#6C63FF] shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[#6C63FF]">Admin</p>
                      <p className="text-xs text-[#6C63FF]/70 mt-0.5">{user.unidades.length} unidades</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{user.unidades[0]?.['Nome Unidade'] ?? 'Unidade'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">1 unidade</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
