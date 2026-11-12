'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ShoppingCart, Wrench, Percent, Receipt, MoreHorizontal, Plus, Trash2, Check, ChevronLeft, ChevronRight,
  Send, Loader2, RefreshCw, Upload, X, FileText, Clock, AlertTriangle, Pencil, Ban, RotateCcw, ExternalLink,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'
import { podeSolicitarCompra } from '@/lib/permissoes'

// Réplica da tela solicitar-compra do Bubble. Grava pelos workflows
// base-solicitacao-compra-* e sobe os arquivos pelo /api/upload-foto.

// Versão do Bubble chamada (false = live)
const VERSAO_BUBBLE: boolean | string = '53lgt'
const INTERVALO_MS = 15_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, format: 'json', versionTest: VERSAO_BUBBLE }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

function userBubbleId(): string {
  try { return String(JSON.parse(localStorage.getItem('mc_user') ?? '{}')?.user ?? '') } catch { return '' }
}

// O próprio User-base (mc_user._id) — todos têm, mesmo sem User ligado
function userBaseId(): string {
  try { return String(JSON.parse(localStorage.getItem('mc_user') ?? '{}')?._id ?? '') } catch { return '' }
}

// ── Tipos ────────────────────────────────────────────────────────────────

type Unidade = { _id: string; 'Nome Unidade'?: string; Frota?: string[] }
type Frota = { _id: string; nome?: string; Unidades?: string[] }
type Solicitacao = {
  _id: string
  'Created Date'?: string
  descricao?: string
  itens?: string
  quantidade?: number
  valor_estimado?: number
  urgente?: boolean
  data_limite?: string
  vencimento_boleto?: string
  data_status?: string
  status?: string
  motivo_recusa?: string
  observacao?: string
  comprovante?: string
  anexos?: string[]
  fotos?: string[]
  tipo?: string
  unidade?: string
  unidade_nome?: string
  frota?: string
  frota_nome?: string
  da_unidade?: boolean
  onde_comprar?: string
  forma_pagamento?: string
  pix_chave?: string
  link_pagamento?: string
  decidido_por?: string
  reenvio_de?: string
  despesa_numero?: number
}

type Arquivo = { k: number; nome: string; url?: string; st: 'up' | 'ok' | 'er' }
type Item = { k: number; ds: string; q: string; v: string; lk: string }
type Form = {
  tp: string; ui: string; fi: string; du: boolean; oc: string
  it: Item[]; fp: string; px: string; lp: string; vb: string; dl: string; urg: boolean
  obs: string; arq: Arquivo[]; fot: Arquivo[]
}
type Erros = Record<string, string>

const TIPOS = [
  { v: 'Compra', s: 'Peça, ferramenta, material', ic: ShoppingCart },
  { v: 'Serviço', s: 'Mão de obra, conserto', ic: Wrench },
  { v: 'Comissão', s: 'Vendedor, indicação', ic: Percent },
  { v: 'Reembolso', s: 'Pago do próprio bolso', ic: Receipt },
  { v: 'Outro', s: 'O que não se encaixa', ic: MoreHorizontal },
]
const FORMAS = ['Pix', 'Boleto', 'Link de pagamento', 'Cartão', 'Outro']
const PASSOS = [
  { t: 'O que é', h: 'O que é este pedido?', d: 'Escolha o tipo e, se for o caso, a unidade e a frota. O resto do formulário se ajusta ao tipo.' },
  { t: 'Itens', h: 'Itens do pedido', d: 'Tudo do mesmo lugar de compra vai num pedido só. Se for de lugares diferentes, faça um pedido para cada lugar.' },
  { t: 'Pagamento e prazo', h: 'Como pagar e até quando', d: 'Quem paga é o financeiro. Diga como quem vai receber prefere receber.' },
  { t: 'Anexos e envio', h: 'Anexos e envio', d: 'Junte as fotos e o boleto ou a nota, confira tudo e envie.' },
]
const STATUS: Record<string, { n: string; cls: string }> = {
  p: { n: 'Pendente', cls: 'bg-amber-100 text-amber-800' },
  a: { n: 'Aprovado', cls: 'bg-blue-100 text-blue-800' },
  c: { n: 'Comprado', cls: 'bg-green-100 text-green-800' },
  g: { n: 'Pago', cls: 'bg-green-100 text-green-800' },
  r: { n: 'Recusado', cls: 'bg-red-100 text-red-700' },
  x: { n: 'Cancelado', cls: 'bg-slate-100 text-slate-600' },
}
const FILTROS: [string, string][] = [['p', 'Pendente'], ['a', 'Aprovado'], ['cg', 'Comprado ou pago'], ['r', 'Recusado'], ['x', 'Cancelado']]

function stK(s?: string): string {
  const t = String(s ?? '').toLowerCase()
  if (t.startsWith('pend')) return 'p'
  if (t.startsWith('aprov')) return 'a'
  if (t.startsWith('compr')) return 'c'
  if (t.startsWith('pag')) return 'g'
  if (t.startsWith('recus')) return 'r'
  if (t.startsWith('cancel')) return 'x'
  return 'p'
}

// Em serviço, comissão e reembolso quem recebe é uma pessoa, não uma loja
function recebePessoa(tp: string) { return tp === 'Serviço' || tp === 'Comissão' || tp === 'Reembolso' }

// ── Números e datas ──────────────────────────────────────────────────────

function numB(s: string): number {
  let t = String(s ?? '').trim()
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
function r2(n: number) { return Math.round((Number(n) || 0) * 100) / 100 }
function qN(x: Item) { return Math.max(0, Math.floor(numB(x.q))) }
function vN(x: Item) { return r2(numB(x.v)) }
function moeda(n: number) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function mascV(s: string) {
  const dg = s.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '')
  if (!dg) return ''
  const p = dg.padStart(3, '0')
  return p.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p.slice(-2)
}
function deNum(n?: number) { return n ? mascV(String(Math.round(n * 100))) : '' }

function isoDia(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function hojeIso() { return isoDia(new Date()) }
// 'aaaa-mm-dd' do input → data ao meio-dia (não muda de dia com o fuso)
function paraBubble(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).toISOString() : undefined
}
function deBubble(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : isoDia(d)
}
function fmtData(s?: string) {
  if (!s) return '-'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDataHora(s?: string) {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '-'
  const dia = isoDia(d) === hojeIso() ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${dia}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// ── Horário do financeiro ────────────────────────────────────────────────
// Pedido enviado até 13:00 de Brasília em dia útil é pago no mesmo dia.
// Feriados de quem paga (financeiro, em Itapetininga). ATUALIZE TODO ANO,
// aqui, na tela do Bubble e no Financeiro.

const FERIADOS: Record<string, string> = {
  '2026-11-20': 'Consciência Negra', '2026-12-25': 'Natal',
  '2027-01-01': 'Confraternização Universal', '2027-03-26': 'Sexta-feira Santa', '2027-04-21': 'Tiradentes', '2027-05-01': 'Dia do Trabalho',
  '2027-07-09': 'Revolução Constitucionalista (SP)', '2027-09-07': 'Independência', '2027-10-12': 'Nossa Senhora Aparecida',
  '2027-11-02': 'Finados', '2027-11-05': 'Aniversário de Itapetininga', '2027-11-15': 'Proclamação da República', '2027-11-20': 'Consciência Negra', '2027-12-25': 'Natal',
}
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const CORTE_MIN = 13 * 60

function agoraSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }
}
function maisDias(dia: string, n: number) {
  const [a, m, d] = dia.split('-').map(Number)
  return isoDia(new Date(a, m - 1, d + n, 12))
}
function diaSemana(dia: string) { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d, 12).getDay() }
function util(dia: string) { const w = diaSemana(dia); return w !== 0 && w !== 6 && !FERIADOS[dia] }
function proximoUtil(dia: string) { let d = maisDias(dia, 1); while (!util(d)) d = maisDias(d, 1); return d }
function ddmm(dia: string) { const [, m, d] = dia.split('-'); return `${d}/${m}` }

function avisoPagamento() {
  const sp = agoraSP()
  const antes = util(sp.dia) && sp.min < CORTE_MIN
  const pg = antes ? sp.dia : proximoUtil(sp.dia)
  const hoje = hojeIso()
  const quando = pg === hoje ? 'hoje' : pg === maisDias(hoje, 1) ? `amanhã, ${SEMANA[diaSemana(pg)]} ${ddmm(pg)}` : `${SEMANA[diaSemana(pg)]}, ${ddmm(pg)}`
  let l1: string
  let l2: string
  let perto = false
  if (antes) {
    const falta = CORTE_MIN - sp.min
    perto = falta <= 30
    l1 = perto ? `Faltam ${falta} min para o pedido ser pago hoje` : 'Enviando agora, o pagamento sai hoje'
    l2 = 'Pedidos enviados até 13:00 (Brasília) são pagos no mesmo dia.'
  } else {
    l1 = `Enviando agora, o pagamento sai ${quando}`
    if (FERIADOS[sp.dia]) l2 = `Hoje é feriado (${FERIADOS[sp.dia]}), sem pagamentos.`
    else if (!util(sp.dia)) l2 = 'Fim de semana não tem pagamento.'
    else l2 = 'Passou das 13:00 (Brasília), horário em que o financeiro fecha os pagamentos do dia.'
  }
  return { antes, perto, l1, l2, previsao: pg === hoje ? 'hoje' : `${SEMANA[diaSemana(pg)]}, ${ddmm(pg)}` }
}

// ── Validações ───────────────────────────────────────────────────────────

function linkOk(s: string) { return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(normLink(s)) }
function normLink(s: string) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : /^www\./i.test(t) ? 'https://' + t : t
}
function cpfOk(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === +c[9] && dv(10) === +c[10]
}
function cnpjOk(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += +c[i] * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r }
  return dv(12) === +c[12] && dv(13) === +c[13]
}
type Pix = { ok: true; k: string; c: string } | { ok: false; m: string }
function pixInfo(raw: string): Pix | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? { ok: true, k: 'E-mail', c: s.toLowerCase() } : { ok: false, m: 'Este e-mail parece incompleto. Confira com quem vai receber.' }
  const lo = s.toLowerCase()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lo)) return { ok: true, k: 'Chave aleatória', c: lo }
  if (/^[0-9a-f]{32}$/.test(lo) && /[a-f]/.test(lo)) return { ok: true, k: 'Chave aleatória', c: `${lo.slice(0, 8)}-${lo.slice(8, 12)}-${lo.slice(12, 16)}-${lo.slice(16, 20)}-${lo.slice(20)}` }
  const d = s.replace(/\D/g, '')
  if (/^\+/.test(s) || (/[()\s-]/.test(s) && d.length >= 10 && d.length <= 13 && !/[./]/.test(s))) {
    const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
    return n.length === 11 && n[2] === '9' ? { ok: true, k: 'Celular', c: '+55' + n } : { ok: false, m: 'O celular precisa ter DDD e 9 dígitos. Confira com quem vai receber.' }
  }
  if (d.length === 11 && /^[\d.\-\s]+$/.test(s)) {
    if (cpfOk(d)) return { ok: true, k: 'CPF', c: d }
    if (d[2] === '9') return { ok: true, k: 'Celular', c: '+55' + d }
    return { ok: false, m: 'Este CPF não confere: algum número está errado. Confira com quem vai receber.' }
  }
  if (d.length === 14 && /^[\d./\-\s]+$/.test(s)) return cnpjOk(d) ? { ok: true, k: 'CNPJ', c: d } : { ok: false, m: 'Este CNPJ não confere: algum número está errado. Confira com quem vai receber.' }
  return { ok: false, m: 'Não reconheci esta chave. Use CPF, CNPJ, e-mail, celular com DDD ou a chave aleatória.' }
}
function pixMostra(p: Pix | null) {
  if (!p || !p.ok) return ''
  if (p.k === 'CPF') return p.c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (p.k === 'CNPJ') return p.c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (p.k === 'Celular') return p.c.replace(/^\+55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  return p.c
}

let seq = 1
function novoItem(): Item { return { k: seq++, ds: '', q: '1', v: '', lk: '' } }
function novoForm(): Form {
  return { tp: 'Compra', ui: '', fi: '', du: false, oc: '', it: [novoItem()], fp: '', px: '', lp: '', vb: '', dl: '', urg: false, obs: '', arq: [], fot: [] }
}

function valida(F: Form, passo: number, editando: boolean, dl0: string): Erros {
  const e: Erros = {}
  if (passo === 1) {
    if (!F.tp) e.tp = 'Escolha o tipo.'
    if (F.ui && !F.du && !F.fi) e.fi = 'Escolha a frota ou marque que é da unidade.'
  }
  if (passo === 2) {
    if (!F.it.length) e.it = 'Adicione pelo menos um item.'
    F.it.forEach((x) => {
      if (x.ds.trim().length < 3) e['ds' + x.k] = 'Descreva o item.'
      if (qN(x) < 1) e['q' + x.k] = 'Mínimo 1.'
      if (!(vN(x) > 0)) e['v' + x.k] = 'Informe o valor.'
      if (x.lk.trim() && !linkOk(x.lk)) e['lk' + x.k] = 'Cole o link completo, começando com http.'
    })
  }
  if (passo === 3) {
    if (!F.fp) e.fp = 'Escolha como pagar.'
    if (F.fp === 'Pix' && F.px.trim()) { const p = pixInfo(F.px); if (p && !p.ok) e.px = p.m }
    if (F.fp === 'Boleto' && !F.vb) e.vb = 'Informe o vencimento do boleto.'
    if (F.fp === 'Link de pagamento') {
      if (!F.lp.trim()) e.lp = 'Cole o link de pagamento.'
      else if (!linkOk(F.lp)) e.lp = 'Cole o link completo, começando com http.'
    }
    if (F.dl && F.dl < hojeIso() && !(editando && F.dl === dl0)) e.dl = 'A data já passou.'
  }
  if (passo === 4) {
    if (F.fp === 'Boleto' && !F.arq.some((a) => a.url)) e.arq = 'Anexe o boleto (ou a nota) para o financeiro pagar.'
    if (F.arq.concat(F.fot).some((a) => a.st === 'up')) e.up = 'Aguarde o envio dos arquivos terminar.'
  }
  return e
}

function montaBody(F: Form, id: string | null, reenvio: string | null, usuario: string, usuarioBase: string) {
  const its = F.it.map((x) => {
    const o: Record<string, unknown> = { descricao: x.ds.trim().replace(/\s+/g, ' '), quantidade: qN(x), valor_unitario: vN(x) }
    const l = normLink(x.lk)
    if (l) o.link = l
    return o as { descricao: string; quantidade: number; valor_unitario: number; link?: string }
  })
  const total = r2(its.reduce((s, x) => s + x.quantidade * x.valor_unitario, 0))
  let ds: string, q: number, v: number, lk: string
  if (its.length === 1) {
    ds = its[0].descricao; q = its[0].quantidade; v = its[0].valor_unitario; lk = its[0].link ?? ''
  } else {
    ds = `${its.length} itens: ${its.map((x) => x.descricao).join(', ')}`
    if (ds.length > 120) ds = ds.slice(0, 119).replace(/[\s,]+$/, '') + '…'
    q = 1; v = total; lk = its.find((x) => x.link)?.link ?? ''
  }
  const p = F.fp === 'Pix' ? pixInfo(F.px) : null
  const body: Record<string, unknown> = {
    usuario_base: usuarioBase,
    tipo: F.tp,
    da_unidade: !!F.ui && F.du,
    onde_comprar: F.oc.trim(),
    itens: JSON.stringify(its),
    descricao: ds,
    link: lk,
    quantidade: q,
    valor_estimado: v,
    forma_pagamento: F.fp,
    pix_chave: p && p.ok ? p.c : '',
    link_pagamento: F.fp === 'Link de pagamento' ? normLink(F.lp) : '',
    urgente: F.urg,
    observacao: F.obs.trim(),
    anexos: F.arq.filter((a) => a.url).map((a) => a.url),
    fotos: F.fot.filter((a) => a.url).map((a) => a.url),
  }
  if (usuario) body.usuario = usuario
  if (F.ui) body.unidade = F.ui
  if (F.ui && !F.du && F.fi) body.frota = F.fi
  if (F.dl) body.data_limite = paraBubble(F.dl)
  if (F.fp === 'Boleto' && F.vb) body.vencimento_boleto = paraBubble(F.vb)
  if (id) body.id = id
  if (reenvio) body.reenvio_de = reenvio
  return body
}

function formDe(o: Solicitacao): Form {
  let its: Item[] = []
  try {
    const raw = JSON.parse(o.itens || '[]') as { descricao?: string; quantidade?: number; valor_unitario?: number; link?: string }[]
    its = raw.map((x) => ({ k: seq++, ds: x.descricao ?? '', q: String(x.quantidade ?? 1), v: deNum(x.valor_unitario), lk: x.link ?? '' }))
  } catch { /* itens antigos sem JSON */ }
  if (!its.length) its = [{ k: seq++, ds: o.descricao ?? '', q: String(o.quantidade ?? 1), v: deNum(o.valor_estimado), lk: '' }]
  const arq = (o.anexos ?? []).map((u) => ({ k: seq++, nome: nomeArquivo(u), url: u, st: 'ok' as const }))
  const fot = (o.fotos ?? []).map((u) => ({ k: seq++, nome: nomeArquivo(u), url: u, st: 'ok' as const }))
  return {
    tp: o.tipo || 'Compra', ui: o.unidade ?? '', fi: o.frota ?? '', du: !!o.da_unidade, oc: o.onde_comprar ?? '',
    it: its, fp: o.forma_pagamento ?? '', px: o.pix_chave ?? '', lp: o.link_pagamento ?? '',
    vb: deBubble(o.vencimento_boleto), dl: deBubble(o.data_limite), urg: !!o.urgente, obs: o.observacao ?? '', arq, fot,
  }
}

function urlArq(u?: string) { return !u ? '' : u.startsWith('//') ? 'https:' + u : u }
function nomeArquivo(u: string) { try { return decodeURIComponent(u.split('/').pop() ?? 'arquivo') } catch { return 'arquivo' } }

// ── Página ───────────────────────────────────────────────────────────────

const inputCls = 'w-full min-h-11 px-3 rounded-xl border border-[#C9CDE0] bg-white text-sm outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/15 disabled:bg-slate-100'
const errCls = '!border-red-500 ring-2 ring-red-500/10'

export default function SolicitarCompraPage() {
  const [aba, setAba] = useState<'nova' | 'lista'>('nova')
  const [passo, setPasso] = useState(1)
  const [F, setF] = useState<Form>(novoForm)
  const [erros, setErros] = useState<Erros>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [reenvio, setReenvio] = useState<string | null>(null)
  const [dl0, setDl0] = useState('')

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [frotas, setFrotas] = useState<Frota[]>([])
  const [lista, setLista] = useState<Solicitacao[] | null>(null)
  const [conferido, setConferido] = useState<number | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<{ urgente: boolean; previsao: string } | null>(null)
  const [toast, setToast] = useState<{ m: string; erro: boolean } | null>(null)
  const [filtro, setFiltro] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmaCancel, setConfirmaCancel] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [aviso, setAviso] = useState(avisoPagamento)
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((m: string, erro = false) => {
    setToast({ m, erro })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 4500)
  }, [])

  const carregar = useCallback(async (manual = false) => {
    const usuario = userBubbleId()
    if (!usuario) { setLista([]); setErroLista('Usuário não identificado. Entre de novo.'); return }
    if (manual) setAtualizando(true)
    try {
      const data = await chamarBubble('base-solicitacao-compra-listar', { usuario, unidade: getUnidadesAtivas() })
      const r = data?.response ?? {}
      setLista(r.solicitacoes ?? [])
      setUnidades(r.unidades ?? [])
      setFrotas(r.frotas ?? [])
      setConferido(Date.now())
      setErroLista(null)
    } catch {
      setErroLista('Não foi possível carregar as solicitações.')
      setLista((l) => l ?? [])
    } finally {
      if (manual) setAtualizando(false)
    }
  }, [])

  const [permitido, setPermitido] = useState<boolean | null>(null)

  useEffect(() => {
    const pode = podeSolicitarCompra()
    setPermitido(pode)
    if (!pode) return
    carregar()
    const t = setInterval(() => carregar(), INTERVALO_MS)
    const a = setInterval(() => setAviso(avisoPagamento()), 30_000)
    return () => { clearInterval(t); clearInterval(a) }
  }, [carregar])

  // Unidades: as do usuário (mc_unidades), na ordem do nome
  const opcoesUnidade = useMemo(() => {
    const ids = new Set(getUnidadesAtivas())
    let base: Unidade[] = []
    try { base = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]') } catch { /* vazio */ }
    const daApi = new Map(unidades.map((u) => [u._id, u]))
    return base.filter((u) => ids.has(u._id))
      .map((u) => ({ ...u, Frota: daApi.get(u._id)?.Frota ?? [] }))
      .sort((a, b) => String(a['Nome Unidade']).localeCompare(String(b['Nome Unidade'])))
  }, [unidades])

  const frotasDa = useCallback((ui: string) => {
    const u = opcoesUnidade.find((x) => x._id === ui)
    // A ligação está dos dois lados: Unidade's Frota e Frota's Unidades
    const ids = new Set(u?.Frota ?? [])
    return frotas.filter((f) => ids.has(f._id) || (f.Unidades ?? []).includes(ui)).sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
  }, [opcoesUnidade, frotas])

  // Uma unidade só: já vem escolhida, uma vez (a lista recarrega a cada 15s
  // e não pode desfazer o "Sem unidade" que a pessoa escolheu)
  const unidadeAuto = useRef(false)
  useEffect(() => {
    if (unidadeAuto.current || opcoesUnidade.length !== 1) return
    unidadeAuto.current = true
    if (!F.ui && !editando && !reenvio) escolherUnidade(opcoesUnidade[0]._id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoesUnidade])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setF((f) => ({ ...f, [k]: v }))
    setErros((e) => { if (!e[k as string]) return e; const n = { ...e }; delete n[k as string]; return n })
  }

  function escolherUnidade(ui: string) {
    setF((f) => ({ ...f, ui, fi: '', du: false }))
    setErros((e) => { const n = { ...e }; delete n.ui; delete n.fi; return n })
  }

  // Frota única já vem escolhida; sem frota, o gasto é da unidade.
  // Roda quando a unidade muda e quando a lista de frotas chega do Bubble.
  useEffect(() => {
    if (!F.ui || F.fi || F.du || editando || lista === null) return
    const fs = frotasDa(F.ui)
    if (fs.length === 1) setF((f) => ({ ...f, fi: fs[0]._id }))
    else if (fs.length === 0) setF((f) => ({ ...f, du: true }))
  }, [F.ui, F.fi, F.du, editando, lista, frotasDa])

  function setItem(k: number, campo: keyof Item, valor: string) {
    setF((f) => ({ ...f, it: f.it.map((x) => (x.k === k ? { ...x, [campo]: valor } : x)) }))
    const chave = (campo === 'ds' ? 'ds' : campo === 'q' ? 'q' : campo === 'v' ? 'v' : 'lk') + k
    setErros((e) => { if (!e[chave] && !e.it) return e; const n = { ...e }; delete n[chave]; delete n.it; return n })
  }

  const total = r2(F.it.reduce((s, x) => s + qN(x) * vN(x), 0))
  const sujo = (() => {
    const x = F.it[0]
    return F.tp !== 'Compra' || !!(F.oc || F.fp || F.px || F.lp || F.vb || F.dl || F.urg || F.obs || F.arq.length || F.fot.length || F.it.length > 1 || x?.ds || x?.v || x?.lk || (x && x.q !== '1'))
  })()

  function irPara(p: number) {
    if (p > passo) {
      for (let i = passo; i < p; i++) {
        const e = valida(F, i, !!editando, dl0)
        if (Object.keys(e).length) { setErros(e); setPasso(i); return }
      }
    }
    setErros({})
    setPasso(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function limpar() {
    setF(novoForm()); setErros({}); setPasso(1); setEditando(null); setReenvio(null); setDl0('')
    if (opcoesUnidade.length === 1) setTimeout(() => escolherUnidade(opcoesUnidade[0]._id), 0)
  }

  function editar(o: Solicitacao) {
    setF(formDe(o)); setErros({}); setPasso(1); setEditando(o._id); setReenvio(null); setDl0(deBubble(o.data_limite))
    setEnviado(null); setAba('nova'); window.scrollTo({ top: 0 })
  }
  function corrigir(o: Solicitacao) {
    setF(formDe(o)); setErros({}); setPasso(1); setEditando(null); setReenvio(o._id); setDl0('')
    setEnviado(null); setAba('nova'); window.scrollTo({ top: 0 })
  }

  async function subir(files: FileList | null, tipo: 'arq' | 'fot') {
    Array.from(files ?? []).forEach((f) => {
      if (tipo === 'fot' && !f.type.startsWith('image/')) { mostrar(`${f.name}: não é uma foto. Mande como boleto ou nota.`, true); return }
      if (f.size > 20 * 1024 * 1024) { mostrar(`${f.name}: arquivo maior que 20 MB.`, true); return }
      const a: Arquivo = { k: seq++, nome: f.name, st: 'up' }
      setF((x) => ({ ...x, [tipo]: [...x[tipo], a] }))
      setErros((e) => { const n = { ...e }; delete n.arq; delete n.up; return n })
      const form = new FormData()
      form.append('foto', f)
      fetch('/api/upload-foto', { method: 'POST', body: form })
        .then((r) => r.json())
        .then((d) => {
          if (!d?.url) throw new Error(d?.error ?? 'sem url')
          setF((x) => ({ ...x, [tipo]: x[tipo].map((y) => (y.k === a.k ? { ...y, url: d.url, st: 'ok' } : y)) }))
        })
        .catch(() => {
          setF((x) => ({ ...x, [tipo]: x[tipo].map((y) => (y.k === a.k ? { ...y, st: 'er' } : y)) }))
          mostrar(`Não consegui enviar ${f.name}.`, true)
        })
    })
  }
  function tirarArquivo(tipo: 'arq' | 'fot', k: number) { setF((x) => ({ ...x, [tipo]: x[tipo].filter((y) => y.k !== k) })) }

  async function enviar() {
    for (let i = 1; i <= 4; i++) {
      const e = valida(F, i, !!editando, dl0)
      if (Object.keys(e).length) { setErros(e); setPasso(i); mostrar(`Falta corrigir um ponto no passo ${i}.`, true); return }
    }
    const usuario = userBubbleId()
    const usuarioBase = userBaseId()
    if (!usuarioBase) { mostrar('Usuário não identificado. Entre de novo.', true); return }
    if (enviando) return
    // O Bubble só edita pedido Pendente e responde "success" mesmo quando não edita
    if (editando) {
      const atual = (lista ?? []).find((o) => o._id === editando)
      if (atual && stK(atual.status) !== 'p') {
        mostrar(`Este pedido já está ${STATUS[stK(atual.status)].n.toLowerCase()} e não pode mais ser editado.`, true)
        return
      }
    }
    setEnviando(true)
    try {
      const data = await chamarBubble('base-solicitacao-compra-salvar', montaBody(F, editando, reenvio, usuario, usuarioBase))
      if (data?.status !== 'success') throw new Error('sem confirmação')
      if (data?.response?.ok === false) {
        mostrar('Seu usuário não tem permissão para fazer solicitações de compra.', true)
        return
      }
      if (editando) {
        mostrar('Alterações salvas.')
        limpar(); setAba('lista')
      } else {
        setEnviado({ urgente: F.urg, previsao: aviso.previsao })
        limpar()
      }
      carregar()
      // A busca logo depois de gravar às vezes ainda vem sem o pedido novo
      setTimeout(() => carregar(), 1500)
      setTimeout(() => carregar(), 4000)
    } catch {
      mostrar('O Bubble não confirmou o envio. Confira em "Minhas solicitações" antes de tentar de novo.', true)
    } finally {
      setEnviando(false)
    }
  }

  async function cancelar(id: string) {
    const usuario = userBubbleId()
    setConfirmaCancel(null)
    setCancelando(id)
    try {
      const data = await chamarBubble('base-solicitacao-compra-cancelar', { usuario, id })
      if (data?.status !== 'success') throw new Error('sem confirmação')
      setLista((l) => (l ?? []).map((o) => (o._id === id ? { ...o, status: 'Cancelado', data_status: new Date().toISOString() } : o)))
      mostrar('Pedido cancelado.')
      setTimeout(() => carregar(), 1500)
    } catch {
      mostrar('O Bubble não confirmou o cancelamento. Confira a lista antes de tentar de novo.', true)
    } finally {
      setCancelando(null)
    }
  }

  const uploading = F.arq.concat(F.fot).some((a) => a.st === 'up')
  const unidadeNome = opcoesUnidade.find((u) => u._id === F.ui)?.['Nome Unidade'] ?? ''
  const frotaNome = F.du ? 'Da unidade' : frotas.find((f) => f._id === F.fi)?.nome ?? ''
  const pendentes = (lista ?? []).filter((o) => stK(o.status) === 'p').length
  const rotuloNova = editando ? 'Editar solicitação' : reenvio ? 'Corrigir pedido' : 'Nova solicitação'

  if (permitido === false) {
    return (
      <div className="min-h-full">
        <PageHeader title="Solicitar Compra" icon={<ShoppingCart className="w-5 h-5 text-white" />} />
        <div className="px-4 sm:px-8 py-6">
          <div className="rounded-2xl bg-white border border-dashed border-[#D5D8EA] py-16 px-4 text-center">
            <Ban className="w-10 h-10 mx-auto text-[#C5C8E4]" />
            <p className="mt-3 font-semibold">Seu usuário não tem permissão para fazer solicitações de compra.</p>
            <p className="text-sm text-muted-foreground mt-1">Se você deveria ter acesso, peça para liberarem e entre de novo no sistema.</p>
          </div>
        </div>
      </div>
    )
  }
  if (permitido === null) return null

  return (
    <div className="min-h-full">
      <PageHeader
        title="Solicitar Compra"
        description="Pedidos de compra e pagamento para o financeiro"
        icon={<ShoppingCart className="w-5 h-5 text-white" />}
      />

      <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-5 max-w-6xl">
        {/* Abas */}
        <div className="flex gap-1 p-1 bg-white border border-[#E2E4F0] rounded-xl w-full sm:w-fit">
          {([['nova', rotuloNova], ['lista', 'Minhas solicitações']] as const).map(([k, rot]) => (
            <button
              key={k}
              onClick={() => { setAba(k); setEnviado(null) }}
              className={`flex-1 sm:flex-none min-h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${aba === k ? 'bg-[#1B2043] text-white font-semibold' : 'hover:bg-slate-100'}`}
            >
              {rot}
              {k === 'lista' && lista && lista.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${aba === k ? 'bg-[#4FB648] text-[#1B2043]' : 'bg-slate-100'}`}>{pendentes || lista.length}</span>
              )}
            </button>
          ))}
        </div>

        {aba === 'nova' && enviado && (
          <div className="rounded-2xl bg-white border border-[#E2E4F0] p-6 sm:p-8 text-center space-y-3 animate-in fade-in duration-300">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#4FB648]/15 grid place-items-center"><Check className="w-7 h-7 text-[#2E7D2A]" /></div>
            <h2 className="text-xl font-bold">Solicitação enviada!</h2>
            <p className="text-sm text-muted-foreground">
              O financeiro já recebeu seu pedido{enviado.urgente && <>, marcado como <b>urgente</b></>}.
            </p>
            <p className="text-sm">Previsão de pagamento: <b>{enviado.previsao}</b></p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button onClick={() => setEnviado(null)} className="min-h-10 px-4 rounded-xl text-sm font-semibold bg-[#1B2043] text-white hover:bg-[#262B59]">Fazer outro pedido</button>
              <button onClick={() => { setEnviado(null); setAba('lista') }} className="min-h-10 px-4 rounded-xl text-sm font-medium border border-[#E2E4F0] bg-white hover:bg-slate-50">Ver minhas solicitações</button>
            </div>
          </div>
        )}

        {aba === 'nova' && !enviado && (
          <>
            {/* Aviso do horário */}
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${aviso.antes ? (aviso.perto ? 'bg-amber-50 border-amber-200' : 'bg-[#F1F9F0] border-[#CDE8C9]') : 'bg-blue-50 border-blue-200'}`} role="status">
              <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${aviso.antes ? (aviso.perto ? 'text-amber-700' : 'text-[#2E7D2A]') : 'text-blue-700'}`} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{aviso.l1}</p>
                <p className="text-muted-foreground">{aviso.l2} {F.urg && 'Urgente vai para o topo da fila do financeiro.'}</p>
              </div>
            </div>

            {(editando || reenvio) && (
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${editando ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {editando ? <Pencil className="w-4 h-4 shrink-0" /> : <RotateCcw className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{editando ? 'Você está editando um pedido pendente.' : 'Você está corrigindo um pedido recusado. Ele vai como um pedido novo.'}</span>
                <button onClick={limpar} className="font-semibold underline underline-offset-2 shrink-0">{editando ? 'Cancelar edição' : 'Cancelar correção'}</button>
              </div>
            )}

            {/* Passos */}
            <ol className="flex flex-wrap gap-2">
              {PASSOS.map((p, i) => {
                const n = i + 1
                const feito = n < passo
                const atual = n === passo
                return (
                  <li key={p.t}>
                    <button
                      onClick={() => irPara(n)}
                      className={`flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border text-sm transition-colors ${atual ? 'bg-[#1B2043] border-[#1B2043] text-white font-semibold' : feito ? 'bg-[#F1F9F0] border-[#CDE8C9] text-[#1F5A1C]' : 'bg-white border-[#E2E4F0] text-muted-foreground hover:border-[#B9C0D0]'}`}
                    >
                      <span className={`grid place-items-center w-6 h-6 rounded-full text-xs font-semibold ${atual || feito ? 'bg-[#4FB648] text-[#1B2043]' : 'bg-slate-100'}`}>
                        {feito ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
                      </span>
                      <span className="hidden sm:inline">{p.t}</span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="flex flex-col lg:flex-row gap-5 items-start">
              <section key={passo} className="flex-1 min-w-0 w-full rounded-2xl bg-white border border-[#E2E4F0] p-4 sm:p-7 space-y-6 animate-in fade-in slide-in-from-bottom-1 duration-300">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">{PASSOS[passo - 1].h}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{PASSOS[passo - 1].d}</p>
                </div>

                {passo === 1 && (
                  <>
                    <fieldset className="space-y-2.5">
                      <legend className="text-sm font-semibold mb-2.5">Tipo <span className="text-red-600">*</span></legend>
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5" role="radiogroup">
                        {TIPOS.map((t) => {
                          const on = F.tp === t.v
                          const Ic = t.ic
                          return (
                            <button
                              key={t.v}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => set('tp', t.v)}
                              className={`text-left flex flex-col gap-1.5 p-3.5 rounded-xl border transition-all hover:-translate-y-px ${on ? 'border-[#4FB648] bg-[#F1F9F0] ring-1 ring-[#4FB648]' : 'border-[#E2E4F0] bg-white hover:border-[#B9C0D0]'}`}
                            >
                              <span className="flex items-center justify-between">
                                <Ic className={`w-5 h-5 ${on ? 'text-[#2E7D2A]' : 'text-[#3B82F6]'}`} />
                                <span className={`w-4 h-4 rounded-full border-2 ${on ? 'border-[#4FB648] bg-[#4FB648] shadow-[inset_0_0_0_2px_white]' : 'border-[#C9CDE0]'}`} />
                              </span>
                              <b className="text-sm">{t.v}</b>
                              <span className="text-xs text-muted-foreground">{t.s}</span>
                            </button>
                          )
                        })}
                      </div>
                      {erros.tp && <p className="text-sm text-red-600 font-medium">{erros.tp}</p>}
                    </fieldset>

                    <div className="space-y-1.5 max-w-md">
                      <label htmlFor="sc-ui" className="text-sm font-semibold block">Unidade <span className="font-normal text-muted-foreground">(opcional)</span></label>
                      <select id="sc-ui" value={F.ui} onChange={(e) => escolherUnidade(e.target.value)} className={`${inputCls} ${erros.ui ? errCls : ''}`}>
                        <option value="">{opcoesUnidade.length ? 'Sem unidade' : 'Nenhuma unidade disponível'}</option>
                        {opcoesUnidade.map((u) => <option key={u._id} value={u._id}>{u['Nome Unidade']}</option>)}
                      </select>
                      {erros.ui && <p className="text-sm text-red-600 font-medium">{erros.ui}</p>}
                    </div>

                    <div className="space-y-2">
                      <span className="text-sm font-semibold block">Frota {F.ui && <span className="text-red-600">*</span>}</span>
                      {!F.ui ? (
                        <div className="rounded-xl border border-dashed border-[#D5D8EA] px-4 py-3 text-sm text-muted-foreground">Sem unidade, o pedido não fica ligado a uma frota. Para escolher a frota, escolha a unidade: a lista vem dela.</div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2" role="radiogroup">
                            {frotasDa(F.ui).map((f) => (
                              <Pill key={f._id} on={!F.du && F.fi === f._id} onClick={() => { setF((x) => ({ ...x, fi: f._id, du: false })); setErros((e) => { const n = { ...e }; delete n.fi; return n }) }}>{f.nome}</Pill>
                            ))}
                            <Pill on={F.du} onClick={() => { setF((x) => ({ ...x, du: true, fi: '' })); setErros((e) => { const n = { ...e }; delete n.fi; return n }) }}>É da unidade, não de uma moto</Pill>
                          </div>
                          <p className={`text-sm ${erros.fi ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {erros.fi ?? (lista === null ? 'Carregando as frotas…' : frotasDa(F.ui).length === 0
                              ? 'Esta unidade não tem frota cadastrada: o pedido fica como gasto da unidade.'
                              : frotasDa(F.ui).length === 1 ? 'Esta unidade tem uma frota só, e ela já vem escolhida.' : 'Escolha a frota da moto, ou marque que o gasto é da unidade.')}
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}

                {passo === 2 && (
                  <>
                    <div className="space-y-1.5 max-w-xl">
                      <label htmlFor="sc-oc" className="text-sm font-semibold block">
                        {recebePessoa(F.tp) ? 'Quem vai receber' : 'Onde comprar'} <span className="font-normal text-muted-foreground">(opcional)</span>
                      </label>
                      <input id="sc-oc" value={F.oc} onChange={(e) => set('oc', e.target.value)} className={inputCls} placeholder={recebePessoa(F.tp) ? 'Nome de quem vai receber' : 'Loja, site ou pessoa'} />
                      <p className="text-sm text-muted-foreground">{recebePessoa(F.tp) ? 'Nome da pessoa ou da empresa que vai receber o pagamento.' : 'Loja, site ou pessoa. Em serviço, comissão e reembolso, o campo vira "Quem vai receber".'}</p>
                    </div>

                    <div className="space-y-3">
                      {F.it.map((x, i) => (
                        <div key={x.k} className="rounded-xl border border-[#E2E4F0] bg-[#F8F9FC] p-3 sm:p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item {i + 1}</span>
                            {F.it.length > 1 && (
                              <button onClick={() => setF((f) => ({ ...f, it: f.it.filter((y) => y.k !== x.k) }))} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50" aria-label={`Tirar o item ${i + 1}`} title="Tirar o item">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            <label htmlFor={`sc-ds-${x.k}`} className="text-sm font-medium block">Descrição <span className="text-red-600">*</span></label>
                            <input id={`sc-ds-${x.k}`} value={x.ds} onChange={(e) => setItem(x.k, 'ds', e.target.value)} className={`${inputCls} ${erros['ds' + x.k] ? errCls : ''}`} placeholder="Ex.: Pastilha de freio dianteira CG 160" />
                            {erros['ds' + x.k] && <p className="text-sm text-red-600 font-medium">{erros['ds' + x.k]}</p>}
                          </div>
                          <div className="grid grid-cols-[90px_1fr_auto] sm:grid-cols-[110px_200px_1fr] gap-3 items-start">
                            <div className="space-y-1">
                              <label htmlFor={`sc-q-${x.k}`} className="text-sm font-medium block">Qtd.</label>
                              <input id={`sc-q-${x.k}`} inputMode="numeric" value={x.q} onChange={(e) => setItem(x.k, 'q', e.target.value.replace(/\D/g, ''))} className={`${inputCls} font-mono ${erros['q' + x.k] ? errCls : ''}`} />
                              {erros['q' + x.k] && <p className="text-xs text-red-600 font-medium">{erros['q' + x.k]}</p>}
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`sc-v-${x.k}`} className="text-sm font-medium block">Valor por unidade</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">R$</span>
                                <input id={`sc-v-${x.k}`} inputMode="decimal" value={x.v} onChange={(e) => setItem(x.k, 'v', mascV(e.target.value))} className={`${inputCls} pl-10 font-mono ${erros['v' + x.k] ? errCls : ''}`} placeholder="0,00" />
                              </div>
                              {erros['v' + x.k] && <p className="text-xs text-red-600 font-medium">{erros['v' + x.k]}</p>}
                            </div>
                            <div className="space-y-1 text-right sm:text-left self-end pb-2.5">
                              <span className="text-xs text-muted-foreground block">Total do item</span>
                              <b className="font-mono text-sm">{moeda(qN(x) * vN(x))}</b>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label htmlFor={`sc-lk-${x.k}`} className="text-sm font-medium block">Link do produto <span className="font-normal text-muted-foreground">(opcional)</span></label>
                            <input id={`sc-lk-${x.k}`} value={x.lk} onChange={(e) => setItem(x.k, 'lk', e.target.value)} className={`${inputCls} min-h-10 ${erros['lk' + x.k] ? errCls : ''}`} placeholder="Cole o link, se tiver" />
                            {erros['lk' + x.k] && <p className="text-xs text-red-600 font-medium">{erros['lk' + x.k]}</p>}
                          </div>
                        </div>
                      ))}
                      {erros.it && <p className="text-sm text-red-600 font-medium">{erros.it}</p>}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button onClick={() => setF((f) => ({ ...f, it: [...f.it, novoItem()] }))} className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl border border-dashed border-[#B9C0D0] text-sm font-medium hover:bg-slate-50">
                          <Plus className="w-4 h-4" /> Adicionar item
                        </button>
                        <div className="text-sm">
                          <span className="text-muted-foreground">{F.it.length} {F.it.length === 1 ? 'item' : 'itens'} · Total estimado </span>
                          <b className="font-mono text-base">{moeda(total)}</b>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {passo === 3 && (
                  <>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold mb-2.5">Como pagar <span className="text-red-600">*</span></legend>
                      <div className="flex flex-wrap gap-2" role="radiogroup">
                        {FORMAS.map((f) => <Pill key={f} on={F.fp === f} onClick={() => set('fp', f)}>{f}</Pill>)}
                      </div>
                      {erros.fp && <p className="text-sm text-red-600 font-medium">{erros.fp}</p>}
                    </fieldset>

                    {F.fp === 'Pix' && (() => {
                      const p = pixInfo(F.px)
                      return (
                        <div className="space-y-1.5 max-w-md">
                          <label htmlFor="sc-px" className="text-sm font-semibold block">Chave Pix de quem vai receber <span className="font-normal text-muted-foreground">(opcional)</span></label>
                          <input id="sc-px" value={F.px} onChange={(e) => set('px', e.target.value)} className={`${inputCls} font-mono ${erros.px ? errCls : ''}`} placeholder="CPF, CNPJ, e-mail, celular ou aleatória" />
                          {erros.px ? <p className="text-sm text-red-600 font-medium">{erros.px}</p>
                            : p?.ok ? <p className="text-sm text-[#2E7D2A]"><b>{p.k}</b> · {pixMostra(p)}</p>
                              : p && !p.ok ? <p className="text-sm text-amber-700">{p.m}</p> : null}
                        </div>
                      )
                    })()}

                    {F.fp === 'Boleto' && (
                      <div className="space-y-1.5 max-w-xs">
                        <label htmlFor="sc-vb" className="text-sm font-semibold block">Vencimento do boleto <span className="text-red-600">*</span></label>
                        <input id="sc-vb" type="date" value={F.vb} onChange={(e) => set('vb', e.target.value)} className={`${inputCls} font-mono ${erros.vb ? errCls : ''}`} />
                        <p className={`text-sm ${erros.vb ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{erros.vb ?? 'O arquivo do boleto você anexa no último passo.'}</p>
                      </div>
                    )}

                    {F.fp === 'Link de pagamento' && (
                      <div className="space-y-1.5 max-w-xl">
                        <label htmlFor="sc-lp" className="text-sm font-semibold block">Link de pagamento <span className="text-red-600">*</span></label>
                        <input id="sc-lp" value={F.lp} onChange={(e) => set('lp', e.target.value)} className={`${inputCls} ${erros.lp ? errCls : ''}`} placeholder="https://..." />
                        <p className={`text-sm ${erros.lp ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{erros.lp ?? 'Cole o link que quem vai receber mandou.'}</p>
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label htmlFor="sc-dl" className="text-sm font-semibold block">{F.tp === 'Compra' ? 'Comprar até' : 'Pagar até'} <span className="font-normal text-muted-foreground">(opcional)</span></label>
                        <input id="sc-dl" type="date" min={editando ? undefined : hojeIso()} value={F.dl} onChange={(e) => set('dl', e.target.value)} className={`${inputCls} font-mono ${erros.dl ? errCls : ''}`} />
                        <p className={`text-sm ${erros.dl ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{erros.dl ?? 'Deixe em branco se não houver prazo.'}</p>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-sm font-semibold block">Prioridade</span>
                        <div className="flex gap-2" role="radiogroup">
                          <Pill on={!F.urg} onClick={() => set('urg', false)}>Normal</Pill>
                          <Pill on={F.urg} onClick={() => set('urg', true)} perigo>Urgente</Pill>
                        </div>
                        <p className="text-sm text-muted-foreground">Urgente vai para o topo da fila do financeiro.</p>
                      </div>
                    </div>
                  </>
                )}

                {passo === 4 && (
                  <>
                    <ZonaArquivo
                      titulo="Fotos dos itens"
                      opcional
                      aceita="image/*"
                      dica="Pode mandar mais de uma. Ajuda o financeiro a conferir o que foi pedido."
                      arquivos={F.fot}
                      onArquivos={(fs) => subir(fs, 'fot')}
                      onTirar={(k) => tirarArquivo('fot', k)}
                    />
                    <ZonaArquivo
                      titulo="Boleto ou nota"
                      opcional={F.fp !== 'Boleto'}
                      dica={F.fp === 'Boleto' ? 'Com boleto, o arquivo é obrigatório: é por ele que o financeiro paga.' : 'Boleto, nota fiscal, orçamento ou print.'}
                      erro={erros.arq}
                      arquivos={F.arq}
                      onArquivos={(fs) => subir(fs, 'arq')}
                      onTirar={(k) => tirarArquivo('arq', k)}
                    />
                    {erros.up && <p className="text-sm text-red-600 font-medium">{erros.up}</p>}
                    <div className="space-y-1.5">
                      <label htmlFor="sc-obs" className="text-sm font-semibold block">Observação <span className="font-normal text-muted-foreground">(opcional)</span></label>
                      <textarea id="sc-obs" value={F.obs} onChange={(e) => set('obs', e.target.value)} className={`${inputCls} min-h-24 py-2.5 resize-y`} placeholder="Placa, setor, o que mais ajudar o financeiro" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confira antes de enviar</h3>
                      <dl className="rounded-xl border border-[#E2E4F0] divide-y divide-[#EEF0F4] text-sm">
                        <Conf k="Tipo" v={F.tp} onEditar={() => irPara(1)} />
                        <Conf k="Unidade e frota" v={[unidadeNome, frotaNome].filter(Boolean).join(' · ')} onEditar={() => irPara(1)} />
                        <Conf k={recebePessoa(F.tp) ? 'Quem vai receber' : 'Onde comprar'} v={F.oc} onEditar={() => irPara(2)} />
                        <Conf
                          k="Itens"
                          onEditar={() => irPara(2)}
                          v={
                            <div className="space-y-0.5">
                              {F.it.map((x) => (
                                <div key={x.k} className="flex justify-between gap-3"><span className="truncate">{qN(x)}× {x.ds || 'sem descrição'}</span><span className="font-mono shrink-0">{moeda(qN(x) * vN(x))}</span></div>
                              ))}
                              <div className="flex justify-between gap-3 pt-1 font-semibold"><span>Total estimado</span><span className="font-mono">{moeda(total)}</span></div>
                            </div>
                          }
                        />
                        <Conf
                          k="Como pagar"
                          onEditar={() => irPara(3)}
                          v={[F.fp, F.fp === 'Pix' && pixMostra(pixInfo(F.px)), F.fp === 'Boleto' && F.vb && `vence ${fmtData(paraBubble(F.vb))}`, F.fp === 'Link de pagamento' && normLink(F.lp)].filter(Boolean).join(' · ')}
                        />
                        <Conf
                          k="Prazo"
                          onEditar={() => irPara(3)}
                          v={<span>{F.dl ? fmtData(paraBubble(F.dl)) : 'sem prazo'} {F.urg && <span className="ml-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5">Urgente</span>}</span>}
                        />
                        <Conf k="Anexos" v={`${F.fot.filter((a) => a.url).length} foto(s) · ${F.arq.filter((a) => a.url).length} arquivo(s)`} onEditar={() => irPara(4)} />
                      </dl>
                    </div>
                  </>
                )}

                {/* Rodapé */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EEF0F4]">
                  {passo > 1 ? (
                    <button onClick={() => irPara(passo - 1)} className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-[#E2E4F0] bg-white text-sm font-medium hover:bg-slate-50">
                      <ChevronLeft className="w-4 h-4" /> Voltar
                    </button>
                  ) : sujo && !editando && !reenvio ? (
                    <button onClick={limpar} className="min-h-11 px-4 rounded-xl text-sm font-medium text-muted-foreground hover:bg-slate-100">Limpar formulário</button>
                  ) : null}
                  <span className="flex-1" />
                  <span className="text-xs text-muted-foreground hidden sm:inline">Passo {passo} de 4</span>
                  {passo < 4 ? (
                    <button onClick={() => irPara(passo + 1)} className="inline-flex items-center gap-1.5 min-h-11 px-5 rounded-xl bg-[#1B2043] text-white text-sm font-semibold hover:bg-[#262B59]">
                      Avançar <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={enviar} disabled={enviando || uploading} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl bg-[#4FB648] text-[#0F2A0D] text-sm font-bold hover:brightness-105 disabled:opacity-50">
                      {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {enviando ? (editando ? 'Salvando…' : 'Enviando…') : editando ? 'Salvar alterações' : 'Enviar para o financeiro'}
                    </button>
                  )}
                </div>
              </section>

              {/* Resumo */}
              <aside className="w-full lg:w-72 shrink-0 rounded-2xl bg-white border border-[#E2E4F0] p-5 space-y-3 lg:sticky lg:top-20">
                <h2 className="text-sm font-bold">Resumo do pedido</h2>
                <dl className="text-sm space-y-2">
                  <Resumo k="Tipo" v={F.tp} />
                  <Resumo k="Unidade" v={unidadeNome || 'sem unidade'} />
                  <Resumo k="Frota" v={frotaNome || '-'} />
                  <Resumo k="Itens" v={F.it.some((x) => x.ds) ? String(F.it.length) : 'nenhum ainda'} />
                  <Resumo k="Pagamento" v={F.fp || 'não informado'} />
                  <Resumo k="Prazo" v={F.dl ? fmtData(paraBubble(F.dl)) : 'sem prazo'} />
                </dl>
                <div className="flex items-baseline justify-between pt-3 border-t border-[#EEF0F4]">
                  <span className="text-sm text-muted-foreground">Total estimado</span>
                  <b className="font-mono text-lg">{moeda(total)}</b>
                </div>
                <p className="text-xs text-muted-foreground">Previsão de pagamento: <b className="text-foreground">{aviso.previsao}</b></p>
              </aside>
            </div>
          </>
        )}

        {aba === 'lista' && (
          <ListaSolicitacoes
            lista={lista}
            erro={erroLista}
            conferido={conferido}
            atualizando={atualizando}
            filtro={filtro}
            setFiltro={setFiltro}
            aberto={aberto}
            setAberto={setAberto}
            confirmaCancel={confirmaCancel}
            setConfirmaCancel={setConfirmaCancel}
            cancelando={cancelando}
            onAtualizar={() => carregar(true)}
            onEditar={editar}
            onCorrigir={corrigir}
            onCancelar={cancelar}
          />
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-32px)] px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${toast.erro ? 'bg-red-600 text-white' : 'bg-[#1B2043] text-white'}`} role="status">
          {toast.m}
        </div>
      )}
    </div>
  )
}

// ── Peças ────────────────────────────────────────────────────────────────

function Pill({ on, onClick, children, perigo }: { on: boolean; onClick: () => void; children: React.ReactNode; perigo?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex items-center gap-2 min-h-10 px-3.5 rounded-full border text-sm transition-colors ${on ? (perigo ? 'border-red-500 bg-red-50 text-red-700 font-semibold' : 'border-[#4FB648] bg-[#F1F9F0] text-[#1F5A1C] font-semibold') : 'border-[#E2E4F0] bg-white hover:border-[#B9C0D0]'}`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border-2 ${on ? (perigo ? 'border-red-500 bg-red-500' : 'border-[#4FB648] bg-[#4FB648]') + ' shadow-[inset_0_0_0_2px_white]' : 'border-[#C9CDE0]'}`} />
      {children}
    </button>
  )
}

function Conf({ k, v, onEditar }: { k: string; v: React.ReactNode; onEditar: () => void }) {
  const vazio = v === '' || v === null || v === undefined
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
      <dd className={`flex-1 min-w-0 break-words ${vazio ? 'text-muted-foreground italic' : ''}`}>{vazio ? 'Não informado' : v}</dd>
      <button onClick={onEditar} className="shrink-0 text-xs font-semibold text-[#3B82F6] hover:underline">Editar</button>
    </div>
  )
}

function Resumo({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right truncate">{v}</dd>
    </div>
  )
}

function ZonaArquivo({ titulo, opcional, aceita, dica, erro, arquivos, onArquivos, onTirar }: {
  titulo: string; opcional?: boolean; aceita?: string; dica: string; erro?: string
  arquivos: Arquivo[]; onArquivos: (f: FileList | null) => void; onTirar: (k: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold block">
        {titulo} {opcional ? <span className="font-normal text-muted-foreground">(opcional)</span> : <span className="text-red-600">*</span>}
      </span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); onArquivos(e.dataTransfer.files) }}
        className={`w-full flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${erro ? 'border-red-400 bg-red-50' : arrastando ? 'border-[#4FB648] bg-[#F1F9F0]' : 'border-[#D5D8EA] hover:border-[#B9C0D0] hover:bg-slate-50'}`}
      >
        <Upload className="w-6 h-6 text-[#3B82F6]" />
        <span className="text-sm font-medium">Clique para escolher ou arraste aqui</span>
        <small className={`text-xs ${erro ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{erro ?? dica}</small>
      </button>
      <input ref={ref} type="file" multiple accept={aceita} className="hidden" onChange={(e) => { onArquivos(e.target.files); e.target.value = '' }} />
      {arquivos.length > 0 && (
        <ul className="space-y-1.5">
          {arquivos.map((a) => (
            <li key={a.k} className="flex items-center gap-2.5 rounded-lg border border-[#E2E4F0] px-3 py-2 text-sm">
              {aceita?.startsWith('image') && a.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={urlArq(a.url)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="flex-1 min-w-0 truncate">{a.nome}</span>
              {a.st === 'up' && <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />}
              {a.st === 'ok' && <span className="text-xs font-semibold text-[#2E7D2A]">Enviado</span>}
              {a.st === 'er' && <span className="text-xs font-semibold text-red-600">Falhou</span>}
              <button onClick={() => onTirar(a.k)} className="p-1 rounded text-muted-foreground hover:text-red-600" aria-label={`Tirar ${a.nome}`}><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ListaSolicitacoes(p: {
  lista: Solicitacao[] | null; erro: string | null; conferido: number | null; atualizando: boolean
  filtro: string; setFiltro: (f: string) => void; aberto: string | null; setAberto: (id: string | null) => void
  confirmaCancel: string | null; setConfirmaCancel: (id: string | null) => void; cancelando: string | null
  onAtualizar: () => void; onEditar: (o: Solicitacao) => void; onCorrigir: (o: Solicitacao) => void; onCancelar: (id: string) => void
}) {
  const { lista, filtro } = p
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 5000); return () => clearInterval(t) }, [])

  if (lista === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
        <p className="text-sm">Carregando suas solicitações…</p>
      </div>
    )
  }

  const cnt: Record<string, number> = { p: 0, a: 0, cg: 0, r: 0, x: 0 }
  lista.forEach((o) => { const k = stK(o.status); cnt[k === 'c' || k === 'g' ? 'cg' : k]++ })
  const reenviados = new Map(lista.filter((o) => o.reenvio_de).map((o) => [o.reenvio_de as string, o]))
  const vis = lista.filter((o) => { if (!filtro) return true; const k = stK(o.status); return filtro === 'cg' ? k === 'c' || k === 'g' : k === filtro })
  const seg = p.conferido ? Math.max(0, Math.round((agora - p.conferido) / 1000)) : null
  const conf = seg === null ? 'Atualiza sozinho.' : `Atualiza sozinho. Conferido ${seg < 5 ? 'agora' : seg < 60 ? `há ${seg}s` : `há ${Math.round(seg / 60)} min`}.`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          <Chip on={!filtro} onClick={() => p.setFiltro('')}>Todas {lista.length}</Chip>
          {FILTROS.map(([k, n]) => cnt[k] ? <Chip key={k} on={filtro === k} onClick={() => p.setFiltro(k)}>{n} {cnt[k]}</Chip> : null)}
        </div>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#4FB648] animate-pulse" />{conf}</span>
        <button onClick={p.onAtualizar} disabled={p.atualizando} className="inline-flex items-center gap-2 min-h-9 px-3 rounded-xl text-sm font-medium bg-[#1B2043] text-white hover:bg-[#262B59] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${p.atualizando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {p.erro && <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">{p.erro}</div>}

      {lista.length === 0 ? (
        <div className="rounded-2xl bg-white border border-dashed border-[#D5D8EA] py-16 text-center">
          <ShoppingCart className="w-10 h-10 mx-auto text-[#C5C8E4]" />
          <p className="mt-3 font-semibold">Nenhuma solicitação ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Os pedidos que você enviar aparecem aqui.</p>
        </div>
      ) : vis.length === 0 ? (
        <div className="rounded-2xl bg-white border border-dashed border-[#D5D8EA] py-12 text-center font-semibold">Nada com esse status</div>
      ) : (
        <div className="space-y-2.5">
          {vis.map((o) => {
            const k = stK(o.status)
            const st = STATUS[k]
            const ab = p.aberto === o._id
            const nv = reenviados.get(o._id)
            const meta = [o.tipo, o.unidade_nome, o.da_unidade ? 'Da unidade' : o.frota_nome].filter(Boolean).join(' · ')
            return (
              <article key={o._id} className="rounded-2xl bg-white border border-[#E2E4F0] overflow-hidden">
                <button onClick={() => p.setAberto(ab ? null : o._id)} className="w-full text-left flex items-start gap-3 p-4 hover:bg-slate-50/60">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full text-xs font-semibold px-2.5 py-0.5 ${st.cls}`}>{st.n}</span>
                      {o.urgente && <span className="rounded-full bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5">URGENTE</span>}
                      <span className="text-xs text-muted-foreground">{fmtDataHora(o['Created Date'])}</span>
                    </div>
                    <p className="font-semibold truncate">{o.descricao || 'Pedido sem descrição'}</p>
                    <p className="text-xs text-muted-foreground truncate">{meta}{o.onde_comprar ? ` · ${o.onde_comprar}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <b className="font-mono">{o.valor_estimado ? moeda(o.valor_estimado * (o.quantidade || 1)) : 'sem valor'}</b>
                    {o.forma_pagamento && <p className="text-xs text-muted-foreground">{o.forma_pagamento}</p>}
                  </div>
                </button>

                {k === 'r' && (
                  <div className="mx-4 mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex flex-wrap items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1 min-w-0">Recusado: {o.motivo_recusa || 'sem motivo informado.'}</span>
                    {nv ? <span className="text-xs font-medium">Já corrigido e reenviado {fmtDataHora(nv['Created Date'])}</span>
                      : <button onClick={() => p.onCorrigir(o)} className="inline-flex items-center gap-1.5 min-h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"><RotateCcw className="w-3.5 h-3.5" /> Corrigir e reenviar</button>}
                  </div>
                )}

                {k === 'p' && (
                  <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                    {p.confirmaCancel === o._id ? (
                      <>
                        <span className="text-sm">Cancelar este pedido?</span>
                        <button onClick={() => p.onCancelar(o._id)} className="min-h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold">Sim, cancelar</button>
                        <button onClick={() => p.setConfirmaCancel(null)} className="min-h-8 px-3 rounded-lg border border-[#E2E4F0] text-xs font-medium">Não</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => p.onEditar(o)} className="inline-flex items-center gap-1.5 min-h-8 px-3 rounded-lg border border-[#E2E4F0] text-xs font-semibold hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                        <button onClick={() => p.setConfirmaCancel(o._id)} disabled={p.cancelando === o._id} className="inline-flex items-center gap-1.5 min-h-8 px-3 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-50">
                          {p.cancelando === o._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Cancelar
                        </button>
                      </>
                    )}
                  </div>
                )}

                {ab && <Detalhe o={o} />}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Detalhe({ o }: { o: Solicitacao }) {
  let its: { descricao?: string; quantidade?: number; valor_unitario?: number; link?: string }[] = []
  try { its = JSON.parse(o.itens || '[]') } catch { /* antigo */ }
  const linha = (k: string, v?: React.ReactNode) => (v ? <div className="flex gap-3"><dt className="w-36 shrink-0 text-muted-foreground">{k}</dt><dd className="flex-1 min-w-0 break-words">{v}</dd></div> : null)
  return (
    <div className="border-t border-[#EEF0F4] bg-[#F8F9FC] px-4 py-4 space-y-4 text-sm animate-in fade-in duration-200">
      {its.length > 0 && (
        <div className="space-y-1">
          {its.map((x, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{x.quantidade}× {x.descricao} {x.link && <a href={x.link} target="_blank" rel="noopener" className="text-[#3B82F6] inline-flex items-center gap-0.5">link <ExternalLink className="w-3 h-3" /></a>}</span>
              <span className="font-mono shrink-0">{moeda((x.quantidade ?? 0) * (x.valor_unitario ?? 0))}</span>
            </div>
          ))}
        </div>
      )}
      <dl className="space-y-1.5">
        {linha('Chave Pix', o.pix_chave)}
        {linha('Link de pagamento', o.link_pagamento && <a href={o.link_pagamento} target="_blank" rel="noopener" className="text-[#3B82F6] underline">Abrir link</a>)}
        {linha('Boleto vence', o.vencimento_boleto && fmtData(o.vencimento_boleto))}
        {linha(o.tipo === 'Compra' ? 'Comprar até' : 'Pagar até', o.data_limite && fmtData(o.data_limite))}
        {linha('Observação', o.observacao)}
        {linha('Último status', o.data_status && `${o.status} em ${fmtDataHora(o.data_status)}${o.decidido_por ? ` por ${o.decidido_por}` : ''}`)}
        {linha('Despesa', o.despesa_numero ? `nº ${o.despesa_numero}` : undefined)}
        {linha('Comprovante', o.comprovante && <a href={urlArq(o.comprovante)} target="_blank" rel="noopener" className="text-[#3B82F6] underline">Ver comprovante</a>)}
        {linha('Anexos', o.anexos?.length ? (
          <div className="flex flex-col gap-0.5">{o.anexos.map((u) => <a key={u} href={urlArq(u)} target="_blank" rel="noopener" className="text-[#3B82F6] underline truncate">{nomeArquivo(u)}</a>)}</div>
        ) : undefined)}
      </dl>
      {o.fotos && o.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {o.fotos.map((u) => (
            <a key={u} href={urlArq(u)} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlArq(u)} alt="Foto do item" className="w-20 h-20 rounded-lg object-cover border border-[#E2E4F0]" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`min-h-8 px-3 rounded-full border text-xs font-medium transition-colors ${on ? 'bg-[#1B2043] border-[#1B2043] text-white' : 'bg-white border-[#E2E4F0] hover:border-[#B9C0D0]'}`}>{children}</button>
  )
}
