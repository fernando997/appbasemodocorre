'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, LayoutDashboard, Bike, Activity, LogOut, UserPlus, ChevronDown, Check, Building2, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { setUnidadeAtiva } from '@/lib/unidade-ativa'

type Unidade = { _id: string; 'Nome Unidade': string }

const navItems = [
  { href: '/home', label: 'Início', labelMobile: 'Início', icon: Home },
  { href: '/dashboard', label: 'Dashboard', labelMobile: 'Dashboard', icon: LayoutDashboard },
  { href: '/liberacao-cpf', label: 'Liberação', labelMobile: 'Liber.', icon: KeyRound },
  { href: '/recebimento', label: 'Recebimento', labelMobile: 'Receb.', icon: Bike },
  { href: '/movimentacao', label: 'Funções', labelMobile: 'Funções', icon: Activity },
]

const navAdmin = { href: '/cadastro', label: 'Cadastro', labelMobile: 'Cadastro', icon: UserPlus }

type Plataforma = 'ios' | 'android' | 'outro'

function detectarPlataforma(): Plataforma {
  if (typeof navigator === 'undefined') return 'outro'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'outro'
}

function MobileNavBar({ plataforma, isAdmin }: { plataforma: Plataforma; isAdmin: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const items = isAdmin ? [...navItems, navAdmin] : navItems

  return (
    <nav className={cn(
      'lg:hidden flex bg-[#1B2043] border-[#2A2F5B] z-40',
      plataforma === 'android' ? 'fixed bottom-0 left-0 right-0 border-t' : 'border-b'
    )}>
      {items.map(({ href, labelMobile, icon: Icon }) => {
        const isAtivo = pathname === href
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="flex flex-col items-center justify-center flex-1 py-3 gap-1.5 transition-colors"
          >
            <Icon className={cn('w-5 h-5 transition-colors', isAtivo ? 'text-[#6C63FF]' : 'text-[#8E92B3]')} />
            <span className={cn('text-[10px] font-medium leading-none tracking-wide transition-colors', isAtivo ? 'text-[#6C63FF]' : 'text-[#8E92B3]')}>
              {labelMobile}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function UnidadeDropdown({ unidades, unidadeAtiva, onTrocar }: {
  unidades: Unidade[]
  unidadeAtiva: string
  onTrocar: (val: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const labelAtiva = unidadeAtiva === 'todas'
    ? 'Todas as unidades'
    : unidades.find((u) => u._id === unidadeAtiva)?.['Nome Unidade'] ?? 'Todas as unidades'

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const opcoes = [
    { id: 'todas', label: 'Todas as unidades' },
    ...unidades.map((u) => ({ id: u._id, label: u['Nome Unidade'] })),
  ]

  return (
    <div ref={ref} className="relative mt-1">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-full bg-[#262B59]/80 border border-[#353C6B] text-[#C5C8E4] text-xs transition-colors hover:bg-[#262B59] hover:border-[#6C63FF] max-w-[180px]"
      >
        <Building2 className="w-3 h-3 text-[#6C63FF] shrink-0" />
        <span className="truncate">{labelAtiva}</span>
        <ChevronDown className={cn('w-3 h-3 text-[#8E92B3] shrink-0 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-[#1B2043] border border-[#2A2F5B] shadow-2xl overflow-hidden">
          <p className="px-3 pt-2.5 pb-1 text-[10px] text-[#4A5078] uppercase tracking-widest font-semibold">Selecionar unidade</p>
          <div className="pb-1.5">
            {opcoes.map(({ id, label }) => {
              const ativo = id === unidadeAtiva || (id === 'todas' && (unidadeAtiva === 'todas' || !unidades.find((u) => u._id === unidadeAtiva)))
              return (
                <button
                  key={id}
                  onClick={() => { onTrocar(id); setAberto(false) }}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors',
                    ativo
                      ? 'bg-[#6C63FF]/20 text-[#6C63FF]'
                      : 'text-[#C5C8E4] hover:bg-[#262B59] hover:text-slate-100'
                  )}
                >
                  <span className="w-4 shrink-0">
                    {ativo && <Check className="w-3.5 h-3.5 text-[#6C63FF]" />}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MobileHeader({
  nomeUser, labelUnidade, isAdmin, unidades, unidadeAtiva, onTrocarUnidade, onDeslogar,
}: {
  nomeUser: string
  labelUnidade: string
  isAdmin: boolean
  unidades: Unidade[]
  unidadeAtiva: string
  onTrocarUnidade: (val: string) => void
  onDeslogar: () => void
}) {
  return (
    <header className="lg:hidden flex items-center gap-3 px-4 py-2 bg-[#1B2043] text-slate-100 shrink-0 border-b border-[#2A2F5B]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Modo Corre" className="h-9 w-auto object-contain shrink-0" />
      <div className="flex-1 min-w-0">
        {nomeUser && <p className="text-sm font-semibold leading-tight truncate">{nomeUser}</p>}
        {isAdmin && unidades.length > 0 ? (
          <UnidadeDropdown
            unidades={unidades}
            unidadeAtiva={unidadeAtiva}
            onTrocar={onTrocarUnidade}
          />
        ) : (
          labelUnidade && <p className="text-xs text-[#8E92B3] leading-tight mt-0.5">{labelUnidade}</p>
        )}
      </div>
      <button onClick={onDeslogar} className="p-1 text-[#8E92B3] hover:text-red-400 transition-colors shrink-0">
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [plataforma, setPlataforma] = useState<Plataforma>('outro')
  const [isAdmin, setIsAdmin] = useState(false)
  const [nomeUser, setNomeUser] = useState('')
  const [labelUnidade, setLabelUnidade] = useState('')
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadeAtiva, setUnidadeAtivaState] = useState('todas')
  const router = useRouter()

  useEffect(() => {
    setPlataforma(detectarPlataforma())
    try {
      const user = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      const tipo = user?.Tipo ?? ''
      const raw: Unidade[] = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]')
      if (tipo === 'ADMIN') {
        setIsAdmin(true)
        setLabelUnidade('ADMIN')
        setUnidades(raw)
        const ativa = localStorage.getItem('mc_unidade_ativa')
        if (ativa) {
          const ids: string[] = JSON.parse(ativa)
          setUnidadeAtivaState(ids.length === 1 ? ids[0] : 'todas')
        }
      } else {
        const nome = raw[0]?.['Nome Unidade']
        if (nome) setLabelUnidade(nome)
      }
      const nomeU = user?.Nome ?? user?.Name ?? user?.nome ?? ''
      if (nomeU) setNomeUser(nomeU)
    } catch {}
  }, [])

  function trocarUnidade(valor: string) {
    setUnidadeAtivaState(valor)
    if (valor === 'todas') {
      setUnidadeAtiva(unidades.map((u) => u._id))
    } else {
      setUnidadeAtiva([valor])
    }
    window.location.reload()
  }

  function deslogar() {
    const expirado = 'expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    document.cookie = `mc_auth=; ${expirado}`
    document.cookie = `mc_unit=; ${expirado}`
    document.cookie = `mc_nome=; ${expirado}`
    document.cookie = `mc_perfil=; ${expirado}`
    router.push('/login')
  }

  const isMobileNav = plataforma === 'ios' || plataforma === 'android'
  const headerProps = { nomeUser, labelUnidade, isAdmin, unidades, unidadeAtiva, onTrocarUnidade: trocarUnidade, onDeslogar: deslogar }

  return (
    <div className="flex h-full">

      {/* Sidebar — só desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-h-full overflow-hidden">

        {/* iOS: header + nav no topo */}
        {plataforma === 'ios' && (
          <>
            <MobileHeader {...headerProps} />
            <MobileNavBar plataforma="ios" isAdmin={isAdmin} />
          </>
        )}

        {/* Android: header no topo */}
        {plataforma === 'android' && <MobileHeader {...headerProps} />}

        {/* Outro: header simples */}
        {!isMobileNav && <MobileHeader {...headerProps} />}

        <main className={cn(
          'flex-1 overflow-x-hidden overflow-y-auto bg-[#EEF0F8]',
          plataforma === 'android' && 'pb-16'
        )}>
          {children}
        </main>

        {/* Android: nav em baixo */}
        {plataforma === 'android' && (
          <MobileNavBar plataforma="android" isAdmin={isAdmin} />
        )}
      </div>
    </div>
  )
}
