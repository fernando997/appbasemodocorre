'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BatteryWarning, Bell, Loader2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
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

function tempoDesde(ts: number | string | undefined): string {
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
// backend NOVO-bateria-abertas. Chamado uma vez no AppShell para não duplicar
// a consulta entre o header do celular e o do desktop.
export function useTrocasBateria() {
  const [trocas, setTrocas] = useState<TrocaBateria[]>([])
  const [placas, setPlacas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)

  const atualizar = useCallback(async () => {
    const unidades = getUnidadesAtivas()
    if (unidades.length === 0) return
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

  return { trocas, placas, carregando, erro, acaoEmAndamento, assumir, finalizar }
}

export type TrocasBateriaState = ReturnType<typeof useTrocasBateria>

// flutuante: botão redondo do desktop (canto inferior direito), lista abre para cima
export function NotificacaoBateria({ estado, className, flutuante }: { estado: TrocasBateriaState; className?: string; flutuante?: boolean }) {
  const { trocas, placas, carregando, erro, acaoEmAndamento, assumir, finalizar } = estado
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meuUser = aberto ? userBubbleId() : ''

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const total = trocas.length

  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      <button
        onClick={() => setAberto(v => !v)}
        title={total ? `${total} troca(s) de bateria em aberto` : 'Trocas de bateria'}
        className={cn(
          'relative transition-colors',
          flutuante
            ? 'flex items-center justify-center w-14 h-14 rounded-full bg-[#1B2043] text-slate-100 hover:bg-[#262B59] shadow-[0_8px_24px_rgba(27,32,67,0.35)]'
            : 'p-1.5 rounded-lg text-[#8E92B3] hover:text-slate-100 hover:bg-[#262B59]'
        )}
      >
        <Bell className={cn(flutuante ? 'w-6 h-6' : 'w-5 h-5', total > 0 && 'text-amber-400')} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className={cn(
          'z-50 rounded-xl bg-white border border-[#E2E4F0] shadow-[0_8px_24px_rgba(99,102,241,0.18)] overflow-hidden text-slate-800',
          flutuante
            ? 'absolute right-0 bottom-full mb-3 w-96'
            : 'fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96'
        )}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E2E4F0]">
            <BatteryWarning className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold flex-1">Trocas de bateria em aberto</p>
            {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>

          {erro && <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{erro}</p>}

          {total === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhuma troca de bateria em aberto.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-[#E2E4F0]">
              {trocas.map(t => {
                const emExecucao = t.status === STATUS_EM_EXECUCAO
                const ocupado = acaoEmAndamento === t._id
                return (
                  <li key={t._id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{(t.placa && placas[t.placa]) || 'Placa —'}</span>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        emExecucao ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {emExecucao ? 'EM EXECUÇÃO' : 'ABERTO'}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{tempoDesde(t['Created Date'])}</span>
                    </div>
                    {t.endereco && (
                      <p className="flex items-start gap-1 text-xs text-slate-600">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{t.endereco}</span>
                      </p>
                    )}
                    {t.ponto_referencia && <p className="text-xs text-slate-500">Ref.: {t.ponto_referencia}</p>}
                    {emExecucao && (
                      <p className="text-[11px] text-blue-700">
                        {t.responsavel && t.responsavel === meuUser ? 'Assumida por você' : 'Assumida'}
                        {t.assumida_em ? ` ${tempoDesde(t.assumida_em)}` : ''}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      {t.protocolo && <span className="text-[11px] text-muted-foreground">Prot. {t.protocolo}</span>}
                      <button
                        disabled={ocupado}
                        onClick={() => (emExecucao ? finalizar(t._id) : assumir(t._id))}
                        className={cn(
                          'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-60',
                          emExecucao ? 'bg-green-600 hover:bg-green-700' : 'bg-[#6C63FF] hover:bg-[#5A52E0]'
                        )}
                      >
                        {ocupado && <Loader2 className="w-3 h-3 animate-spin" />}
                        {emExecucao ? 'Finalizar' : 'Assumir'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
