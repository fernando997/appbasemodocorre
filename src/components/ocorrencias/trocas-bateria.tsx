'use client'

import { useCallback, useEffect, useState } from 'react'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

// Proxy server-side — esconde apikey/BUBBLE_PRIVATE_KEY do navegador
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, format: 'json' }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

const INTERVALO_MS = 60_000
const STATUS_ABERTO = 'ABERTO'
const STATUS_EM_EXECUCAO = 'EM EXECUÇÃO'

export type TrocaBateria = {
  _id: string
  status?: string
  protocolo?: string
  endereco?: string
  ponto_referencia?: string
  placa?: string
  responsavel?: string
  assumida_em?: number | string
  'Created Date'?: number | string
}

type Veiculo = { _id: string; placa?: string }

export function tempoDesde(ts: number | string | undefined): string {
  if (!ts) return ''
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h${min % 60 ? ` ${min % 60}min` : ''}`
  return `há ${Math.floor(h / 24)} dia(s)`
}

function userBubbleId(): string {
  try {
    return String(JSON.parse(localStorage.getItem('mc_user') ?? '{}')?.user ?? '')
  } catch {
    return ''
  }
}

// Trocas de bateria em aberto (ABERTO / EM EXECUÇÃO) das motos da unidade do
// usuário. A filtragem por unidade (placa → veiculos_frota.Unidade) é feita no
// backend NOVO-bateria-abertas. Atualiza sozinho a cada minuto.
export function useTrocasBateria() {
  const [trocas, setTrocas] = useState<TrocaBateria[]>([])
  const [placas, setPlacas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(false)
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)

  const atualizar = useCallback(async () => {
    const unidades = getUnidadesAtivas()
    if (unidades.length === 0) { setCarregado(true); return }
    setCarregando(true)
    try {
      const data = await chamarBubble('NOVO-bateria-abertas', { unidades })
      const lista: TrocaBateria[] = data?.response?.trocas ?? []
      const veiculos: Veiculo[] = data?.response?.veiculos ?? []
      setTrocas(lista.filter(t => t.status === STATUS_ABERTO || t.status === STATUS_EM_EXECUCAO))
      setPlacas(Object.fromEntries(veiculos.map(v => [v._id, v.placa ?? ''])))
      setErro(null)
    } catch (err) {
      setErro(`Não foi possível carregar as trocas de bateria: ${String(err)}`)
    } finally {
      setCarregando(false)
      setCarregado(true)
    }
  }, [])

  useEffect(() => {
    const primeira = setTimeout(atualizar, 0)
    const id = setInterval(atualizar, INTERVALO_MS)
    return () => {
      clearTimeout(primeira)
      clearInterval(id)
    }
  }, [atualizar])

  const assumir = useCallback(async (trocaId: string) => {
    setAcaoEmAndamento(trocaId)
    try {
      await chamarBubble('NOVO-bateria-assumir', { troca: trocaId, user: userBubbleId() })
      await atualizar()
    } catch (err) {
      setErro(`Erro ao assumir a troca: ${String(err)}`)
    } finally {
      setAcaoEmAndamento(null)
    }
  }, [atualizar])

  const finalizar = useCallback(async (trocaId: string) => {
    setAcaoEmAndamento(trocaId)
    try {
      await chamarBubble('NOVO-bateria-finalizar', { troca: trocaId })
      await atualizar()
    } catch (err) {
      setErro(`Erro ao finalizar a troca: ${String(err)}`)
    } finally {
      setAcaoEmAndamento(null)
    }
  }, [atualizar])

  return { trocas, placas, carregando, carregado, erro, acaoEmAndamento, atualizar, assumir, finalizar }
}

export type TrocasBateriaState = ReturnType<typeof useTrocasBateria>
