'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, BatteryWarning, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, List, Loader2, MapPin, Receipt, RefreshCw, Search, TruckIcon, X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'
import { tempoDesde, useTrocasBateria, type TrocaBateria, type TrocasBateriaState } from '@/components/ocorrencias/trocas-bateria'

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
const TAMANHO = 50

type Veiculo = {
  _id: string
  placa: string
  modelo?: string
  cor?: string
  km?: number
  status_veiculo_desc?: string
  lat?: string
  long?: string
  'data loc'?: string
  [key: string]: unknown
}

type PendenciaItem = {
  _id?: string
  'descrição'?: string
  tipo?: string
  status?: string
  veiculo?: string
  data?: number
  'Created Date'?: number
}

type RecolhaItem = {
  _id?: string
  motivo?: string
  status?: string
  placa?: string
  contrato?: string
  localiza_mapa?: string
  'Created Date'?: number
}

type Parcela = {
  _id: string
  'numero parcela'?: string
  'descrição parcela'?: string
  tipo?: string
  status?: string
  'valor parcela'?: number
  vencimento?: number
  url_pagamento?: string
}

// Mesma paginação do Dashboard (chamar-veiculos), com o cache mc_veiculos
async function carregarVeiculos(forcar: boolean): Promise<Veiculo[]> {
  if (!forcar) {
    try {
      const cache = localStorage.getItem('mc_veiculos')
      if (cache) return JSON.parse(cache)
    } catch {}
  }
  const ids = getUnidadesAtivas()
  const vistos = new Set<string>()
  const todos: Veiculo[] = []
  let minimo = 1
  while (true) {
    const data = await chamarBubble('chamar-veiculos', {
      unidade: JSON.stringify(ids),
      minimo: String(minimo),
      maximo: String(minimo + TAMANHO - 1),
    })
    const batch: Veiculo[] = data?.response?.veiculos ?? []
    if (batch.length === 0) break
    for (const v of batch) {
      if (!vistos.has(v._id)) { vistos.add(v._id); todos.push(v) }
    }
    minimo += TAMANHO
    await sleep(INTERVALO_PAGINACAO_MS)
  }
  localStorage.setItem('mc_veiculos', JSON.stringify(todos))
  return todos
}

// Mesma paginação do Dashboard (chamar-recolhas-pendencias) — as pendências
// vêm completas na 1ª página, as recolhas são paginadas
async function carregarRecolhasPendencias(): Promise<{ recolhas: RecolhaItem[]; pendencias: PendenciaItem[] }> {
  const ids = getUnidadesAtivas()
  const recolhas: RecolhaItem[] = []
  const pendencias: PendenciaItem[] = []
  const vistosR = new Set<string>()
  const vistosP = new Set<string>()
  let pendenciasCarregadas = false
  let minimo = 1
  while (true) {
    const data = await chamarBubble('chamar-recolhas-pendencias', {
      unidade: JSON.stringify(ids),
      minimo: String(minimo),
      maximo: String(minimo + TAMANHO - 1),
    })
    const batchR: RecolhaItem[] = data?.response?.recolha ?? []
    const batchP: PendenciaItem[] = data?.response?.pendencias ?? []
    for (const r of batchR) {
      if (r._id && !vistosR.has(r._id)) { vistosR.add(r._id); recolhas.push(r) }
    }
    if (!pendenciasCarregadas) {
      for (const p of batchP) {
        if (p._id && !vistosP.has(p._id)) { vistosP.add(p._id); pendencias.push(p) }
      }
      pendenciasCarregadas = true
    }
    if (batchR.length === 0) break
    minimo += TAMANHO
    await sleep(INTERVALO_PAGINACAO_MS)
  }
  return { recolhas, pendencias }
}

// ─── Modelo único para as 3 origens ─────────────────────────────────────────

type TipoOcorrencia = 'BATERIA' | 'PENDENCIA' | 'RECOLHA'

type Ocorrencia = {
  id: string
  tipo: TipoOcorrencia
  placa: string
  veiculo?: Veiculo
  titulo: string            // motivo / descrição principal
  detalhe?: string          // tipo da pendência, endereço da bateria...
  status: string
  data?: number | string
  mapa?: string             // link do local da ocorrência
  troca?: TrocaBateria
  contratoId?: string       // recolha: para consultar as parcelas
}

const TIPOS: Record<TipoOcorrencia, { label: string; icon: typeof BatteryWarning; cor: string; badge: string }> = {
  BATERIA: { label: 'Bateria', icon: BatteryWarning, cor: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  PENDENCIA: { label: 'Pendência', icon: AlertTriangle, cor: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700' },
  RECOLHA: { label: 'Recolha', icon: TruckIcon, cor: 'text-red-600', badge: 'bg-red-100 text-red-700' },
}

const CORES_STATUS: Record<string, string> = {
  'ABERTO': 'bg-amber-100 text-amber-700',
  'EM EXECUÇÃO': 'bg-blue-100 text-blue-700',
  'PENDENTE': 'bg-yellow-100 text-yellow-700',
  'EM ANDAMENTO': 'bg-red-100 text-red-700',
}

function formatarData(ts: number | string | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function linkMapaVeiculo(v?: Veiculo): string | undefined {
  if (!v?.lat || !v?.long) return undefined
  return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.long}`
}

function infoMoto(v?: Veiculo): string {
  return [v?.modelo, v?.cor].filter(Boolean).join(' · ')
}

// ─── Botão de ação (bateria: assumir/finalizar; recolha: ir para Funções) ───

function AcaoOcorrencia({ o, bateria, className }: { o: Ocorrencia; bateria: TrocasBateriaState; className?: string }) {
  if (o.tipo === 'BATERIA' && o.troca) {
    const emExecucao = o.status === 'EM EXECUÇÃO'
    const ocupado = bateria.acaoEmAndamento === o.id
    return (
      <button
        disabled={ocupado}
        onClick={() => (emExecucao ? bateria.finalizar(o.id) : bateria.assumir(o.id))}
        className={cn(
          'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-60',
          emExecucao ? 'bg-green-600 hover:bg-green-700' : 'bg-[#6C63FF] hover:bg-[#5A52E0]',
          className
        )}
      >
        {ocupado && <Loader2 className="w-3 h-3 animate-spin" />}
        {emExecucao ? 'Finalizar' : 'Assumir'}
      </button>
    )
  }
  if (o.tipo === 'RECOLHA') {
    // A recolha é feita em Funções, a partir da foto da placa
    return (
      <div className={cn('flex gap-2', className)}>
        {o.contratoId && <BotaoParcelas contratoId={o.contratoId} placa={o.placa} />}
        <Link
          href="/movimentacao"
          className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#6C63FF] hover:bg-[#5A52E0] transition-colors whitespace-nowrap"
        >
          Ir para Funções
        </Link>
      </div>
    )
  }
  return null
}

// ─── Parcelas do contrato da recolha (base-consulta-parcelas) ───────────────

function inicioDoDia(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Mesma regra de Funções: GERADO com vencimento até hoje = vencida
function parcelaVencida(p: Parcela): boolean {
  return p.status === 'GERADO' && typeof p.vencimento === 'number' && inicioDoDia(p.vencimento) <= inicioDoDia(Date.now())
}

// Dias de atraso (0 = vence hoje)
function diasAtraso(p: Parcela): number {
  return Math.round((inicioDoDia(Date.now()) - inicioDoDia(p.vencimento ?? Date.now())) / 86_400_000)
}

function formatarValor(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
}

const PARCELAS_POR_PAGINA = 5

function BotaoParcelas({ contratoId, placa }: { contratoId: string; placa: string }) {
  const [aberto, setAberto] = useState(false)
  const [parcelas, setParcelas] = useState<Parcela[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)

  async function abrir() {
    setAberto(true)
    setPagina(1)
    setCarregando(true)
    setErro(null)
    try {
      const data = await chamarBubble('base-consulta-parcelas', { contrato: contratoId })
      const lista: Parcela[] = data?.response?.parcelas ?? []
      // Só interessa o que já venceu ou vence hoje
      setParcelas(lista.filter(parcelaVencida).sort((a, b) => (a.vencimento ?? 0) - (b.vencimento ?? 0)))
    } catch {
      setErro('Não foi possível consultar as parcelas.')
    } finally {
      setCarregando(false)
    }
  }

  const totalVencido = (parcelas ?? []).reduce((s, p) => s + (p['valor parcela'] ?? 0), 0)
  const totalPaginas = Math.max(1, Math.ceil((parcelas?.length ?? 0) / PARCELAS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)

  return (
    <>
      <button
        onClick={abrir}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0] transition-colors whitespace-nowrap"
      >
        <Receipt className="w-3.5 h-3.5" />
        Parcelas
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#6C63FF]" />
              Parcelas — <span className="font-mono">{placa}</span>
            </DialogTitle>
          </DialogHeader>

          {carregando ? (
            <p className="py-6 text-sm text-muted-foreground text-center inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="w-4 h-4 animate-spin" /> Consultando parcelas...
            </p>
          ) : erro ? (
            <p className="text-sm text-red-600">{erro}</p>
          ) : !parcelas || parcelas.length === 0 ? (
            <p className="py-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl text-center">
              Nenhuma parcela vencida ou vencendo hoje.
            </p>
          ) : (
            // min-w-0: o DialogContent é grid — sem isso o texto da parcela alarga a coluna e o card é cortado
            <div className="space-y-3 min-w-0">
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#F4F5FA] px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Em atraso / hoje</p>
                  <p className="text-lg font-bold text-[#1B2043] tabular-nums">{parcelas.length}</p>
                </div>
                <div className="rounded-xl bg-[#F4F5FA] px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-red-600 tabular-nums">{formatarValor(totalVencido)}</p>
                </div>
              </div>

              <ul className="space-y-2">
                {parcelas.slice((paginaAtual - 1) * PARCELAS_POR_PAGINA, paginaAtual * PARCELAS_POR_PAGINA).map((p) => {
                  const atraso = diasAtraso(p)
                  const venceHoje = atraso <= 0
                  return (
                    <li
                      key={p._id}
                      className={cn(
                        'min-w-0 rounded-xl border border-[#E2E4F0] border-l-4 bg-white px-3 py-2.5',
                        venceHoje ? 'border-l-amber-500' : 'border-l-red-500'
                      )}
                    >
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Vencimento</p>
                          <p className={cn('text-lg font-bold tabular-nums leading-tight', venceHoje ? 'text-amber-600' : 'text-red-600')}>
                            {formatarData(p.vencimento)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-muted-foreground">Valor</p>
                          <p className="text-lg font-bold text-[#1B2043] tabular-nums leading-tight">{formatarValor(p['valor parcela'])}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-start gap-2 text-xs">
                        {venceHoje && (
                          <span className="shrink-0 font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Vence hoje
                          </span>
                        )}
                        {/* Descrição quebra linha em vez de cortar */}
                        <span className="min-w-0 flex-1 break-words text-muted-foreground pt-0.5">
                          {String(p['descrição parcela'] ?? p.tipo ?? '').trim()}
                        </span>
                        {p.url_pagamento && (
                          <a
                            href={p.url_pagamento}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto shrink-0 inline-flex items-center gap-1 pt-0.5 font-semibold text-[#6C63FF] hover:underline"
                          >
                            Pagar <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setPagina(paginaAtual - 1)}
                    disabled={paginaAtual === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0] disabled:opacity-40 disabled:hover:bg-[#EEF0F8]"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {paginaAtual} de {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPagina(paginaAtual + 1)}
                    disabled={paginaAtual === totalPaginas}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0] disabled:opacity-40 disabled:hover:bg-[#EEF0F8]"
                  >
                    Próxima <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function LinkMapa({ href, label }: { href?: string; label: string }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#6C63FF] hover:underline">
      <MapPin className="w-3 h-3" />
      {label}
    </a>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

type Visualizacao = 'cards' | 'tabela'
type Ordem = 'recentes' | 'antigas'

export default function OcorrenciasPage() {
  const bateria = useTrocasBateria()
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [recolhas, setRecolhas] = useState<RecolhaItem[]>([])
  const [pendencias, setPendencias] = useState<PendenciaItem[]>([])
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  const [filtroTipo, setFiltroTipo] = useState<TipoOcorrencia | 'TODAS'>('TODAS')
  const [filtroStatus, setFiltroStatus] = useState('TODOS')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('antigas')
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('cards')

  const carregar = useCallback(async (forcar: boolean) => {
    setErro(null)
    try {
      const [v, rp] = await Promise.all([carregarVeiculos(forcar), carregarRecolhasPendencias()])
      setVeiculos(v)
      setRecolhas(rp.recolhas)
      setPendencias(rp.pendencias)
    } catch {
      setErro('Não foi possível carregar as pendências e recolhas.')
    } finally {
      setCarregado(true)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      carregar(false)
      // Visualização escolhida fica salva por aparelho
      try {
        const salva = localStorage.getItem('mc_ocorrencias_visualizacao')
        if (salva === 'cards' || salva === 'tabela') setVisualizacao(salva)
      } catch {}
    }, 0)
    return () => clearTimeout(id)
  }, [carregar])

  function trocarVisualizacao(v: Visualizacao) {
    setVisualizacao(v)
    try { localStorage.setItem('mc_ocorrencias_visualizacao', v) } catch {}
  }

  async function atualizarTudo() {
    if (atualizando) return
    setAtualizando(true)
    try {
      await Promise.all([carregar(true), bateria.atualizar()])
    } finally {
      setAtualizando(false)
    }
  }

  const ocorrencias = useMemo<Ocorrencia[]>(() => {
    const veiculoPorId = Object.fromEntries(veiculos.map((v) => [v._id, v]))
    const lista: Ocorrencia[] = []

    for (const t of bateria.trocas) {
      const placa = (t.placa && bateria.placas[t.placa]) || ''
      const v = veiculos.find((x) => x.placa === placa)
      lista.push({
        id: t._id,
        tipo: 'BATERIA',
        placa: placa || '—',
        veiculo: v,
        titulo: 'Troca de bateria',
        detalhe: [t.endereco, t.ponto_referencia && `Ref.: ${t.ponto_referencia}`, t.protocolo && `Prot. ${t.protocolo}`].filter(Boolean).join(' · '),
        status: t.status ?? 'ABERTO',
        data: t['Created Date'],
        mapa: t.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.endereco)}` : undefined,
        troca: t,
      })
    }

    for (const p of pendencias) {
      if (p.status !== 'ATIVO') continue
      const v = veiculoPorId[p.veiculo ?? '']
      lista.push({
        id: p._id ?? `${p.veiculo}-${p['descrição']}`,
        tipo: 'PENDENCIA',
        placa: v?.placa ?? '—',
        veiculo: v,
        titulo: String(p['descrição'] ?? 'Pendência'),
        detalhe: p.tipo,
        status: 'PENDENTE',
        data: p.data ?? p['Created Date'],
      })
    }

    // A API não filtra recolhas por unidade — só entram as motos da unidade ativa.
    // Aberta = EM ANDAMENTO, mesma regra de Funções (as outras são FINALIZADO, CONCLUIDO, CANCELADO)
    for (const r of recolhas) {
      const v = veiculoPorId[r.placa ?? '']
      if (!v || String(r.status ?? '').trim().toUpperCase() !== 'EM ANDAMENTO') continue
      lista.push({
        id: r._id ?? `${r.placa}`,
        tipo: 'RECOLHA',
        placa: v.placa,
        veiculo: v,
        titulo: String(r.motivo ?? 'Recolha').trim(),
        status: 'EM ANDAMENTO',
        data: r['Created Date'],
        mapa: r.localiza_mapa,
        contratoId: r.contrato,
      })
    }
    return lista
  }, [bateria.trocas, bateria.placas, pendencias, recolhas, veiculos])

  const contagem = useMemo(() => ({
    TODAS: ocorrencias.length,
    BATERIA: ocorrencias.filter((o) => o.tipo === 'BATERIA').length,
    PENDENCIA: ocorrencias.filter((o) => o.tipo === 'PENDENCIA').length,
    RECOLHA: ocorrencias.filter((o) => o.tipo === 'RECOLHA').length,
  }), [ocorrencias])

  const statusDisponiveis = useMemo(
    () => Array.from(new Set(ocorrencias.filter((o) => filtroTipo === 'TODAS' || o.tipo === filtroTipo).map((o) => o.status))),
    [ocorrencias, filtroTipo]
  )

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return ocorrencias
      .filter((o) => filtroTipo === 'TODAS' || o.tipo === filtroTipo)
      .filter((o) => filtroStatus === 'TODOS' || o.status === filtroStatus)
      .filter((o) => !termo || [o.placa, o.titulo, o.detalhe, o.veiculo?.modelo, o.veiculo?.cor]
        .some((c) => String(c ?? '').toLowerCase().includes(termo)))
      .sort((a, b) => {
        const da = new Date(a.data ?? 0).getTime()
        const db = new Date(b.data ?? 0).getTime()
        return ordem === 'antigas' ? da - db : db - da
      })
  }, [ocorrencias, filtroTipo, filtroStatus, busca, ordem])

  const temFiltro = filtroTipo !== 'TODAS' || filtroStatus !== 'TODOS' || busca.trim() !== ''
  const carregando = !carregado || !bateria.carregado

  function limparFiltros() {
    setFiltroTipo('TODAS')
    setFiltroStatus('TODOS')
    setBusca('')
  }

  return (
    <>
      <PageHeader
        title="Ocorrências"
        description="Bateria, pendências e recolhas das motos da base"
        actions={
          <>
            <div className="bg-white rounded-xl px-3 py-1.5 text-center shadow-[0_2px_12px_rgba(99,102,241,0.08)]">
              <p className="text-muted-foreground text-xs">Em aberto</p>
              <p className="font-bold text-base leading-tight">{contagem.TODAS}</p>
            </div>
            <button
              onClick={atualizarTudo}
              disabled={atualizando}
              title="Atualizar ocorrências"
              className="bg-white rounded-xl px-3 py-1.5 shadow-[0_2px_12px_rgba(99,102,241,0.08)] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-[#1B2043] ${atualizando ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      <div className="p-3 sm:p-6 max-w-screen-xl mx-auto space-y-4">

        {/* Resumo por tipo — também serve de filtro */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {(['TODAS', 'BATERIA', 'PENDENCIA', 'RECOLHA'] as const).map((t) => {
            const ativo = filtroTipo === t
            const Icon = t === 'TODAS' ? List : TIPOS[t].icon
            return (
              <button
                key={t}
                onClick={() => { setFiltroTipo(t); setFiltroStatus('TODOS') }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all border',
                  ativo
                    ? 'bg-[#1B2043] border-[#1B2043] text-white shadow-[0_4px_12px_rgba(27,32,67,0.25)]'
                    : 'bg-white border-transparent text-[#1B2043] shadow-[0_2px_12px_rgba(99,102,241,0.08)] hover:border-[#6C63FF]/40'
                )}
              >
                <div className={cn('p-2 rounded-xl shrink-0', ativo ? 'bg-white/10' : 'bg-[#EEF0F8]')}>
                  <Icon className={cn('w-4 h-4', ativo ? 'text-white' : t === 'TODAS' ? 'text-[#6C63FF]' : TIPOS[t].cor)} />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-xs truncate', ativo ? 'text-white/70' : 'text-muted-foreground')}>
                    {t === 'TODAS' ? 'Todas' : t === 'PENDENCIA' ? 'Pendências' : t === 'RECOLHA' ? 'Recolhas' : 'Bateria'}
                  </p>
                  <p className="text-xl font-extrabold leading-tight tabular-nums">{contagem[t]}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_2px_12px_rgba(99,102,241,0.08)] flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar placa, motivo, modelo..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[#E2E4F0] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
            />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-[#E2E4F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
            >
              <option value="TODOS">Todos os status</option>
              {statusDisponiveis.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              className="px-3 py-2 text-sm rounded-xl border border-[#E2E4F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
            >
              <option value="antigas">Mais antigas primeiro</option>
              <option value="recentes">Mais recentes primeiro</option>
            </select>
          </div>
          {/* Tabela só existe a partir do tablet — no celular é sempre card */}
          <div className="hidden md:flex rounded-xl border border-[#E2E4F0] p-0.5 shrink-0">
            <button
              onClick={() => trocarVisualizacao('cards')}
              title="Cards"
              className={cn('p-1.5 rounded-lg', visualizacao === 'cards' ? 'bg-[#1B2043] text-white' : 'text-muted-foreground hover:text-[#1B2043]')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => trocarVisualizacao('tabela')}
              title="Tabela"
              className={cn('p-1.5 rounded-lg', visualizacao === 'tabela' ? 'bg-[#1B2043] text-white' : 'text-muted-foreground hover:text-[#1B2043]')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(erro || bateria.erro) && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erro ?? bateria.erro}</p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{filtradas.length} ocorrência(s){temFiltro ? ' com os filtros aplicados' : ''}</span>
          {temFiltro && (
            <button onClick={limparFiltros} className="inline-flex items-center gap-1 text-[#6C63FF] hover:underline">
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>

        {filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl py-10 text-center text-sm text-muted-foreground shadow-[0_2px_12px_rgba(99,102,241,0.08)]">
            {carregando ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando ocorrências...</span>
            ) : temFiltro ? 'Nenhuma ocorrência com esses filtros.' : 'Nenhuma ocorrência em aberto.'}
          </div>
        ) : (
          <>
            {/* Cards — sempre no celular; no tablet/desktop quando escolhido */}
            <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', visualizacao === 'tabela' && 'md:hidden')}>
              {filtradas.map((o) => <CardOcorrencia key={`${o.tipo}-${o.id}`} o={o} bateria={bateria} />)}
            </div>

            {visualizacao === 'tabela' && (
              <div className="hidden md:block bg-white rounded-2xl shadow-[0_2px_12px_rgba(99,102,241,0.08)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-[#E2E4F0]">
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Moto</th>
                      <th className="px-4 py-3 font-semibold">Ocorrência</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Aberta</th>
                      <th className="px-4 py-3 font-semibold">Local</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E4F0]">
                    {filtradas.map((o) => {
                      const T = TIPOS[o.tipo]
                      return (
                        <tr key={`${o.tipo}-${o.id}`} className="align-top hover:bg-[#F7F8FC]">
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', T.badge)}>
                              <T.icon className="w-3 h-3" /> {T.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono font-bold">{o.placa}</p>
                            <p className="text-xs text-muted-foreground">{infoMoto(o.veiculo) || '—'}</p>
                            {o.veiculo?.status_veiculo_desc && <p className="text-[11px] text-muted-foreground/80">{o.veiculo.status_veiculo_desc}</p>}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="font-medium">{o.titulo}</p>
                            {o.detalhe && <p className="text-xs text-muted-foreground">{o.detalhe}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', CORES_STATUS[o.status] ?? 'bg-zinc-100 text-zinc-600')}>
                              {o.status}
                            </span>
                            {o.tipo === 'BATERIA' && o.troca?.assumida_em && (
                              <p className="text-[11px] text-blue-700 mt-1">Assumida {tempoDesde(o.troca.assumida_em)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p>{formatarData(o.data)}</p>
                            <p className="text-xs text-muted-foreground">{tempoDesde(o.data)}</p>
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <LinkMapa href={o.mapa} label="Local" />
                            <div><LinkMapa href={linkMapaVeiculo(o.veiculo)} label="Moto agora" /></div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <AcaoOcorrencia o={o} bateria={bateria} className="inline-flex" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function CardOcorrencia({ o, bateria }: { o: Ocorrencia; bateria: TrocasBateriaState }) {
  const T = TIPOS[o.tipo]
  const meuUser = (() => { try { return String(JSON.parse(localStorage.getItem('mc_user') ?? '{}')?.user ?? '') } catch { return '' } })()
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(99,102,241,0.08)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', T.badge)}>
          <T.icon className="w-3 h-3" /> {T.label}
        </span>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CORES_STATUS[o.status] ?? 'bg-zinc-100 text-zinc-600')}>
          {o.status}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">{tempoDesde(o.data)}</span>
      </div>

      <div>
        <p className="font-mono font-extrabold text-lg text-[#1B2043] leading-tight">{o.placa}</p>
        <p className="text-xs text-muted-foreground">
          {[infoMoto(o.veiculo), o.veiculo?.status_veiculo_desc].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-800">{o.titulo}</p>
        {o.detalhe && <p className="text-xs text-muted-foreground mt-0.5">{o.detalhe}</p>}
        {o.tipo === 'BATERIA' && o.status === 'EM EXECUÇÃO' && (
          <p className="text-[11px] text-blue-700 mt-1">
            {o.troca?.responsavel && o.troca.responsavel === meuUser ? 'Assumida por você' : 'Assumida'}
            {o.troca?.assumida_em ? ` ${tempoDesde(o.troca.assumida_em)}` : ''}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Aberta em {formatarData(o.data)}</span>
        {o.veiculo?.km != null && <span>{Number(o.veiculo.km).toLocaleString('pt-BR')} km</span>}
        <LinkMapa href={o.mapa} label="Local" />
        <LinkMapa href={linkMapaVeiculo(o.veiculo)} label="Moto agora" />
      </div>

      <AcaoOcorrencia o={o} bateria={bateria} className="w-full mt-auto py-2" />
    </div>
  )
}
