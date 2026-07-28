'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/layout/page-header'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

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
          const form = new FormData()
          form.append('apikey', BUBBLE_KEY)
          form.append('unidade', JSON.stringify(ids))
          form.append('minimo', String(minimo))
          form.append('maximo', String(maximo))
          const res = await fetch(`${BUBBLE_BASE}/chamar-veiculos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
            body: form,
          })
          const data = await res.json()
          const batch: Veiculo[] = data?.response?.veiculos ?? []
          if (batch.length === 0) break
          for (const v of batch) {
            if (!vistos.has(v._id as string)) {
              vistos.add(v._id as string)
              todos.push(v)
            }
          }
          minimo += TAMANHO
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
          const form = new FormData()
          form.append('apikey', BUBBLE_KEY)
          form.append('unidade', JSON.stringify(ids))
          form.append('minimo', String(minimo))
          form.append('maximo', String(maximo))
          const res = await fetch(`${BUBBLE_BASE}/chamar-recolhas-pendencias`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
            body: form,
          })
          const data = await res.json()
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#EEF0F8]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-[#1B2043]/20 border-t-[#6C63FF] animate-spin" />
        </div>
        <p className="text-sm font-medium text-[#1B2043]/60">Carregando frota...</p>
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
