'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Bike } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body }),
  })
  return res.json()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const INTERVALO_PAGINACAO_MS = 500

const StatusFrota = dynamic(
  () => import('@/components/dashboard/status-frota').then((m) => m.StatusFrota),
  { ssr: false }
)
const PrevisaoRecolhas = dynamic(
  () => import('@/components/dashboard/previsao-recolhas').then((m) => m.PrevisaoRecolhas),
  { ssr: false }
)
const Pendencias = dynamic(
  () => import('@/components/dashboard/pendencias').then((m) => m.Pendencias),
  { ssr: false }
)

const STATUS_ATENCAO = ['MANUTENÇÃO', 'SINISTRO', 'EM VISTORIA', 'IRREGULARES', 'BLOQUEADO', 'INATIVO']

const FRASES_CARREGAMENTO = [
  'Buscando motos na base...',
  'Organizando a frota...',
  'Consultando unidades ativas...',
  'Quase lá...',
]

type Veiculo = {
  _id: string
  placa: string
  modelo: string
  cor: string
  status_veiculo_desc: string
  [key: string]: unknown
}

export default function DashboardPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [dadosRecolhas, setDadosRecolhas] = useState<unknown>(null)
  const [totalCarregado, setTotalCarregado] = useState(0)
  const [fraseIndex, setFraseIndex] = useState(0)

  useEffect(() => {
    if (!carregando) return
    const id = setInterval(() => {
      setFraseIndex((i) => (i + 1) % FRASES_CARREGAMENTO.length)
    }, 2500)
    return () => clearInterval(id)
  }, [carregando])

  useEffect(() => {
    const cache = localStorage.getItem('mc_veiculos')
    if (cache) {
      try { setVeiculos(JSON.parse(cache)) } catch {}
      return
    }

    async function buscar() {
      setCarregando(true)
      try {
        const ids = getUnidadesAtivas()
        const vistos = new Set<string>()
        const todos: Veiculo[] = []
        const TAMANHO = 50
        let minimo = 1

        while (true) {
          const maximo = minimo + TAMANHO - 1
          const data = await chamarBubble('chamar-veiculos', {
            unidade: JSON.stringify(ids),
            minimo: String(minimo),
            maximo: String(maximo),
          })
          const batch: Veiculo[] = data?.response?.veiculos ?? []
          if (batch.length === 0) break
          for (const v of batch) {
            if (!vistos.has(v._id as string)) {
              vistos.add(v._id as string)
              todos.push(v)
            }
          }
          setTotalCarregado(todos.length)
          minimo += TAMANHO
          await sleep(INTERVALO_PAGINACAO_MS)
        }

        localStorage.setItem('mc_veiculos', JSON.stringify(todos))
        setVeiculos(todos)
      } catch {
        setVeiculos([])
      } finally {
        setCarregando(false)
      }
    }

    buscar()
  }, [])

  useEffect(() => {
    async function buscarRecolhas() {
      try {
        const ids = getUnidadesAtivas()
        const TAMANHO = 50
        let minimo = 1
        const todasRecolhas: unknown[] = []
        const todasPendencias: unknown[] = []
        const vistosR = new Set<string>()
        const vistosP = new Set<string>()

        let pendenciasCarregadas = false

        while (true) {
          const maximo = minimo + TAMANHO - 1
          const data = await chamarBubble('chamar-recolhas-pendencias', {
            unidade: JSON.stringify(ids),
            minimo: String(minimo),
            maximo: String(maximo),
          })
          const batchR: { _id?: string }[] = data?.response?.recolha ?? []
          const batchP: { _id?: string }[] = data?.response?.pendencias ?? []

          for (const r of batchR) {
            if (r._id && !vistosR.has(r._id)) { vistosR.add(r._id); todasRecolhas.push(r) }
          }

          if (!pendenciasCarregadas) {
            for (const p of batchP) {
              if (p._id && !vistosP.has(p._id)) { vistosP.add(p._id); todasPendencias.push(p) }
            }
            pendenciasCarregadas = true
          }

          if (batchR.length === 0) break
          minimo += TAMANHO
          await sleep(INTERVALO_PAGINACAO_MS)
        }

        setDadosRecolhas({ response: { recolha: todasRecolhas, pendencias: todasPendencias } })
      } catch {
      }
    }
    buscarRecolhas()
  }, [])

  const total = veiculos.length
  const atencao = veiculos.filter((v) => STATUS_ATENCAO.includes(v.status_veiculo_desc)).length

  if (carregando && veiculos.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#EEF0F8] px-6">
        <div className="w-full max-w-xs bg-white rounded-3xl shadow-[0_8px_40px_rgba(27,32,67,0.12)] p-8 flex flex-col items-center gap-7">

          <div className="relative w-full h-10">
            <div className="absolute bottom-0 left-0 right-0 border-t-2 border-dashed border-[#1B2043]/15" />
            <Bike
              className="absolute bottom-0 w-8 h-8 text-[#6C63FF]"
              style={{ animation: 'moto-ride 1.8s ease-in-out infinite alternate' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1">
            <p className="text-3xl font-extrabold text-[#1B2043] tabular-nums leading-none">{totalCarregado}</p>
            <p className="text-[11px] font-semibold text-[#1B2043]/40 uppercase tracking-wider">motos carregadas</p>
          </div>

          <div className="w-full h-1.5 rounded-full bg-[#1B2043]/10 overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#1B2043] to-[#6C63FF]"
              style={{ animation: 'progress-indeterminate 1.4s ease-in-out infinite' }}
            />
          </div>

          <p key={fraseIndex} className="text-sm font-medium text-[#1B2043]/60 text-center animate-in fade-in duration-500">
            {FRASES_CARREGAMENTO[fraseIndex]}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
    <PageHeader
      title="Dashboard Operacional"
      description="Base Central"
      actions={
        <>
          <div className="bg-white rounded-xl px-3 py-1.5 text-center shadow-[0_2px_12px_rgba(99,102,241,0.08)]">
            <p className="text-muted-foreground text-xs">Total frota</p>
            <p className="font-bold text-base leading-tight">{total}</p>
          </div>
          <div className="bg-[#6C63FF]/10 border border-[#6C63FF]/25 rounded-xl px-3 py-1.5 text-center">
            <p className="text-[#6C63FF] text-xs">Atenção</p>
            <p className="font-bold text-base leading-tight text-[#6C63FF]">{atencao}</p>
          </div>
        </>
      }
    />
    <div className="p-3 sm:p-6 space-y-6 max-w-screen-xl mx-auto">

      <StatusFrota veiculos={veiculos} />

      <PrevisaoRecolhas dados={dadosRecolhas} veiculos={veiculos} />

      <Pendencias dados={dadosRecolhas} veiculos={veiculos} />
    </div>
    </>
  )
}
