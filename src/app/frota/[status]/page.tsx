'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bike, Layers, Clock, ClipboardList, Trophy, List as ListIcon, LayoutGrid, Building2, Fingerprint, Filter, ChevronDown, X, MapPin, FileText, Loader2, Video, Wrench, ClipboardCheck, AlertTriangle, Lock, CheckCircle2, Info, LogIn, LogOut, Gauge } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>, versionTest?: boolean): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, versionTest }),
  })
  return res.json()
}

type Contrato = {
  _id: string
  'Numero ctr'?: number
  status?: string
  'tipo de contrato'?: string
  inicio?: number
  fim?: number
  url_contrato?: string
  contrato_assinado?: string
  cliente?: string
  [key: string]: unknown
}

type Movimentacao = {
  _id: string
  'data de entrada'?: number
  'data de saida'?: number
  Fornecedor?: string
  observação?: string
  status?: string
  contrato_atrelado?: string
  'km inicial'?: number
  'km final'?: number
  [key: string]: unknown
}

type Vistoria = {
  _id: string
  data?: number
  tipo?: string
  vistoriador?: string
  vistoria_pdf?: string
  VIDEO?: string
  [key: string]: unknown
}

type ResumoMoto = {
  contrato: Contrato[]
  movimentacao: Movimentacao[]
  fornecedor: Locadora[]
  vistorias: Vistoria[]
}

function formatarData(ms: number | undefined): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleDateString('pt-BR')
}

function normalizar(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
}

// Cada status pede uma informação diferente no popup — oficina não interessa
// pra quem tá disponível, contrato não interessa pra quem tá em vistoria etc.
// Essa categoria decide o que mostrar e qual cor/ícone usar no popup.
type Categoria = 'oficina' | 'manutencao' | 'vistoria' | 'sinistro' | 'bloqueado' | 'locado' | 'disponivel' | 'inativo' | 'generico'

function categorizarStatus(status: string): Categoria {
  const s = normalizar(status)
  if (s.includes('OFICINA')) return 'oficina'
  if (s.includes('MANUTEN')) return 'manutencao'
  if (s.includes('VISTORIA')) return 'vistoria'
  if (s.includes('SINISTRO')) return 'sinistro'
  if (s.includes('BLOQUE') || s.includes('IRREGULAR')) return 'bloqueado'
  if (s.includes('LOCAD') || s.includes('ALUGAD')) return 'locado'
  if (s.includes('DISPON')) return 'disponivel'
  if (s.includes('INATIVO')) return 'inativo'
  return 'generico'
}

// Visual por categoria — mistura dos dois modais de referência (popup.txt):
// chip/ícone no formato "Ficha" (Ctrl+M) e banner em degradê no formato
// "Parcelas" (Ctrl+L), incluindo o estado "urgente" (alerta vermelho pulsante).
const CATEGORIA_VISUAL: Record<Categoria, {
  label: string
  chipBg: string; chipText: string
  iconBg: string; iconText: string
  bannerGrad: string
  urgente?: boolean
}> = {
  disponivel: { label: 'Disponível na base',                 chipBg: '#E2F4E5', chipText: '#137A45', iconBg: '#E2F4E5', iconText: '#137A45', bannerGrad: '#F3FBF5' },
  locado:     { label: 'Locada',                              chipBg: '#E7ECFB', chipText: '#2C4BC4', iconBg: '#EAF0FE', iconText: '#2C4BC4', bannerGrad: '#F4F8FF' },
  vistoria:   { label: 'Em vistoria',                         chipBg: '#E7ECFB', chipText: '#2C4BC4', iconBg: '#EAF0FE', iconText: '#2C4BC4', bannerGrad: '#F4F8FF' },
  oficina:    { label: 'Em manutenção — oficina de terceiros', chipBg: '#FFF4E2', chipText: '#9A6B12', iconBg: '#FFF4E2', iconText: '#9A6B12', bannerGrad: '#FFF9EF' },
  manutencao: { label: 'Em manutenção',                       chipBg: '#FFF4E2', chipText: '#9A6B12', iconBg: '#FFF4E2', iconText: '#9A6B12', bannerGrad: '#FFF9EF' },
  sinistro:   { label: 'Sinistro',                            chipBg: '#FDECEC', chipText: '#A32D2D', iconBg: '#FADCDC', iconText: '#A32D2D', bannerGrad: '#FFF1F1', urgente: true },
  bloqueado:  { label: 'Bloqueada / irregular',               chipBg: '#FDECEC', chipText: '#A32D2D', iconBg: '#FADCDC', iconText: '#A32D2D', bannerGrad: '#FFF1F1', urgente: true },
  inativo:    { label: 'Inativa',                             chipBg: '#F1F3F9', chipText: '#4A5265', iconBg: '#F1F3F9', iconText: '#4A5265', bannerGrad: '#F8F9FC' },
  generico:   { label: 'Situação atual',                      chipBg: '#F1F3F9', chipText: '#4A5265', iconBg: '#F1F3F9', iconText: '#4A5265', bannerGrad: '#F8F9FC' },
}

const ICONE_CATEGORIA: Record<Categoria, typeof Wrench> = {
  oficina: Wrench, manutencao: Wrench, vistoria: ClipboardCheck, sinistro: AlertTriangle,
  bloqueado: Lock, locado: FileText, disponivel: CheckCircle2, inativo: Info, generico: Info,
}

const MC_AZUL = '#091E7C'

type CampoInfo = { label: string; valor: string; mono?: boolean }

type Veiculo = {
  _id: string
  placa: string
  modelo: string
  cor: string
  chassi: string
  locadora: string
  Unidade?: string
  status_veiculo_desc: string
  status_veiculo_date?: number
  [key: string]: unknown
}

// status_veiculo_date vem em ms (timestamp Bubble) — quantos dias já se passaram
// desde que a moto entrou no status atual
function diasNoStatus(dataMs: number | undefined): number | null {
  if (dataMs == null) return null
  const dias = Math.floor((Date.now() - dataMs) / (1000 * 60 * 60 * 24))
  return dias >= 0 ? dias : null
}

// Quanto mais tempo parada no status, mais quente a cor — chama atenção
// pra quem está há mais tempo sem resolver
function corDias(dias: number): { badge: string; glow: string; forte: string } {
  if (dias <= 3)  return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', glow: 'rgba(16,185,129,0.28)', forte: 'rgba(16,185,129,0.85)' }
  if (dias <= 7)  return { badge: 'bg-amber-50 text-amber-700 border-amber-200',       glow: 'rgba(245,158,11,0.28)', forte: 'rgba(245,158,11,0.85)' }
  if (dias <= 15) return { badge: 'bg-orange-50 text-orange-700 border-orange-200',    glow: 'rgba(249,115,22,0.3)',  forte: 'rgba(249,115,22,0.85)' }
  return             { badge: 'bg-red-50 text-red-700 border-red-200',            glow: 'rgba(239,68,68,0.32)',  forte: 'rgba(239,68,68,0.85)' }
}

type Locadora = {
  _id: string
  Nome?: string
  nome?: string
  Name?: string
  'nome social'?: string
}

function contarPor(veiculos: Veiculo[], campo: keyof Veiculo) {
  const mapa: Record<string, number> = {}
  for (const v of veiculos) {
    const val = String(v[campo] ?? '-')
    mapa[val] = (mapa[val] ?? 0) + 1
  }
  return Object.entries(mapa).sort((a, b) => b[1] - a[1])
}

// Cartão com borda em degradê azul-marinho e leve efeito de vidro — usado nas
// estatísticas e no painel da lista, com animação de entrada em cascata
function GlassPanel({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div
      className="rounded-2xl p-[1px]"
      style={{
        background: 'linear-gradient(135deg, rgba(27,32,67,0.22), rgba(108,99,255,0.08) 45%, transparent 75%)',
        animation: `cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      }}
    >
      <div className={`bg-white/80 backdrop-blur-md rounded-2xl border border-[#1B2043]/8 shadow-[0_8px_28px_rgba(27,32,67,0.08)] ${className}`}>
        {children}
      </div>
    </div>
  )
}

function StatCard({ icon, iconBg, iconColor, label, value, sub, delay }: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: React.ReactNode
  sub?: string
  delay: number
}) {
  return (
    <GlassPanel delay={delay} className="p-4 h-full">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-[#1B2043]/50 uppercase tracking-wide truncate font-medium">{label}</p>
          <p className="text-xl font-bold text-[#1B2043] leading-tight truncate">{value}</p>
          {sub && <p className="text-xs text-black truncate">{sub}</p>}
        </div>
      </div>
    </GlassPanel>
  )
}

type Modo = 'tabela' | 'cards'

export default function FrotaStatusPage() {
  const { status } = useParams<{ status: string }>()
  const statusNome = decodeURIComponent(status)
  const router = useRouter()
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [locadoraMap, setLocadoraMap] = useState<Record<string, string>>({})
  const [unidadeMap, setUnidadeMap] = useState<Record<string, string>>({})
  const [modo, setModo] = useState<Modo>('tabela')

  // Popup de resumo da moto
  const [motoSelecionada, setMotoSelecionada] = useState<Veiculo | null>(null)
  const [popupAberto, setPopupAberto] = useState(false)
  const [resumo, setResumo] = useState<ResumoMoto | null>(null)
  const [resumoCarregando, setResumoCarregando] = useState(false)
  const [itemCopiado, setItemCopiado] = useState<string | null>(null)
  const [abaPopup, setAbaPopup] = useState('geral')
  // Nome do status de cada movimentação (id -> descrição) — vem do mesmo
  // endpoint que a tela de Funções usa (status-de-movimentação)
  const [statusMovMap, setStatusMovMap] = useState<Record<string, string>>({})

  async function abrirResumo(v: Veiculo) {
    setMotoSelecionada(v)
    setPopupAberto(true)
    setResumo(null)
    setStatusMovMap({})
    setAbaPopup('geral')
    setResumoCarregando(true)
    try {
      const [resumoData, statusData] = await Promise.all([
        chamarBubble('resumo-moto-base', { moto: v._id }),
        chamarBubble('status-de-movimentação', { placa: v.placa }).catch(() => null),
      ])
      setResumo(resumoData?.response ?? null)
      const statusmoviRaw: { _id?: string; descrição?: string; descricao?: string }[] = statusData?.response?.statusmovi ?? []
      setStatusMovMap(Object.fromEntries(
        statusmoviRaw.filter((s) => s._id).map((s) => [s._id as string, s.descrição ?? s.descricao ?? '-'])
      ))
    } catch {
      setResumo(null)
    } finally {
      setResumoCarregando(false)
    }
  }

  // Filtros
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [fPlaca, setFPlaca] = useState('')
  const [fLocadora, setFLocadora] = useState('')
  const [fUnidade, setFUnidade] = useState('')
  const [fDiasMin, setFDiasMin] = useState('')
  const [fDiasMax, setFDiasMax] = useState('')

  useEffect(() => {
    try {
      const todos: Veiculo[] = JSON.parse(localStorage.getItem('mc_veiculos') ?? '[]')
      const filtrados = todos.filter((v) => v.status_veiculo_desc === statusNome)
      setVeiculos(filtrados)

      // Nome das unidades — vem do que já está salvo no login (mc_unidades),
      // sem precisar de outra chamada só pra isso
      try {
        const unidades = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]') as { _id: string; 'Nome Unidade': string }[]
        setUnidadeMap(Object.fromEntries(unidades.map((u) => [u._id, u['Nome Unidade']])))
      } catch {}

      const ids = [...new Set(filtrados.map((v) => v.locadora).filter(Boolean))]
      if (ids.length === 0) return

      // Pedir tudo de uma vez pode fazer o workflow devolver só parte das
      // locadoras (limite do Bubble) — busca em lotes pra garantir que todas venham
      const TAMANHO_LOTE = 50
      const lotes: string[][] = []
      for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
        lotes.push(ids.slice(i, i + TAMANHO_LOTE))
      }

      lotes.forEach((lote) => {
        chamarBubble('chamar-locadoras', { locadoras: JSON.stringify(lote) })
          .then((data) => {
            const lista: Locadora[] = data?.response?.locadoras ?? []
            const map: Record<string, string> = {}
            for (const l of lista) {
              map[l._id] = l.Nome ?? l.nome ?? l.Name ?? '-'
            }
            setLocadoraMap((prev) => ({ ...prev, ...map }))
          })
          .catch(() => {})
      })
    } catch {
      setVeiculos([])
    }
  }, [statusNome])

  // Opções dos selects — só as locadoras/unidades que realmente aparecem nessa lista
  const locadorasDisponiveis = [...new Set(veiculos.map((v) => locadoraMap[v.locadora]).filter(Boolean))].sort()
  const unidadesDisponiveis = [...new Set(veiculos.map((v) => unidadeMap[v.Unidade ?? '']).filter(Boolean))].sort()
  const filtrosAtivos = [fPlaca, fLocadora, fUnidade, fDiasMin, fDiasMax].filter(Boolean).length

  const veiculosFiltrados = veiculos.filter((v) => {
    if (fPlaca && !v.placa?.toLowerCase().includes(fPlaca.toLowerCase())) return false
    if (fLocadora && !(locadoraMap[v.locadora] ?? '').toLowerCase().includes(fLocadora.toLowerCase())) return false
    if (fUnidade && unidadeMap[v.Unidade ?? ''] !== fUnidade) return false
    const dias = diasNoStatus(v.status_veiculo_date)
    if (fDiasMin && (dias == null || dias < Number(fDiasMin))) return false
    if (fDiasMax && (dias == null || dias > Number(fDiasMax))) return false
    return true
  })

  const porModelo = contarPor(veiculosFiltrados, 'modelo')
  const diasValidos = veiculosFiltrados.map((v) => diasNoStatus(v.status_veiculo_date)).filter((d): d is number => d != null)
  const mediaDias = diasValidos.length > 0 ? Math.round(diasValidos.reduce((a, b) => a + b, 0) / diasValidos.length) : null

  // Movimentação aberta (sem data de saída) = onde a moto está agora — é dali
  // que vem a informação dinâmica por status (ex: qual oficina, se aplicável)
  const movimentacaoAtual = resumo?.movimentacao.find((m) => !m['data de saida'])
  const fornecedorAtual = movimentacaoAtual?.Fornecedor
    ? resumo?.fornecedor.find((f) => f._id === movimentacaoAtual.Fornecedor)
    : undefined
  const fornecedorAtualNome = fornecedorAtual
    ? fornecedorAtual['nome social'] ?? fornecedorAtual.Nome ?? fornecedorAtual.nome ?? fornecedorAtual.Name
    : undefined
  const contratoRecente = resumo?.contrato
    ? [...resumo.contrato].sort((a, b) => (b['Numero ctr'] ?? 0) - (a['Numero ctr'] ?? 0))[0]
    : undefined
  const vistoriasRecentes = resumo?.vistorias
    ? [...resumo.vistorias].sort((a, b) => (b.data ?? 0) - (a.data ?? 0)).slice(0, 20)
    : []
  const vistoriaRecente = vistoriasRecentes[0]

  const categoria = categorizarStatus(statusNome)
  const corCat = CATEGORIA_VISUAL[categoria]
  const IconeCat = ICONE_CATEGORIA[categoria]
  const diasStatus = motoSelecionada ? diasNoStatus(motoSelecionada.status_veiculo_date) : null

  // Campos da seção "Identificação"
  const camposIdentificacao: CampoInfo[] = motoSelecionada
    ? [
        { label: 'Chassi', valor: motoSelecionada.chassi ?? '-', mono: true },
        { label: 'Locadora', valor: locadoraMap[motoSelecionada.locadora] ?? '-' },
      ]
    : []

  // Banner "Situação atual" — texto principal/secundário muda conforme a categoria
  let bannerLinha1 = '-'
  let bannerLinha2: string | undefined
  let bannerDireita: { label: string; valor: string } | undefined
  if (categoria === 'oficina' || categoria === 'manutencao') {
    bannerLinha1 = fornecedorAtualNome ?? 'Oficina não informada'
    bannerLinha2 = movimentacaoAtual?.observação
    bannerDireita = { label: 'Desde', valor: formatarData(movimentacaoAtual?.['data de entrada']) }
  } else if (categoria === 'vistoria') {
    bannerLinha1 = vistoriaRecente ? `${vistoriaRecente.tipo ?? 'Vistoria'} · ${vistoriaRecente.vistoriador ?? '-'}` : 'Nenhuma vistoria registrada'
    bannerLinha2 = vistoriaRecente?.canal ? String(vistoriaRecente.canal) : undefined
    if (vistoriaRecente) bannerDireita = { label: 'Data', valor: formatarData(vistoriaRecente.data) }
  } else if (categoria === 'sinistro' || categoria === 'bloqueado') {
    bannerLinha1 = fornecedorAtualNome ?? 'Prestador não informado'
    bannerLinha2 = movimentacaoAtual?.observação
    bannerDireita = { label: 'Desde', valor: formatarData(movimentacaoAtual?.['data de entrada']) }
  } else if (categoria === 'locado') {
    bannerLinha1 = contratoRecente ? `Contrato Nº ${contratoRecente['Numero ctr'] ?? '-'} · ${contratoRecente['tipo de contrato'] ?? '-'}` : 'Contrato não encontrado'
    bannerLinha2 = typeof contratoRecente?.cliente === 'string' ? `Cliente: ${contratoRecente.cliente}` : undefined
    if (contratoRecente) bannerDireita = { label: 'Até', valor: formatarData(contratoRecente.fim) }
  } else if (categoria === 'disponivel') {
    bannerLinha1 = 'Disponível na base'
    bannerDireita = { label: 'Desde', valor: formatarData(movimentacaoAtual?.['data de entrada']) }
  } else {
    bannerLinha1 = movimentacaoAtual?.observação ?? 'Sem movimentação em aberto registrada'
    if (movimentacaoAtual) bannerDireita = { label: 'Desde', valor: formatarData(movimentacaoAtual['data de entrada']) }
  }

  const linkContrato = contratoRecente?.contrato_assinado || contratoRecente?.url_contrato
  const hrefContrato = linkContrato
    ? (String(linkContrato).startsWith('http') ? String(linkContrato) : `https:${linkContrato}`)
    : null

  function nomeFornecedorPorId(id: string | undefined): string | undefined {
    if (!id) return undefined
    const f = resumo?.fornecedor.find((x) => x._id === id)
    return f ? (f['nome social'] ?? f.Nome ?? f.nome ?? f.Name) : undefined
  }

  function numeroContratoPorId(id: string | undefined): number | undefined {
    if (!id) return undefined
    return resumo?.contrato.find((c) => c._id === id)?.['Numero ctr']
  }

  // Histórico de movimentação — timeline com as passagens mais recentes da moto
  // (troca de oficina, retorno pra base, saída pra contrato etc.)
  const movimentacoesOrdenadas = resumo
    ? [...resumo.movimentacao].sort((a, b) => (b['data de entrada'] ?? 0) - (a['data de entrada'] ?? 0))
    : []
  const movimentacoesRecentes = movimentacoesOrdenadas.slice(0, 20)

  // "Geral" mostra sempre o contrato mais recente, mudando só o rótulo
  const camposContratoGeral: CampoInfo[] = contratoRecente
    ? [
        { label: categoria === 'locado' ? 'Contrato ativo' : 'Último contrato', valor: `Nº ${contratoRecente['Numero ctr'] ?? '-'}` },
        { label: 'Tipo', valor: String(contratoRecente['tipo de contrato'] ?? '-') },
        { label: 'Status', valor: String(contratoRecente.status ?? '-') },
        { label: 'Período', valor: `${formatarData(contratoRecente.inicio)} até ${formatarData(contratoRecente.fim)}` },
      ]
    : []

  function copiarValor(valor: string, chave: string) {
    if (!valor || valor === '-') return
    navigator.clipboard?.writeText(valor).then(() => {
      setItemCopiado(chave)
      setTimeout(() => setItemCopiado((k) => (k === chave ? null : k)), 1200)
    }).catch(() => {})
  }

  // Grid de campos label/valor — mesmo padrão visual do modal de referência
  // (linhas finas entre células, clique em cima copia o valor)
  function renderCampoGrid(secao: string, campos: CampoInfo[]) {
    if (campos.length === 0) return null
    return (
      <div>
        <span className="block mt-4 mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9AA0AE]">{secao}</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#E7E9F0] border border-[#E7E9F0] rounded-xl overflow-hidden">
          {campos.map((campo, i) => {
            const chave = `${secao}-${i}`
            return (
              <div
                key={chave}
                onClick={() => copiarValor(campo.valor, chave)}
                className="relative bg-white px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#FAFBFF] active:bg-[#F1F4FF]"
              >
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#9AA0AE] mb-0.5">{campo.label}</span>
                <span className={`block text-sm font-medium text-[#12141A] break-words leading-snug ${campo.mono ? 'font-mono tracking-wide' : ''}`}>
                  {campo.valor}
                </span>
                {itemCopiado === chave && (
                  <span className="absolute top-2.5 right-3.5 text-[9px] font-bold uppercase tracking-wide text-[#137A45]">copiado</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={statusNome}
        description={`${veiculos.length} moto${veiculos.length !== 1 ? 's' : ''}`}
        icon={<Bike className="w-5 h-5 text-white" />}
        actions={
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-white via-[#F4F5FB] to-white">
        <div className="p-4 sm:p-6 space-y-6 max-w-screen-xl mx-auto">

          {/* Estatísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              delay={0}
              icon={<Bike className="w-5 h-5" />}
              iconBg="bg-[#1B2043]/10"
              iconColor="text-[#1B2043]"
              label="Total"
              value={veiculosFiltrados.length}
            />
            <StatCard
              delay={60}
              icon={<Clock className="w-5 h-5" />}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
              label="Média de dias"
              value={mediaDias ?? '-'}
            />
            <StatCard
              delay={120}
              icon={<Layers className="w-5 h-5" />}
              iconBg="bg-sky-100"
              iconColor="text-sky-600"
              label="Modelos"
              value={porModelo.length}
            />
            <StatCard
              delay={180}
              icon={<Trophy className="w-5 h-5" />}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Mais comum"
              value={porModelo[0]?.[0] ?? '-'}
              sub={`${porModelo[0]?.[1] ?? 0} unidades`}
            />
          </div>

          {/* Lista de motos */}
          <GlassPanel delay={240} className="overflow-hidden">
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-white/70" />
              <span className="text-sm font-semibold text-white">Motos</span>
              <span className="ml-2 text-xs font-medium text-white/70 bg-white/15 rounded-full px-2.5 py-0.5">
                {veiculosFiltrados.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setFiltrosAbertos((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtrosAbertos ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70 hover:text-white/90'}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtros
                  {filtrosAtivos > 0 && (
                    <span className="bg-white text-[#1B2043] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {filtrosAtivos}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtrosAbertos ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
                  <button
                    onClick={() => setModo('tabela')}
                    className={`p-1.5 rounded-md transition-colors ${modo === 'tabela' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                    title="Ver como tabela"
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setModo('cards')}
                    className={`p-1.5 rounded-md transition-colors ${modo === 'cards' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                    title="Ver como cards"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {filtrosAbertos && (
              <div className="px-5 py-4 bg-[#1B2043]/[0.03] border-b border-[#1B2043]/8">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black">Placa</label>
                    <div className="relative">
                      <input
                        value={fPlaca}
                        onChange={(e) => setFPlaca(e.target.value.toUpperCase())}
                        placeholder="Buscar..."
                        className="w-full px-3 py-2 text-sm font-mono uppercase border rounded-md bg-white pr-7"
                      />
                      {fPlaca && (
                        <button onClick={() => setFPlaca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Locadora
                    </label>
                    <div className="relative">
                      <input
                        value={fLocadora}
                        onChange={(e) => setFLocadora(e.target.value)}
                        placeholder="Buscar..."
                        list="locadoras-lista"
                        className="w-full px-3 py-2 text-sm border rounded-md bg-white pr-7"
                      />
                      <datalist id="locadoras-lista">
                        {locadorasDisponiveis.map((l) => (
                          <option key={l} value={l} />
                        ))}
                      </datalist>
                      {fLocadora && (
                        <button onClick={() => setFLocadora('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Unidade
                    </label>
                    <select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} className="w-full px-2 py-2 text-sm border rounded-md bg-white">
                      <option value="">Todas</option>
                      {unidadesDisponiveis.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1 lg:col-span-2">
                    <label className="text-xs font-medium text-black">Dias no status</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={fDiasMin}
                        onChange={(e) => setFDiasMin(e.target.value)}
                        placeholder="De"
                        className="w-full px-2 py-2 text-sm border rounded-md bg-white"
                      />
                      <span className="text-xs text-black/40 shrink-0">até</span>
                      <input
                        type="number"
                        min="0"
                        value={fDiasMax}
                        onChange={(e) => setFDiasMax(e.target.value)}
                        placeholder="Até"
                        className="w-full px-2 py-2 text-sm border rounded-md bg-white"
                      />
                    </div>
                  </div>
                </div>
                {filtrosAtivos > 0 && (
                  <button
                    onClick={() => { setFPlaca(''); setFLocadora(''); setFUnidade(''); setFDiasMin(''); setFDiasMax('') }}
                    className="mt-3 flex items-center gap-1 text-xs text-black/60 hover:text-black transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Limpar filtros
                  </button>
                )}
              </div>
            )}

            <div className={modo === 'tabela' ? '' : 'p-4'}>
              {modo === 'tabela' ? (
                <div className="divide-y divide-[#1B2043]/6">
                  <div className="hidden md:grid grid-cols-[7rem_10rem_1fr_8rem_5rem] px-5 py-2.5 bg-[#1B2043]/[0.04] text-[11px] font-semibold text-[#1B2043]/60 uppercase tracking-wide gap-3">
                    <span>Placa</span>
                    <span>Chassi</span>
                    <span>Locadora</span>
                    <span>Modelo</span>
                    <span className="text-right">Dias</span>
                  </div>
                  {veiculosFiltrados.map((v, i) => {
                    const dias = diasNoStatus(v.status_veiculo_date)
                    const cor = dias != null ? corDias(dias) : null
                    return (
                      <div
                        key={v.placa}
                        onClick={() => abrirResumo(v)}
                        className="relative grid grid-cols-[1fr_4.5rem] md:grid-cols-[7rem_10rem_1fr_8rem_5rem] items-center px-5 py-3.5 gap-3 hover:bg-[#1B2043]/[0.03] transition-colors cursor-pointer"
                        style={{ animation: `cardEnter 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 25, 350)}ms both` }}
                      >
                        <span className="font-mono text-sm font-semibold text-black w-fit sm:justify-self-start bg-[#1B2043]/6 px-2 py-1 rounded-md">{v.placa}</span>
                        <p className="hidden md:block text-xs text-black font-mono">{v.chassi ?? '-'}</p>
                        <p className="hidden md:block text-xs text-black truncate">{locadoraMap[v.locadora] ?? '-'}</p>
                        <p className="hidden md:block text-sm text-black truncate">{v.modelo}</p>
                        <div className="flex justify-end">
                          {dias != null && cor ? (
                            <span
                              className={`text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full border ${cor.badge}`}
                              style={{ boxShadow: `0 0 10px ${cor.glow}` }}
                            >
                              {dias}d
                            </span>
                          ) : (
                            <span className="text-sm text-black">-</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {veiculosFiltrados.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#1B2043]/8 flex items-center justify-center">
                        <Bike className="w-6 h-6 text-[#1B2043]/40" />
                      </div>
                      <p className="text-sm text-black">Nenhuma moto encontrada.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {veiculosFiltrados.map((v, i) => {
                    const dias = diasNoStatus(v.status_veiculo_date)
                    const cor = dias != null ? corDias(dias) : null
                    // Borda em degradê via background-clip (dois fundos: um sólido por trás do
                    // conteúdo, outro em degradê só na borda) — não depende de altura em %
                    // dentro da grade, então não falha conforme o tamanho do conteúdo do card
                    const gradienteBorda = cor
                      ? `linear-gradient(135deg, ${cor.forte}, rgba(27,32,67,0.12) 55%, transparent 85%)`
                      : 'linear-gradient(135deg, rgba(27,32,67,0.18), transparent 70%)'
                    return (
                      <div
                        key={v.placa}
                        onClick={() => abrirResumo(v)}
                        className="group relative rounded-2xl p-4 border border-transparent transition-shadow duration-200 hover:shadow-[0_10px_30px_rgba(27,32,67,0.12)] cursor-pointer"
                        style={{
                          backgroundImage: `linear-gradient(white, white), ${gradienteBorda}`,
                          backgroundOrigin: 'border-box',
                          backgroundClip: 'padding-box, border-box',
                          animation: `cardEnter 0.45s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 30, 400)}ms both`,
                        }}
                      >
                        {/* Selo de dias no canto — grande, com brilho */}
                        {dias != null && cor && (
                          <div
                            className={`absolute -top-2 -right-2 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 bg-white ${cor.badge}`}
                            style={{ boxShadow: `0 0 16px ${cor.glow}` }}
                          >
                            <span className="text-base font-extrabold leading-none tabular-nums">{dias}</span>
                            <span className="text-[9px] font-semibold uppercase tracking-wide leading-none mt-0.5">dias</span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 pr-10">
                          <div className="w-11 h-11 rounded-xl bg-[#1B2043]/8 flex items-center justify-center shrink-0">
                            <Bike className="w-5 h-5 text-[#1B2043]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-black tracking-wide">{v.placa}</p>
                            <p className="text-sm font-semibold text-[#1B2043] truncate">{v.modelo}</p>
                          </div>
                        </div>

                        <div className="mt-3.5 pt-3.5 border-t border-[#1B2043]/8 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-black">
                            <Fingerprint className="w-3.5 h-3.5 text-[#1B2043]/40 shrink-0" />
                            <span className="font-mono truncate">{v.chassi ?? '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-black">
                            <Building2 className="w-3.5 h-3.5 text-[#1B2043]/40 shrink-0" />
                            <span className="truncate">{locadoraMap[v.locadora] ?? '-'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {veiculosFiltrados.length === 0 && (
                    <div className="col-span-full flex flex-col items-center gap-2 px-4 py-14 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#1B2043]/8 flex items-center justify-center">
                        <Bike className="w-6 h-6 text-[#1B2043]/40" />
                      </div>
                      <p className="text-sm text-black">Nenhuma moto encontrada.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>

      <Dialog open={popupAberto} onOpenChange={setPopupAberto}>
        <DialogContent className="popup-ficha-veiculo sm:max-w-2xl p-0 gap-0 rounded-[18px]" showCloseButton={false}>
          {/* Wrapper só pra arredondar os cantos (clipping) — sem limitar altura,
              quem controla o scroll é o DialogContent (overflow-y-auto nativo) */}
          <div className="rounded-[18px] overflow-hidden">
          {/* Header no estilo "Ficha" (Ctrl+M): placa mercosul + eyebrow + chip de status */}
          <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 border-b border-[#E9EBF2]">
            <div className="relative w-[76px] sm:w-[100px] shrink-0 rounded-md border-2 overflow-hidden bg-white text-center" style={{ borderColor: '#12141A' }}>
              <div className="h-3 sm:h-3.5 flex items-center justify-between px-1.5" style={{ background: MC_AZUL }}>
                <span className="text-white font-sans" style={{ fontSize: 6, fontWeight: 700, letterSpacing: '.08em' }}>BRASIL</span>
                <span className="text-white font-sans" style={{ fontSize: 6, fontWeight: 700 }}>BR</span>
              </div>
              <div className="py-1 sm:py-1.5 font-mono font-bold uppercase text-[#12141A] text-xs sm:text-[15px]" style={{ letterSpacing: 1.5 }}>
                {motoSelecionada?.placa}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#8792AE]">Informações do veículo</p>
              <p className="text-[15px] sm:text-[18px] font-semibold text-[#12141A] truncate leading-tight">{motoSelecionada?.modelo}</p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <span
                  className="text-[9.5px] sm:text-[10.5px] font-bold uppercase tracking-wide px-2 sm:px-2.5 py-1 rounded-full"
                  style={{ background: corCat.chipBg, color: corCat.chipText }}
                >
                  {motoSelecionada?.status_veiculo_desc}
                </span>
              </div>
            </div>

            <DialogClose className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#4A5265] bg-[#F1F3F9] hover:bg-[#E4E8F1] transition-colors">
              <X className="w-4 h-4" />
            </DialogClose>
          </div>

          {/* KPIs no estilo "Parcelas" (Ctrl+L) */}
          {resumo && (
            <div className="grid grid-cols-3 gap-px bg-[#E9EBF2] border-b border-[#E9EBF2]">
              <div className="flex items-center gap-2.5 bg-white px-3 sm:px-3.5 py-2.5 sm:py-3">
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-[#F1F3F9]">
                  <Clock className="w-4 h-4 text-[#4A5265]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#9AA1B5]">Dias no status</p>
                  <p className="text-sm font-semibold text-[#12141A]">{diasStatus != null ? `${diasStatus}d` : '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-white px-3 sm:px-3.5 py-2.5 sm:py-3">
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-[#EAF0FE]">
                  <FileText className="w-4 h-4 text-[#2C4BC4]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#9AA1B5]">Contratos</p>
                  <p className="text-sm font-semibold text-[#12141A]">{resumo.contrato.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-white px-3 sm:px-3.5 py-2.5 sm:py-3">
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-[#E2F4E5]">
                  <ClipboardCheck className="w-4 h-4 text-[#137A45]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#9AA1B5]">Vistorias</p>
                  <p className="text-sm font-semibold text-[#12141A]">{resumo.vistorias.length}</p>
                </div>
              </div>
            </div>
          )}

          {resumoCarregando ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-[#9AA1B5]">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando resumo...
            </div>
          ) : !resumo ? (
            <div className="py-16 text-center text-sm text-[#9AA1B5]">Não foi possível carregar o resumo dessa moto.</div>
          ) : (
            <>
              {/* Banner "Situação atual" no estilo "Parcelas" — vira alerta pulsante quando urgente */}
              <div
                className="flex items-center gap-3 sm:gap-3.5 px-4 sm:px-5 py-3 sm:py-3.5"
                style={{ background: corCat.bannerGrad, borderLeft: corCat.urgente ? '4px solid #D14343' : undefined }}
              >
                <span className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${corCat.urgente ? 'animate-pulse' : ''}`} style={{ background: corCat.iconBg }}>
                  <IconeCat className="w-4.5 h-4.5 sm:w-5 sm:h-5" style={{ color: corCat.iconText }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: corCat.urgente ? '#A32D2D' : '#8792AE' }}>{corCat.label}</p>
                  <p className="text-[14px] sm:text-[15px] font-semibold text-[#12141A] truncate">{bannerLinha1}</p>
                  {bannerLinha2 && <p className="text-xs text-[#697086] truncate">{bannerLinha2}</p>}
                </div>
                {bannerDireita && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-[#9AA1B5]">{bannerDireita.label}</p>
                    <p className="text-[12px] sm:text-[13px] font-semibold text-[#12141A]">{bannerDireita.valor}</p>
                  </div>
                )}
              </div>

              {/* Abas — organiza o resto da informação em Geral / Histórico / Vistorias */}
              <Tabs value={abaPopup} onValueChange={(v) => setAbaPopup(String(v))}>
                <TabsList className="w-full grid grid-cols-3 gap-1 rounded-none px-2 sm:px-5 pt-3 pb-0 bg-white">
                  <TabsTrigger value="geral" className="px-1 text-[11px] sm:text-sm text-[#697086] data-active:bg-[#EAF0FE] data-active:text-[#2C4BC4] hover:bg-[#F1F3F9] hover:text-[#12141A]">Geral</TabsTrigger>
                  <TabsTrigger value="historico" className="px-1 text-[11px] sm:text-sm text-[#697086] data-active:bg-[#EAF0FE] data-active:text-[#2C4BC4] hover:bg-[#F1F3F9] hover:text-[#12141A]">
                    <span className="truncate">Histórico{movimentacoesOrdenadas.length > 0 ? ` (${movimentacoesOrdenadas.length})` : ''}</span>
                  </TabsTrigger>
                  <TabsTrigger value="vistorias" className="px-1 text-[11px] sm:text-sm text-[#697086] data-active:bg-[#EAF0FE] data-active:text-[#2C4BC4] hover:bg-[#F1F3F9] hover:text-[#12141A]">
                    <span className="truncate">Vistorias{vistoriasRecentes.length > 0 ? ` (${vistoriasRecentes.length})` : ''}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="geral" className="px-4 sm:px-5 py-4">
                  {renderCampoGrid('Identificação', camposIdentificacao)}
                  {renderCampoGrid(categoria === 'locado' ? 'Contrato' : 'Último contrato', camposContratoGeral)}
                  {camposContratoGeral.length === 0 && camposIdentificacao.length === 0 && (
                    <p className="text-sm text-[#9AA1B5] text-center py-6">Sem dados adicionais.</p>
                  )}
                </TabsContent>

                <TabsContent value="historico" className="px-4 sm:px-5 py-4">
                  {movimentacoesRecentes.length === 0 ? (
                    <p className="text-sm text-[#9AA1B5] text-center py-6">Nenhuma movimentação registrada.</p>
                  ) : (
                    movimentacoesRecentes.map((m) => {
                      const nomeForn = nomeFornecedorPorId(m.Fornecedor)
                      const aberta = !m['data de saida']
                      const statusNomeM = m.status ? statusMovMap[m.status] : undefined
                      const numContrato = numeroContratoPorId(m.contrato_atrelado)
                      return (
                        <div
                          key={m._id}
                          className="border border-[#E9EBF2] rounded-xl overflow-hidden mb-2 transition-all hover:border-[#C9D2E8] hover:shadow-[0_4px_14px_rgba(9,30,124,0.07)]"
                        >
                          {/* Status + situação */}
                          <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[#F8F9FC] border-b border-[#E9EBF2]">
                            {statusNomeM ? (
                              <span className="text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#EAF0FE] text-[#2C4BC4]">{statusNomeM}</span>
                            ) : (
                              <span className="text-[10.5px] font-medium text-[#9AA1B5]">Sem status</span>
                            )}
                            {aberta && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-[#137A45]">em andamento</span>
                            )}
                          </div>

                          {/* Entrada / Saída */}
                          <div className="grid grid-cols-2 divide-x divide-[#E9EBF2]">
                            <div className="flex flex-col gap-1 px-3.5 py-2.5">
                              <span className="flex items-center gap-1 text-[10.5px] font-semibold text-[#137A45]">
                                <LogIn className="w-3.5 h-3.5" /> Entrada
                              </span>
                              <span className="text-xs font-mono text-[#12141A]">{formatarData(m['data de entrada'])}</span>
                            </div>
                            <div className="flex flex-col gap-1 px-3.5 py-2.5">
                              <span className="flex items-center gap-1 text-[10.5px] font-semibold text-[#A32D2D]">
                                <LogOut className="w-3.5 h-3.5" /> Saída
                              </span>
                              <span className="text-xs font-mono text-[#12141A]">{aberta ? '—' : formatarData(m['data de saida'])}</span>
                            </div>
                          </div>

                          {/* KM inicial / final */}
                          {(m['km inicial'] != null || m['km final'] != null) && (
                            <div className="grid grid-cols-2 divide-x divide-[#E9EBF2] border-t border-[#E9EBF2]">
                              <div className="flex items-center gap-1.5 px-3.5 py-2 text-xs">
                                <Gauge className="w-3.5 h-3.5 text-[#9AA1B5]" />
                                <span className="text-[#9AA1B5]">KM inicial</span>
                                <span className="font-medium text-[#12141A] ml-auto">{m['km inicial'] ?? '-'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 px-3.5 py-2 text-xs">
                                <Gauge className="w-3.5 h-3.5 text-[#9AA1B5]" />
                                <span className="text-[#9AA1B5]">KM final</span>
                                <span className="font-medium text-[#12141A] ml-auto">{m['km final'] ?? '-'}</span>
                              </div>
                            </div>
                          )}

                          {/* Fornecedor / observação */}
                          {(nomeForn || m.observação) && (
                            <div className="px-3.5 py-2 border-t border-[#E9EBF2] bg-[#F8F9FC]/60">
                              {nomeForn && <p className="text-xs font-semibold text-[#12141A]">{nomeForn}</p>}
                              {m.observação && <p className="text-[11px] text-[#697086]">{m.observação}</p>}
                            </div>
                          )}

                          {/* Contrato */}
                          {numContrato != null && (
                            <div className="flex items-center gap-2 px-3.5 py-2 border-t border-[#E9EBF2]">
                              <span className="text-[11px] text-[#9AA1B5]">Contrato</span>
                              <span className="text-xs font-mono font-semibold text-[#12141A]">Nº {numContrato}</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </TabsContent>

                <TabsContent value="vistorias" className="px-4 sm:px-5 py-4">
                  {vistoriasRecentes.length === 0 ? (
                    <p className="text-sm text-[#9AA1B5] text-center py-6">Nenhuma vistoria registrada.</p>
                  ) : (
                    vistoriasRecentes.map((vi) => (
                      <div
                        key={vi._id}
                        className="flex flex-wrap items-center gap-3 px-3 sm:px-3.5 py-2.5 border border-[#E9EBF2] rounded-xl mb-1.5 transition-all hover:border-[#C9D2E8] hover:shadow-[0_4px_14px_rgba(9,30,124,0.07)] hover:-translate-y-px"
                      >
                        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-[#EAF0FE]">
                          <ClipboardCheck className="w-4 h-4 text-[#2C4BC4]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-[#12141A] truncate">{vi.tipo ?? '-'}</p>
                          <p className="text-[11px] text-[#9AA1B5] truncate">{vi.vistoriador ?? '-'}</p>
                        </div>
                        <p className="text-xs font-semibold text-[#12141A] shrink-0">{formatarData(vi.data)}</p>
                        {(vi.vistoria_pdf || vi.VIDEO) && (
                          <div className="w-full sm:w-auto flex items-center gap-3 pl-11 sm:pl-0">
                            {vi.vistoria_pdf && (
                              <a href={`https:${vi.vistoria_pdf}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: MC_AZUL }}>
                                <FileText className="w-3 h-3" /> PDF
                              </a>
                            )}
                            {vi.VIDEO && (
                              <a href={`https:${vi.VIDEO}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: MC_AZUL }}>
                                <Video className="w-3 h-3" /> Vídeo
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>

              {/* Rodapé com ação principal no estilo "Ficha" */}
              <div className="px-4 sm:px-5 py-3.5 border-t border-[#E9EBF2] bg-[#F8F9FC] flex flex-wrap items-center gap-2.5">
                {hrefContrato ? (
                  <a
                    href={hrefContrato}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[11px] border border-[#E2E6F0] bg-white text-[12.5px] font-semibold text-[#12141A] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(9,30,124,0.10)]"
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = MC_AZUL; e.currentTarget.style.color = MC_AZUL }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E6F0'; e.currentTarget.style.color = '#12141A' }}
                  >
                    <FileText className="w-3.5 h-3.5" /> Ver contrato
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[11px] border border-[#E2E6F0] bg-white text-[12.5px] font-semibold text-[#12141A] opacity-45">
                    <FileText className="w-3.5 h-3.5" /> Sem contrato
                  </span>
                )}
              </div>
            </>
          )}
          </div>
        </DialogContent>
      </Dialog>

      <style jsx>{`
        @keyframes cardEnter {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <style jsx global>{`
        /* O global.css força um degradê roxo/navy em toda aba ativa (!important) —
           aqui sobrescreve só pra esse popup, com uma cor clara e sólida.
           Precisa de mais especificidade (classe .popup-ficha-veiculo) pra vencer. */
        .popup-ficha-veiculo [data-slot="tabs-trigger"][data-active] {
          background: #EAF0FE !important;
          color: #2C4BC4 !important;
        }
      `}</style>
    </>
  )
}
