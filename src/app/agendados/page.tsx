'use client'

import { useRouter } from 'next/navigation'
import { Calendar, ChevronRight, ClipboardList, Monitor } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'

const opcoes = [
  { href: '/liberacao', label: 'Tela de TV', desc: 'Painel de fila para exibir em TV', icon: Monitor, cor: 'bg-[#1B2043]' },
  { href: '/agendados/tratamento', label: 'Tratamento', desc: 'Gerenciar as motos agendadas', icon: ClipboardList, cor: 'bg-[#22C55E]' },
]

export default function AgendadosPage() {
  const router = useRouter()

  return (
    <>
      <PageHeader
        title="Agendados"
        description="Escolha o que deseja acessar"
        icon={<Calendar className="w-5 h-5 text-white" />}
      />
      <div className="min-h-full flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-4">
          {opcoes.map(({ href, label, desc, icon: Icon, cor }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="w-full flex items-center gap-5 bg-white rounded-xl px-6 py-5 shadow-[0_2px_20px_rgba(99,102,241,0.07)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.15)] transition-all text-left group border"
            >
              <div className={`${cor} p-4 rounded-xl shrink-0`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-base">{label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground/50 shrink-0 group-hover:text-[#6C63FF] group-hover:translate-x-0.5 transition-all" />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
