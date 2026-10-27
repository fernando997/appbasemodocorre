'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BatteryWarning, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, LayoutGrid, List, Loader2,
  MapPin, Receipt, RefreshCw, Search, TruckIcon, Wrench, X, XCircle,
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
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const INTERVALO_PAGINACAO_MS = 500
const TAMANHO = 50
// Encerradas: só as dos últimos 30 dias (o histórico de recolhas é grande)
const JANELA_ENCERRADAS_MS = 30 * 24 * 60 * 60 * 1000

type Veiculo = {
  _id: string
  placa: string
  modelo?: string
  cor?: string
  km?: number
  status_veiculo_desc?: string
  lat?: string
  long?: string
  Unidade?: string
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
  ocorrencia?: string
  localiza_mapa?: string
  finalizado_por?: string
  nome_responsavel?: string
  'Created Date'?: number
  'Modified Date'?: number
}

// Ocorrência "RECOLHA PARA MANUTENÇÃO" — não gera recolha, vem direto da
// tabela de ocorrências (manutencoes em chamar-recolhas-pendencias)
type ManutencaoItem = {
  _id: string
  status?: string
  'descrição'?: string
  veiculo?: string
  'local da ocorrencia'?: string
  numero_unico?: number
  assumida_por?: string     // gravados pelo base-fechar-ocorrencia
  finalizada_por?: string
  'ultimo tratamento'?: number
  'Created Date'?: number
  'Modified Date'?: number
}

// Ocorrência ligada à recolha (ocorrencias em chamar-recolhas-pendencias)
type OcorrenciaRecolha = { _id: string; status?: string; assumida_por?: string; finalizada_por?: string }

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

type UsuarioLogado = { baseId: string; userId: string; nome: string; admin: boolean }

function lerUsuario(): UsuarioLogado {
  try {
    const u = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
    return {
      baseId: String(u?._id ?? ''),
      userId: String(u?.user ?? ''),
      nome: String(u?.Nome ?? u?.nome ?? ''),
      admin: u?.Tipo === 'ADMIN',
    }
  } catch {
    return { baseId: '', userId: '', nome: '', admin: false }
  }
}

function lerUnidades(): { _id: string; nome: string }[] {
  try {
    const raw: { _id: string; 'Nome Unidade'?: string }[] = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]')
    const ativas = new Set(getUnidadesAtivas())
    return raw.filter((u) => ativas.has(u._id)).map((u) => ({ _id: u._id, nome: u['Nome Unidade'] ?? u._id }))
  } catch {
    return []
  }
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

// Mesma paginação do Dashboard (chamar-recolhas-pendencias) — pendências e
// manutenções vêm completas na 1ª página, as recolhas são paginadas
async function carregarRecolhasPendencias(): Promise<{
  recolhas: RecolhaItem[]
  pendencias: PendenciaItem[]
  manutencoes: ManutencaoItem[]
  ocorrenciasRecolha: Record<string, OcorrenciaRecolha>
}> {
  const ids = getUnidadesAtivas()
  const recolhas: RecolhaItem[] = []
  const pendencias: PendenciaItem[] = []
  const manutencoes: ManutencaoItem[] = []
  // a lista vem sem nulos, então liga por id, nunca por posição
  const ocorrenciasRecolha: Record<string, OcorrenciaRecolha> = {}
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
    for (const o of (data?.response?.ocorrencias ?? []) as OcorrenciaRecolha[]) {
      if (o._id) ocorrenciasRecolha[o._id] = o
    }
    if (!pendenciasCarregadas) {
      for (const p of batchP) {
        if (p._id && !vistosP.has(p._id)) { vistosP.add(p._id); pendencias.push(p) }
      }
      manutencoes.push(...((data?.response?.manutencoes ?? []) as ManutencaoItem[]))
      pendenciasCarregadas = true
    }
    if (batchR.length === 0) break
    minimo += TAMANHO
    await sleep(INTERVALO_PAGINACAO_MS)
  }
  return { recolhas, pendencias, manutencoes, ocorrenciasRecolha }
}

// ─── Modelo único para as origens ───────────────────────────────────────────

type TipoOcorrencia = 'BATERIA' | 'INADIMPLENCIA' | 'MANUTENCAO' | 'PENDENCIA'
type StatusOcorrencia = 'NOVA' | 'ASSUMIDA' | 'ENCERRADA' | 'PENDENTE'

type Ocorrencia = {
  id: string
  tipo: TipoOcorrencia
  status: StatusOcorrencia
  placa: string
  veiculo?: Veiculo
  titulo: string            // motivo / descrição principal
  detalhe?: string          // tipo da pendência, endereço da bateria...
  data?: number | string    // abertura
  responsavel?: string      // quem assumiu / encerrou (texto para exibir)
  dataResponsavel?: number | string
  mapa?: string             // link do local da ocorrência
  troca?: TrocaBateria
  recolha?: RecolhaItem
  manutencao?: ManutencaoItem
}

const TIPOS: Record<TipoOcorrencia, { label: string; plural: string; icon: typeof BatteryWarning; cor: string; badge: string }> = {
  BATERIA: { label: 'Troca de bateria', plural: 'Bateria', icon: BatteryWarning, cor: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  INADIMPLENCIA: { label: 'Recolha por inadimplência', plural: 'Inadimplência', icon: TruckIcon, cor: 'text-red-600', badge: 'bg-red-100 text-red-700' },
  MANUTENCAO: { label: 'Recolha para manutenção', plural: 'Manutenção', icon: Wrench, cor: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  PENDENCIA: { label: 'Pendência', plural: 'Pendências', icon: AlertTriangle, cor: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700' },
}

const CORES_STATUS: Record<StatusOcorrencia, string> = {
  NOVA: 'bg-amber-100 text-amber-700',
  ASSUMIDA: 'bg-blue-100 text-blue-700',
  ENCERRADA: 'bg-zinc-100 text-zinc-600',
  PENDENTE: 'bg-yellow-100 text-yellow-700',
}

function statusRecolha(r: RecolhaItem): StatusOcorrencia | null {
  const s = String(r.status ?? '').trim().toUpperCase()
  if (s === 'EM ANDAMENTO') return 'NOVA'
  if (s === 'FINALIZADO' || s === 'CONCLUIDO') return 'ENCERRADA'
  return null // CANCELADO e outros não entram
}

function statusBateria(t: TrocaBateria): StatusOcorrencia {
  if (t.status === 'EM EXECUÇÃO') return 'ASSUMIDA'
  if (t.status === 'FINALIZADO') return 'ENCERRADA'
  return 'NOVA'
}

const mesmoNome = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

// Regra do Felipe: NOVA todos veem; ASSUMIDA só quem assumiu; ENCERRADA só quem
// encerrou — admin vê tudo
function podeVer(o: Ocorrencia, u: UsuarioLogado): boolean {
  if (u.admin || o.status === 'NOVA' || o.status === 'PENDENTE') return true
  if (o.troca) return !!u.userId && o.troca.responsavel === u.userId
  if (o.recolha) {
    return (!!u.userId && o.recolha.finalizado_por === u.userId)
      || mesmoNome(o.recolha.nome_responsavel, u.nome)
      || mesmoNome(o.responsavel, u.nome)
  }
  if (o.manutencao) return mesmoNome(o.responsavel, u.nome)
  return false
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

// ─── Ações: consultar sempre; NOVA → assumir; ASSUMIDA → encerrar ──────────

type Acoes = {
  bateria: TrocasBateriaState
  usuario: UsuarioLogado
  emAndamento: string | null
  assumir: (o: Ocorrencia) => void
  encerrar: (o: Ocorrencia) => void
  consultar: (o: Ocorrencia) => void
}

function BotoesOcorrencia({ o, acoes, className }: { o: Ocorrencia; acoes: Acoes; className?: string }) {
  const ocupado = acoes.emAndamento === o.id
  const botao = 'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60'
  return (
    <div className={cn('flex gap-2', className)}>
      <button onClick={() => acoes.consultar(o)} className={cn(botao, 'text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0]')}>
        <Eye className="w-3.5 h-3.5" /> Consultar
      </button>
      {o.status === 'NOVA' && (o.troca || o.manutencao || o.recolha?.ocorrencia) && (
        <button disabled={ocupado} onClick={() => acoes.assumir(o)} className={cn(botao, 'flex-1 text-white bg-[#6C63FF] hover:bg-[#5A52E0]')}>
          {ocupado && <Loader2 className="w-3 h-3 animate-spin" />} Assumir
        </button>
      )}
      {/* Recolha sem ocorrência ligada não tem como assumir — encerra direto da NOVA */}
      {(o.status === 'ASSUMIDA' || (o.status === 'NOVA' && o.recolha && !o.recolha.ocorrencia)) && (
        <button disabled={ocupado} onClick={() => acoes.encerrar(o)} className={cn(botao, 'flex-1 text-white bg-green-600 hover:bg-green-700')}>
          {ocupado && <Loader2 className="w-3 h-3 animate-spin" />} Encerrar
        </button>
      )}
    </div>
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

function formatarValor(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
}

const PARCELAS_POR_PAGINA = 5

function ParcelasVencidas({ contratoId }: { contratoId: string }) {
  const [parcelas, setParcelas] = useState<Parcela[] | null>(null)
  const [hoje, setHoje] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    let cancelado = false
    chamarBubble('base-consulta-parcelas', { contrato: contratoId })
      .then((data) => {
        if (cancelado) return
        setHoje(inicioDoDia(Date.now()))
        const lista: Parcela[] = data?.response?.parcelas ?? []
        // Só interessa o que já venceu ou vence hoje
        setParcelas(lista.filter(parcelaVencida).sort((a, b) => (a.vencimento ?? 0) - (b.vencimento ?? 0)))
      })
      .catch(() => { if (!cancelado) setErro('Não foi possível consultar as parcelas.') })
    return () => { cancelado = true }
  }, [contratoId])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!parcelas) {
    return (
      <p className="py-4 text-sm text-muted-foreground text-center inline-flex items-center justify-center gap-2 w-full">
        <Loader2 className="w-4 h-4 animate-spin" /> Consultando parcelas...
      </p>
    )
  }
  if (parcelas.length === 0) {
    return (
      <p className="py-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl text-center">
        Nenhuma parcela vencida ou vencendo hoje.
      </p>
    )
  }

  const total = parcelas.reduce((s, p) => s + (p['valor parcela'] ?? 0), 0)
  const totalPaginas = Math.max(1, Math.ceil(parcelas.length / PARCELAS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)

  return (
    <div className="space-y-3 min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#F4F5FA] px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Em atraso / hoje</p>
          <p className="text-lg font-bold text-[#1B2043] tabular-nums">{parcelas.length}</p>
        </div>
        <div className="rounded-xl bg-[#F4F5FA] px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-lg font-bold text-red-600 tabular-nums">{formatarValor(total)}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {parcelas.slice((paginaAtual - 1) * PARCELAS_POR_PAGINA, paginaAtual * PARCELAS_POR_PAGINA).map((p) => {
          const venceHoje = inicioDoDia(p.vencimento ?? 0) === hoje
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
                  <span className="shrink-0 font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Vence hoje</span>
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0] disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">{paginaAtual} de {totalPaginas}</span>
          <button
            onClick={() => setPagina(paginaAtual + 1)}
            disabled={paginaAtual === totalPaginas}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0] disabled:opacity-40"
          >
            Próxima <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Consultar: dados da ocorrência (+ parcelas na inadimplência) ───────────

function DialogConsulta({ o, onFechar }: { o: Ocorrencia | null; onFechar: () => void }) {
  const T = o ? TIPOS[o.tipo] : null
  return (
    <Dialog open={!!o} onOpenChange={(aberto) => { if (!aberto) onFechar() }}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md">
        {o && T && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <T.icon className={cn('w-5 h-5', T.cor)} />
                {T.label}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-lg text-[#1B2043]">{o.placa}</span>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CORES_STATUS[o.status])}>{o.status}</span>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Moto</dt>
                <dd className="break-words">{[infoMoto(o.veiculo), o.veiculo?.status_veiculo_desc].filter(Boolean).join(' · ') || '—'}</dd>
                <dt className="text-muted-foreground">Ocorrência</dt>
                <dd className="break-words">{o.titulo}</dd>
                {o.detalhe && (<><dt className="text-muted-foreground">Detalhe</dt><dd className="break-words">{o.detalhe}</dd></>)}
                <dt className="text-muted-foreground">Aberta em</dt>
                <dd>{formatarData(o.data)} ({tempoDesde(o.data)})</dd>
                {o.responsavel && (
                  <>
                    <dt className="text-muted-foreground">{o.status === 'ENCERRADA' ? 'Encerrada por' : 'Assumida por'}</dt>
                    <dd className="break-words">{o.responsavel}{o.dataResponsavel ? ` — ${formatarData(o.dataResponsavel)}` : ''}</dd>
                  </>
                )}
                {o.veiculo?.km != null && (<><dt className="text-muted-foreground">KM</dt><dd>{Number(o.veiculo.km).toLocaleString('pt-BR')}</dd></>)}
              </dl>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <LinkMapa href={o.mapa} label="Local" />
                <LinkMapa href={linkMapaVeiculo(o.veiculo)} label="Moto agora" />
              </div>

              {o.tipo === 'INADIMPLENCIA' && o.recolha?.contrato && (
                <div className="pt-2 border-t border-[#E2E4F0] space-y-2">
                  <p className="flex items-center gap-1.5 font-semibold text-[#1B2043]"><Receipt className="w-4 h-4" /> Parcelas</p>
                  <ParcelasVencidas contratoId={o.recolha.contrato} />
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

type Visualizacao = 'cards' | 'tabela'
type Ordem = 'recentes' | 'antigas'
type FiltroStatus = 'ABERTAS' | StatusOcorrencia | 'TODOS'

export default function OcorrenciasPage() {
  const bateria = useTrocasBateria()
  const [usuario, setUsuario] = useState<UsuarioLogado>({ baseId: '', userId: '', nome: '', admin: false })
  const [unidades, setUnidades] = useState<{ _id: string; nome: string }[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [recolhas, setRecolhas] = useState<RecolhaItem[]>([])
  const [pendencias, setPendencias] = useState<PendenciaItem[]>([])
  const [manutencoes, setManutencoes] = useState<ManutencaoItem[]>([])
  const [ocorrenciasRecolha, setOcorrenciasRecolha] = useState<Record<string, OcorrenciaRecolha>>({})
  const [carregado, setCarregado] = useState(false)
  const [agora, setAgora] = useState(0) // hora da última carga — base da janela das encerradas
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [emAndamento, setEmAndamento] = useState<string | null>(null)
  const [consultando, setConsultando] = useState<Ocorrencia | null>(null)
  const [encerrando, setEncerrando] = useState<Ocorrencia | null>(null)
  const [processandoRecolha, setProcessandoRecolha] = useState(false)
  const [bloqueioParcela, setBloqueioParcela] = useState(false)
  const [erroRecolha, setErroRecolha] = useState<string | null>(null)

  const [filtroTipo, setFiltroTipo] = useState<TipoOcorrencia | 'TODAS'>('TODAS')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('ABERTAS')
  const [filtroUnidade, setFiltroUnidade] = useState('TODAS')
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
      setManutencoes(rp.manutencoes)
      setOcorrenciasRecolha(rp.ocorrenciasRecolha)
    } catch {
      setErro('Não foi possível carregar as recolhas e pendências.')
    } finally {
      setAgora(Date.now())
      setCarregado(true)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      setUsuario(lerUsuario())
      setUnidades(lerUnidades())
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

  async function assumir(o: Ocorrencia) {
    if (o.troca) { await bateria.assumir(o.id); return }
    // Manutenção e inadimplência: grava assumida_por na ocorrência
    const ocorrenciaId = o.manutencao?._id ?? o.recolha?.ocorrencia
    if (!ocorrenciaId) return
    // Sem nome o assumida_por fica vazio e a ocorrência continua NOVA
    if (!usuario.nome.trim()) {
      setErro('Seu usuário está sem nome cadastrado — não dá para assumir a ocorrência.')
      return
    }
    setEmAndamento(o.id)
    setErro(null)
    try {
      await chamarBubble('base-fechar-ocorrencia', { ocorrencia: ocorrenciaId, nome: usuario.nome, acao: 'assumir' })
      await carregar(true)
    } catch (err) {
      setErro(`Erro ao assumir a ocorrência: ${String(err)}`)
    } finally {
      setEmAndamento(null)
    }
  }

  function abrirEncerramento(o: Ocorrencia) {
    setBloqueioParcela(false)
    setErroRecolha(null)
    setEncerrando(o)
  }

  // Bateria e manutenção: confirmação simples (manutenção só fecha a ocorrência)
  async function confirmarEncerramento() {
    const o = encerrando
    setEncerrando(null)
    if (!o) return
    if (o.troca) { await bateria.finalizar(o.id); return }
    if (!o.manutencao) return
    setEmAndamento(o.id)
    setErro(null)
    try {
      await chamarBubble('base-fechar-ocorrencia', { ocorrencia: o.manutencao._id, nome: usuario.nome, acao: 'encerrar' })
      await carregar(true)
    } catch (err) {
      setErro(`Erro ao encerrar a ocorrência: ${String(err)}`)
    } finally {
      setEmAndamento(null)
    }
  }

  // Inadimplência: igual a Funções — confirma a recolha ou mantém com o cliente
  async function resolverRecolha(acao: 'RECOLHIDA' | 'PERMANECE') {
    const r = encerrando?.recolha
    if (!r?._id) return
    setProcessandoRecolha(true)
    setErroRecolha(null)
    setBloqueioParcela(false)
    try {
      const dados = { placa: r.placa, contrato: r.contrato, recolha: r._id, nome: usuario.nome }
      if (acao === 'RECOLHIDA') {
        await chamarBubble('base-confirmar-recolha', dados)
      } else {
        // Mesma regra do base-permanece-com-locatario: parcela vencida ou que
        // vence hoje bloqueia (senão o Bubble para em silêncio)
        const data = await chamarBubble('base-consulta-parcelas', { contrato: r.contrato })
        const parcelas: Parcela[] = data?.response?.parcelas ?? []
        if (parcelas.some(parcelaVencida)) {
          setBloqueioParcela(true)
          return
        }
        await chamarBubble('base-permanece-com-locatario', dados)
      }
      setEncerrando(null)
      await carregar(true)
    } catch (err) {
      setErroRecolha(`Erro ao processar: ${String(err)}`)
    } finally {
      setProcessandoRecolha(false)
    }
  }

  const acoes: Acoes = {
    bateria,
    usuario,
    emAndamento: emAndamento ?? bateria.acaoEmAndamento,
    assumir,
    encerrar: abrirEncerramento,
    consultar: setConsultando,
  }

  const ocorrencias = useMemo<Ocorrencia[]>(() => {
    const veiculoPorId = Object.fromEntries(veiculos.map((v) => [v._id, v]))
    const limiteEncerradas = agora - JANELA_ENCERRADAS_MS
    const lista: Ocorrencia[] = []

    for (const t of bateria.trocas) {
      const status = statusBateria(t)
      const fechada = t.finalizada_em ?? t['Modified Date']
      if (status === 'ENCERRADA' && new Date(fechada ?? 0).getTime() < limiteEncerradas) continue
      const v = t.placa ? veiculoPorId[t.placa] : undefined
      lista.push({
        id: t._id,
        tipo: 'BATERIA',
        status,
        placa: (t.placa && bateria.placas[t.placa]) || v?.placa || '—',
        veiculo: v,
        titulo: 'Troca de bateria',
        detalhe: [t.endereco, t.ponto_referencia && `Ref.: ${t.ponto_referencia}`, t.protocolo && `Prot. ${t.protocolo}`].filter(Boolean).join(' · '),
        data: t['Created Date'],
        responsavel: status !== 'NOVA' && t.responsavel ? (t.responsavel === usuario.userId ? 'Você' : 'Outro usuário') : undefined,
        dataResponsavel: status === 'ENCERRADA' ? fechada : t.assumida_em,
        mapa: t.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.endereco)}` : undefined,
        troca: t,
      })
    }

    // A API não filtra recolhas por unidade — só entram as motos da unidade ativa
    for (const r of recolhas) {
      const v = veiculoPorId[r.placa ?? '']
      const oc = ocorrenciasRecolha[r.ocorrencia ?? '']
      let status = statusRecolha(r)
      if (!v || !status) continue
      if (status === 'ENCERRADA' && (r['Modified Date'] ?? 0) < limiteEncerradas) continue
      if (status === 'NOVA' && oc?.assumida_por) status = 'ASSUMIDA'
      lista.push({
        id: r._id ?? `${r.placa}`,
        // A tabela de recolhas só recebe inadimplência (telas de clientes críticos)
        tipo: 'INADIMPLENCIA',
        status,
        placa: v.placa,
        veiculo: v,
        titulo: String(r.motivo ?? 'Recolha').trim(),
        data: r['Created Date'],
        responsavel: status === 'ENCERRADA' ? (oc?.finalizada_por || r.nome_responsavel)
          : status === 'ASSUMIDA' ? oc?.assumida_por : undefined,
        dataResponsavel: status === 'ENCERRADA' ? r['Modified Date'] : undefined,
        mapa: r.localiza_mapa,
        recolha: r,
      })
    }

    // FECHADA → ENCERRADA; com assumida_por → ASSUMIDA; senão NOVA
    for (const m of manutencoes) {
      const fechada = String(m.status ?? '').trim().toUpperCase() === 'FECHADA'
      const status: StatusOcorrencia = fechada ? 'ENCERRADA' : m.assumida_por ? 'ASSUMIDA' : 'NOVA'
      const dataFechada = m['ultimo tratamento'] ?? m['Modified Date']
      if (fechada && (dataFechada ?? 0) < limiteEncerradas) continue
      const v = veiculoPorId[m.veiculo ?? '']
      lista.push({
        id: m._id,
        tipo: 'MANUTENCAO',
        status,
        placa: v?.placa ?? '—',
        veiculo: v,
        titulo: String(m['descrição'] ?? 'Recolha para manutenção').trim(),
        detalhe: [m.numero_unico && `Ocorrência nº ${m.numero_unico}`, m['local da ocorrencia']].filter(Boolean).join(' · '),
        data: m['Created Date'],
        responsavel: status === 'ENCERRADA' ? m.finalizada_por : status === 'ASSUMIDA' ? m.assumida_por : undefined,
        dataResponsavel: fechada ? dataFechada : undefined,
        mapa: /^https?:\/\//.test(m['local da ocorrencia'] ?? '') ? m['local da ocorrencia'] : undefined,
        manutencao: m,
      })
    }

    for (const p of pendencias) {
      if (p.status !== 'ATIVO') continue
      const v = veiculoPorId[p.veiculo ?? '']
      lista.push({
        id: p._id ?? `${p.veiculo}-${p['descrição']}`,
        tipo: 'PENDENCIA',
        status: 'PENDENTE',
        placa: v?.placa ?? '—',
        veiculo: v,
        titulo: String(p['descrição'] ?? 'Pendência'),
        detalhe: p.tipo,
        data: p.data ?? p['Created Date'],
      })
    }

    return lista.filter((o) => podeVer(o, usuario))
  }, [bateria.trocas, bateria.placas, pendencias, recolhas, manutencoes, ocorrenciasRecolha, veiculos, usuario, agora])

  // Filtros de unidade e busca valem para os contadores; tipo e status, não
  const base = useMemo(() => {
    const termo = busca.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')
    return ocorrencias
      .filter((o) => filtroUnidade === 'TODAS' || o.veiculo?.Unidade === filtroUnidade)
      .filter((o) => !termo || [o.placa, o.titulo, o.detalhe, o.veiculo?.modelo, o.veiculo?.cor]
        .some((c) => String(c ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').includes(termo)))
  }, [ocorrencias, filtroUnidade, busca])

  const passaStatus = useCallback((o: Ocorrencia) => (
    filtroStatus === 'TODOS' ? true
      : filtroStatus === 'ABERTAS' ? o.status !== 'ENCERRADA'
      : o.status === filtroStatus
  ), [filtroStatus])

  const contagem = useMemo(() => {
    const c: Record<TipoOcorrencia | 'TODAS', number> = { TODAS: 0, BATERIA: 0, INADIMPLENCIA: 0, MANUTENCAO: 0, PENDENCIA: 0 }
    for (const o of base) {
      if (!passaStatus(o)) continue
      c.TODAS++
      c[o.tipo]++
    }
    return c
  }, [base, passaStatus])

  const filtradas = useMemo(() => base
    .filter((o) => filtroTipo === 'TODAS' || o.tipo === filtroTipo)
    .filter(passaStatus)
    .sort((a, b) => {
      const da = new Date(a.data ?? 0).getTime()
      const db = new Date(b.data ?? 0).getTime()
      return ordem === 'antigas' ? da - db : db - da
    }), [base, filtroTipo, passaStatus, ordem])

  const temFiltro = filtroTipo !== 'TODAS' || filtroStatus !== 'ABERTAS' || filtroUnidade !== 'TODAS' || busca.trim() !== ''
  const carregando = !carregado || !bateria.carregado

  function limparFiltros() {
    setFiltroTipo('TODAS')
    setFiltroStatus('ABERTAS')
    setFiltroUnidade('TODAS')
    setBusca('')
  }

  const seletor = 'px-3 py-2 text-sm rounded-xl border border-[#E2E4F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30'

  return (
    <>
      <PageHeader
        title="Ocorrências"
        description="Bateria, recolhas e pendências das motos da base"
        actions={
          <>
            <div className="bg-white rounded-xl px-3 py-1.5 text-center shadow-[0_2px_12px_rgba(99,102,241,0.08)]">
              <p className="text-muted-foreground text-xs">Na lista</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {(['TODAS', 'BATERIA', 'INADIMPLENCIA', 'MANUTENCAO', 'PENDENCIA'] as const).map((t) => {
            const ativo = filtroTipo === t
            const Icon = t === 'TODAS' ? List : TIPOS[t].icon
            return (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all border',
                  t === 'TODAS' && 'col-span-2 sm:col-span-1',
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
                    {t === 'TODAS' ? 'Todas' : TIPOS[t].plural}
                  </p>
                  <p className="text-xl font-extrabold leading-tight tabular-nums">{contagem[t]}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_2px_12px_rgba(99,102,241,0.08)] flex flex-col lg:flex-row gap-2 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar placa, motivo, modelo..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[#E2E4F0] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)} className={seletor}>
              <option value="ABERTAS">Em aberto</option>
              <option value="NOVA">Nova</option>
              <option value="ASSUMIDA">Assumida</option>
              <option value="ENCERRADA">Encerrada (30 dias)</option>
              <option value="PENDENTE">Pendente</option>
              <option value="TODOS">Todos os status</option>
            </select>
            {unidades.length > 1 && (
              <select value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)} className={seletor}>
                <option value="TODAS">Todas as unidades</option>
                {unidades.map((u) => <option key={u._id} value={u._id}>{u.nome}</option>)}
              </select>
            )}
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={seletor}>
              <option value="antigas">Mais antigas primeiro</option>
              <option value="recentes">Mais recentes primeiro</option>
            </select>
          </div>
          {/* Tabela só existe a partir do tablet — no celular é sempre card */}
          <div className="hidden md:flex rounded-xl border border-[#E2E4F0] p-0.5 shrink-0 self-start lg:self-auto">
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
          <span>{filtradas.length} ocorrência(s){temFiltro ? ' com os filtros aplicados' : ' em aberto'}</span>
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
              {filtradas.map((o) => <CardOcorrencia key={`${o.tipo}-${o.id}`} o={o} acoes={acoes} />)}
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
                              <T.icon className="w-3 h-3" /> {T.plural}
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
                            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', CORES_STATUS[o.status])}>
                              {o.status}
                            </span>
                            {o.responsavel && <p className="text-[11px] text-muted-foreground mt-1">{o.responsavel}</p>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p>{formatarData(o.data)}</p>
                            <p className="text-xs text-muted-foreground">{tempoDesde(o.data)}</p>
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <LinkMapa href={o.mapa} label="Local" />
                            <div><LinkMapa href={linkMapaVeiculo(o.veiculo)} label="Moto agora" /></div>
                          </td>
                          <td className="px-4 py-3">
                            <BotoesOcorrencia o={o} acoes={acoes} className="justify-end" />
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

      <DialogConsulta o={consultando} onFechar={() => setConsultando(null)} />

      {/* Encerrar: inadimplência pergunta como Funções; bateria/manutenção só confirmam */}
      <Dialog open={!!encerrando} onOpenChange={(aberto) => { if (!aberto && !processandoRecolha) setEncerrando(null) }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Encerrar ocorrência</DialogTitle>
          </DialogHeader>
          {encerrando?.recolha ? (
            <div className="space-y-3 text-sm">
              <p className="text-amber-800">
                A moto <b className="font-mono">{encerrando.placa}</b> tem uma recolha pendente
                {encerrando.recolha.motivo ? `: ${String(encerrando.recolha.motivo).trim()}` : '.'} Confirme se a moto foi
                recolhida ou se vai permanecer com o cliente.
              </p>

              {bloqueioParcela && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">Esse locatário tem parcelas vencidas e não pode permanecer com a moto.</p>
                </div>
              )}

              {erroRecolha && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 break-words">{erroRecolha}</div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={processandoRecolha}
                  onClick={() => resolverRecolha('RECOLHIDA')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                >
                  {processandoRecolha ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar recolha
                </button>
                <button
                  disabled={processandoRecolha}
                  onClick={() => resolverRecolha('PERMANECE')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-[#1B2043] border border-[#E2E4F0] bg-white hover:bg-[#F4F5FA] disabled:opacity-60"
                >
                  {processandoRecolha && <Loader2 className="w-4 h-4 animate-spin" />}
                  Manter com o cliente
                </button>
              </div>
            </div>
          ) : encerrando && (
            <div className="space-y-4 text-sm">
              <p>
                {encerrando.troca
                  ? <>Confirma que a troca de bateria da moto <b className="font-mono">{encerrando.placa}</b> foi concluída?</>
                  : encerrando.manutencao
                  ? <>Confirma o encerramento da recolha para manutenção da moto <b className="font-mono">{encerrando.placa}</b>? A ocorrência será fechada.</>
                  : <>Confirma que a moto <b className="font-mono">{encerrando.placa}</b> foi <b>recolhida</b>? Isso faz o mesmo que confirmar a recolha em Funções.</>}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEncerrando(null)} className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-[#1B2043] bg-[#EEF0F8] hover:bg-[#E2E4F0]">
                  Cancelar
                </button>
                <button onClick={confirmarEncerramento} className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700">
                  Encerrar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CardOcorrencia({ o, acoes }: { o: Ocorrencia; acoes: Acoes }) {
  const T = TIPOS[o.tipo]
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(99,102,241,0.08)] flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', T.badge)}>
          <T.icon className="w-3 h-3" /> {T.plural}
        </span>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CORES_STATUS[o.status])}>
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

      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 break-words">{o.titulo}</p>
        {o.detalhe && <p className="text-xs text-muted-foreground mt-0.5 break-words">{o.detalhe}</p>}
        {o.responsavel && (
          <p className="text-[11px] text-blue-700 mt-1">
            {o.status === 'ENCERRADA' ? 'Encerrada por' : 'Assumida por'} {o.responsavel}
            {o.dataResponsavel ? ` ${tempoDesde(o.dataResponsavel)}` : ''}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Aberta em {formatarData(o.data)}</span>
        <LinkMapa href={o.mapa} label="Local" />
        <LinkMapa href={linkMapaVeiculo(o.veiculo)} label="Moto agora" />
      </div>

      <BotoesOcorrencia o={o} acoes={acoes} className="mt-auto" />
    </div>
  )
}
