'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  LayoutDashboard,
  KeyRound,
  Bike,
  Activity,
  UserPlus,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { setUnidadeAtiva } from '@/lib/unidade-ativa'

type Unidade = { _id: string; 'Nome Unidade': string }

const navItems = [
  { href: '/home', label: 'Início', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/liberacao-cpf', label: 'Liberação de Veículos', icon: KeyRound },
  { href: '/recebimento', label: 'Recebimento de Motos', icon: Bike },
  { href: '/movimentacao', label: 'Funções', icon: Activity },
]

const navAdmin = [
  { href: '/cadastro', label: 'Cadastro de Usuário', icon: UserPlus },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [labelUnidade, setLabelUnidade] = useState('Base Central')
  const [isAdmin, setIsAdmin] = useState(false)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadeAtiva, setUnidadeAtivaState] = useState<string>('todas')

  useEffect(() => {
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
          if (ids.length === 1) setUnidadeAtivaState(ids[0])
          else setUnidadeAtivaState('todas')
        }
      } else {
        const nome = raw[0]?.['Nome Unidade']
        if (nome) setLabelUnidade(nome)
      }
    } catch {}
  }, [])

  function trocarUnidade(valor: string) {
    setUnidadeAtivaState(valor)
    if (valor === 'todas') {
      const ids = unidades.map((u) => u._id)
      setUnidadeAtiva(ids)
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

  return (
    <aside className="flex flex-col w-64 h-full min-h-screen bg-[#1B2043] text-slate-100 shrink-0">
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#2A2F5B]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Modo Corre" className="h-24 w-auto object-contain" />
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-[#8E92B3] hover:text-slate-100">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname === href
                ? 'bg-[#6C63FF] text-white shadow-[0_4px_12px_rgba(108,99,255,0.35)]'
                : 'text-[#8E92B3] hover:bg-[#262B59] hover:text-slate-100'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-[10px] text-[#4A5078] uppercase tracking-widest font-semibold">Admin</p>
            {navAdmin.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  pathname === href
                    ? 'bg-[#6C63FF] text-white shadow-[0_4px_12px_rgba(108,99,255,0.35)]'
                    : 'text-[#8E92B3] hover:bg-[#262B59] hover:text-slate-100'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-[#2A2F5B] space-y-3">
        {isAdmin && unidades.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] text-[#4A5078] uppercase tracking-widest font-semibold">Unidade visualizada</p>
            <select
              value={unidadeAtiva}
              onChange={(e) => trocarUnidade(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-lg bg-[#262B59] border border-[#353C6B] text-[#C5C8E4] focus:outline-none focus:border-[#6C63FF]"
            >
              <option value="todas">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u._id} value={u._id}>{u['Nome Unidade']}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-[#4A5078] uppercase tracking-widest font-semibold">Unidade</p>
            <p className="text-sm font-semibold text-[#C5C8E4] mt-0.5">{labelUnidade}</p>
          </div>
        )}
        <button
          onClick={deslogar}
          className="flex items-center gap-2 text-sm text-[#8E92B3] hover:text-red-400 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
