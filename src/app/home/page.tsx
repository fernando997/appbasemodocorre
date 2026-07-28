'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Bike, Activity, ChevronRight, KeyRound } from 'lucide-react'

type UserInfo = { nome: string; tipo: string }

const atalhos = [
  { href: '/dashboard', label: 'Dashboard', desc: 'Visão geral da frota', icon: LayoutDashboard, cor: 'bg-[#6C63FF]' },
  { href: '/recebimento', label: 'Recebimento', desc: 'Motos em trânsito e fila', icon: Bike, cor: 'bg-[#FF8C42]' },
  { href: '/movimentacao', label: 'Funções', desc: 'Consultar status por placa', icon: Activity, cor: 'bg-[#3B82F6]' },
  { href: '/liberacao-cpf', label: 'Liberação de Veículos', desc: 'Buscar por CPF e placa', icon: KeyRound, cor: 'bg-[#22C55E]' },
]

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      const nome = raw?.Nome ?? raw?.nome ?? ''
      const tipo = raw?.Tipo ?? raw?.tipo ?? ''
      if (nome) setUser({ nome, tipo })
    } catch {}
  }, [])

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 bg-[#EEF0F8]">
      <div className="w-full max-w-lg space-y-10">

        <div className="text-center space-y-2">
          <div className="bg-[#1B2043] rounded-2xl px-10 py-6 inline-flex items-center justify-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Modo Corre" className="h-36 w-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user ? `Olá, ${user.nome.split(' ')[0]}` : 'Olá'}
          </h1>
          <p className="text-sm text-muted-foreground">O que você quer fazer hoje?</p>
        </div>

        <div className="space-y-4">
          {atalhos.map(({ href, label, desc, icon: Icon, cor }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="w-full flex items-center gap-5 bg-white rounded-xl px-6 py-5 shadow-[0_2px_20px_rgba(99,102,241,0.07)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.15)] transition-all text-left group"
            >
              <div className={`${cor} p-4 rounded-xl shrink-0`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-base group-hover:text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground/50 shrink-0 group-hover:text-[#6C63FF] group-hover:translate-x-0.5 transition-all" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
