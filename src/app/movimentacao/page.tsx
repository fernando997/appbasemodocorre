'use client'

import { useState, useRef, useEffect } from 'react'
import { Camera, Search, X, RotateCcw, LogIn, LogOut, Gauge, Activity, RefreshCw, FileText, CheckCircle2, Building2, DoorOpen, Users, Fuel, Video, ChevronLeft, Loader2, AlertTriangle, ChevronRight, CircleDot, MessageSquare, ImageIcon, ClipboardList, Radio, HelpCircle, Eye, Send, MapPin, XCircle, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { gerarPdfVistoria } from '@/lib/gerar-pdf-vistoria'
import { PlacaCameraPicker } from '@/components/placa-camera-picker'
import { GravadorVideo } from '@/components/gravador-video'

// Proxy server-side — esconde apikey/BUBBLE_PRIVATE_KEY do navegador
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>, format?: 'json' | 'form'): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, format }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

type Movimentacao = Record<string, unknown>

const TIPOS_VISTORIA = [
  { tipo: 'DEVOLUÇÃO', icon: LogOut, cor: 'bg-[#EF4444]' },
  { tipo: 'ENTREGA', icon: LogIn, cor: 'bg-[#22C55E]' },
  { tipo: 'SUBSTITUIÇÃO', icon: RefreshCw, cor: 'bg-[#8B5CF6]' },
  { tipo: 'ORÇAMENTO', icon: FileText, cor: 'bg-[#F59E0B]' },
  { tipo: 'DISPONIBILIDADE', icon: CheckCircle2, cor: 'bg-[#3B82F6]' },
  { tipo: 'ENTRADA NA BASE', icon: Building2, cor: 'bg-[#14B8A6]' },
  { tipo: 'SAÍDA DA BASE', icon: DoorOpen, cor: 'bg-[#F97316]' },
  { tipo: 'ENTREGA A TERCEIROS', icon: Users, cor: 'bg-[#EC4899]' },
]

// O Bubble manda "SUBISTITUIÇÃO" (com I extra) em vistorias disponíveis
const ALIASES_TIPO_VISTORIA: Record<string, string[]> = {
  'SUBSTITUIÇÃO': ['SUBSTITUIÇÃO', 'SUBISTITUIÇÃO'],
}

// Data de um registro do Bubble — 'Created Date' pode vir como timestamp numérico
// ou como texto ISO; Number() sozinho vira NaN no segundo caso e o sort não ordena
function tsRegistro(registro: Record<string, unknown>): number {
  const bruto = registro['Created Date'] ?? registro.data
  if (bruto == null) return 0
  const numero = Number(bruto)
  if (Number.isFinite(numero)) return numero
  const parsed = Date.parse(String(bruto))
  return Number.isFinite(parsed) ? parsed : 0
}

const NIVEIS_COMBUSTIVEL = ['R', '1/4', '1/2', '3/4', '4/4']

const INSTRUCOES_VIDEO = [
  'Ligue a moto e deixe-a funcionando.',
  'Grave um vídeo curto mostrando um giro completo de 360° ao redor da moto.',
  'Mostre o hodômetro (km) com clareza.',
  'Aponte possíveis avarias, se houver.',
  'Evite comentários indevidos durante a gravação.',
  'Certifique-se de que a moto esteja limpa e bem visível.',
]

const FOTOS_DEVOLUCAO = [
  { id: 'dianteira', label: 'Foto Dianteira da Moto' },
  { id: 'pneuDianteiro', label: 'Foto Pneu Dianteiro' },
  { id: 'rodaDianteira', label: 'Foto Roda Dianteira' },
  { id: 'lateralDireita', label: 'Foto Lateral Direita' },
  { id: 'traseira', label: 'Foto Traseira' },
  { id: 'pneuTraseiro', label: 'Foto Pneu Traseiro' },
  { id: 'rodaTraseira', label: 'Foto Roda Traseira' },
  { id: 'lateralEsquerda', label: 'Foto Lateral Esquerda' },
  { id: 'banco', label: 'Foto do Banco' },
  { id: 'tanque', label: 'Foto do Tanque' },
  { id: 'painel', label: 'Foto do Painel' },
  { id: 'km', label: 'Foto do KM' },
  { id: 'retrovisores', label: 'Foto dos Retrovisores' },
] as const

const FOTOS_DEVOLUCAO_INICIAL = Object.fromEntries(FOTOS_DEVOLUCAO.map(f => [f.id, null]))

const PERGUNTAS_MOTOR_LIGADO = [
  { id: 'fumandoEscapamento', label: 'Está fumando pelo escapamento?' },
  { id: 'falhando', label: 'Está falhando?' },
  { id: 'batendoValvula', label: 'Está batendo válvula?' },
  { id: 'canoAdulterado', label: 'Estava com cano de escape adulterado?' },
  { id: 'semFiltroAr', label: 'Estava sem filtro de ar?' },
] as const

const ETAPAS_DEVOLUCAO = [
  { label: 'Fotos', icon: ImageIcon },
  { label: 'Avarias', icon: Video },
  { label: 'Detalhes', icon: Video },
  { label: 'Rastreio', icon: Radio },
  { label: 'Perguntas', icon: HelpCircle },
  { label: 'Revisão', icon: Eye },
  { label: 'KM/Enviar', icon: Send },
]

const PERGUNTA_LABELS: Record<string, string> = {
  manutencaoEstetica: 'Manutenção estética',
  pneusMalEstado: 'Pneus em mal estado',
  vazamentoOleo: 'Vazamento de óleo',
  motoLigando: 'Moto ligando',
  fumandoEscapamento: 'Fumando escapamento',
  falhando: 'Falhando',
  batendoValvula: 'Batendo válvula',
  canoAdulterado: 'Cano adulterado',
  semFiltroAr: 'Sem filtro de ar',
}

// Remove campos com string vazia antes de mandar pro Bubble (senão preenche com null lá)
function omitirVazios<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '') out[k as keyof T] = v as T[keyof T]
  }
  return out
}

// Extrai só a mensagem de texto da resposta do registro de substituição
// (ex: { status: 'success', response: { vazio: 'Nenhuma placa registrada ainda' } } → 'Nenhuma placa registrada ainda')
function extrairMensagemRegistro(registro: unknown): string {
  if (typeof registro === 'string') return registro
  if (registro && typeof registro === 'object') {
    const response = (registro as Record<string, unknown>).response
    if (typeof response === 'string') return response
    if (response && typeof response === 'object') {
      const valor = Object.values(response as Record<string, unknown>).find(v => typeof v === 'string')
      if (typeof valor === 'string') return valor
    }
  }
  return JSON.stringify(registro)
}

function fmtData(ts: unknown): string {
  if (!ts) return '-'
  const d = new Date(ts as number)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = String(d.getFullYear()).slice(2)
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${ano} ${hora}:${min}`
}

function fmtDataSemHora(ts: unknown): string {
  if (!ts) return '-'
  const d = new Date(ts as number)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = String(d.getFullYear()).slice(2)
  return `${dia}/${mes}/${ano}`
}


function val(mov: Movimentacao, key: string): string {
  const v = mov[key]
  return v != null ? String(v) : '-'
}

function parseMov(mov: Movimentacao) {
  return {
    temSaida: !!mov['data de saida'],
    entrada: fmtData(mov['data de entrada']),
    saida: fmtData(mov['data de saida']),
    kmI: val(mov, 'km inicial'),
    kmF: val(mov, 'km final'),
    combS: val(mov, 'combustivel de saida'),
    combR: val(mov, 'Combustivel de retorno'),
    statusDesc: mov._statusObj ? String((mov._statusObj as Movimentacao)['descricao'] ?? (mov._statusObj as Movimentacao)['descrição'] ?? '-') : null,
    contrato: mov._contratoObj ? String((mov._contratoObj as Movimentacao)['Numero ctr'] ?? '-') : null,
  }
}

function CardMovimentacao({ mov, index }: { mov: Movimentacao; index: number }) {
  const { temSaida, kmI, kmF, statusDesc, contrato } = parseMov(mov)
  const entrada = fmtData(mov['data de entrada'])
  const saida = fmtData(mov['data de saida'])
  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide">#{index + 1}</span>
        {statusDesc
          ? <Badge className="text-xs font-medium bg-blue-50 text-blue-700 border-blue-200">{statusDesc}</Badge>
          : <Badge variant="outline" className="text-xs text-muted-foreground">Sem status</Badge>}
      </div>

      {/* Datas */}
      <div className="grid grid-cols-2 divide-x px-0">
        <div className="flex flex-col items-start px-4 py-3 gap-1">
          <div className="flex items-center gap-1 text-green-600">
            <LogIn className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Entrada</span>
          </div>
          <span className="text-xs font-mono text-foreground">{entrada}</span>
        </div>
        <div className="flex flex-col items-start px-4 py-3 gap-1">
          <div className="flex items-center gap-1 text-red-500">
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Saída</span>
          </div>
          <span className="text-xs font-mono text-foreground">{temSaida ? saida : <span className="text-muted-foreground">—</span>}</span>
        </div>
      </div>

      {/* KM */}
      <div className="grid grid-cols-2 divide-x border-t">
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">KM inicial</span>
          <span className="font-medium ml-auto">{kmI}</span>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">KM final</span>
          <span className="font-medium ml-auto">{kmF}</span>
        </div>
      </div>

      {/* Contrato */}
      {contrato && contrato !== '-' && (
        <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">Contrato</span>
          <span className="text-xs font-mono font-medium">{contrato}</span>
        </div>
      )}
    </div>
  )
}

function RowMovimentacao({ mov, index }: { mov: Movimentacao; index: number }) {
  const { temSaida, entrada, saida, kmI, kmF, combS, combR, statusDesc, contrato } = parseMov(mov)
  return (
    <tr className={`border-b last:border-0 ${index % 2 !== 0 ? 'bg-muted/10' : ''} hover:bg-muted/30 transition-colors`}>
      <td className="px-4 py-3 text-muted-foreground text-xs">{index + 1}</td>
      <td className="px-4 py-3">
        <Badge className={temSaida ? 'bg-gray-100 text-gray-600 border-gray-200 text-xs font-normal gap-1' : 'bg-green-100 text-green-700 border-green-200 text-xs font-normal gap-1'}>
          <LogIn className="w-3 h-3" />{entrada}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {temSaida
          ? <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal gap-1"><LogOut className="w-3 h-3" />{saida}</Badge>
          : <span className="text-xs text-muted-foreground">-</span>}
      </td>
      <td className="px-4 py-3"><div className="flex items-center gap-1 text-xs"><Gauge className="w-3 h-3 text-muted-foreground" />{kmI}</div></td>
      <td className="px-4 py-3"><div className="flex items-center gap-1 text-xs"><Gauge className="w-3 h-3 text-muted-foreground" />{kmF}</div></td>
      <td className="px-4 py-3 text-xs">{combS}</td>
      <td className="px-4 py-3 text-xs">{combR}</td>
      <td className="px-4 py-3">
        {statusDesc
          ? <Badge className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200">{statusDesc}</Badge>
          : <span className="text-xs text-muted-foreground">-</span>}
      </td>
      <td className="px-4 py-3 text-xs font-mono">{contrato ?? <span className="text-muted-foreground">-</span>}</td>
    </tr>
  )
}

export default function MovimentacaoPage() {
  const [foto, setFoto] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [placa, setPlaca] = useState('')
  const [analisando, setAnalisando] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState<Movimentacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<'status' | 'vistorias' | 'editar-km' | 'editar-status' | 'rastreador' | null>(null)
  const [novoKm, setNovoKm] = useState('')
  const [novoStatus, setNovoStatus] = useState('')
  const [kmEditarStatus, setKmEditarStatus] = useState('')
  const [statusOpcoes, setStatusOpcoes] = useState<string[]>([])
  const [carregandoStatus, setCarregandoStatus] = useState(false)
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false)
  const [solicitacaoSucesso, setSolicitacaoSucesso] = useState(false)
  const [erroSolicitacao, setErroSolicitacao] = useState('')
  const [mensagemBloqueioSolicitacao, setMensagemBloqueioSolicitacao] = useState('')
  const [motivoSolicitacao, setMotivoSolicitacao] = useState('')
  const [fotoPainelKm, setFotoPainelKm] = useState<string | null>(null)
  const [fotoPainelKmFile, setFotoPainelKmFile] = useState<File | null>(null)
  const [analisandoKm, setAnalisandoKm] = useState(false)
  const fotoPainelKmRef = useRef<HTMLInputElement>(null)

  function onFotoPainelKm(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoPainelKm(URL.createObjectURL(file))
    setFotoPainelKmFile(file)
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const MAX = 800
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const b64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
        analisarKmPainel(b64)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  async function analisarKmPainel(b64: string) {
    setAnalisandoKm(true)
    try {
      const res = await fetch('/api/ler-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
      })
      const data = await res.json()
      if (data.km) setNovoKm(data.km)
    } catch {
    } finally {
      setAnalisandoKm(false)
    }
  }

  const STATUS_EXCLUIDOS = ['PENDENTE', 'COMPRA RECEBIDA', 'COMPRA EM TRÂNSITO', 'RETORNO DE LOCAÇÃO', 'LOCADO', 'DISPONIVEL', 'ROUBADO/FURTADO']

  async function buscarStatusVeiculo() {
    setCarregandoStatus(true)
    setStatusOpcoes([])
    try {
      const data = await chamarBubble('base-chamar-status', {})
      const resp = data?.response
      const lista: Record<string, unknown>[] = Array.isArray(resp)
        ? resp
        : (resp && typeof resp === 'object'
          ? (Object.values(resp).find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined) ?? []
          : [])
      const nomes = lista
        .map((s) => String(s['descrição'] ?? s['descricao'] ?? ''))
        .map((d) => d.trim())
        .filter((d) => d && !STATUS_EXCLUIDOS.includes(d.toUpperCase()))
      setStatusOpcoes([...new Set(nomes)])
    } catch {
      setStatusOpcoes([])
    } finally {
      setCarregandoStatus(false)
    }
  }

  async function enviarSolicitacaoBase(descricao: string, tipo: 'ALTERAÇÃO KM' | 'ALTERAÇÃO STATUS', motivo: string, foto?: File | null, km?: string) {
    setEnviandoSolicitacao(true)
    setErroSolicitacao('')
    try {
      const veiculoId = (veiculoFuncoes as { _id?: string } | null)?._id ?? ''
      const user = (() => { try { return JSON.parse(localStorage.getItem('mc_user') ?? '{}') } catch { return {} } })()
      const fotoUrl = foto ? await uploadArquivo(foto) : ''
      const data = await chamarBubble('registrar-solicitacao-base', {
        data: String(Date.now()),
        veiculo: veiculoId,
        descricao,
        tipo,
        motivo,
        user: user?._id ?? '',
        ...(fotoUrl ? { foto: fotoUrl } : {}),
        ...(km ? { km } : {}),
      })

      const mensagemBloqueio = data?.response?.MENSAGEM ?? data?.MENSAGEM
      if (mensagemBloqueio) {
        setMensagemBloqueioSolicitacao(String(mensagemBloqueio))
        setEnviandoSolicitacao(false)
        return
      }

      setSolicitacaoSucesso(true)
      setTimeout(() => {
        setSolicitacaoSucesso(false)
        setAcao(null)
        setNovoKm('')
        setNovoStatus('')
        setKmEditarStatus('')
        setFotoPainelKm(null)
        setFotoPainelKmFile(null)
        setMotivoSolicitacao('')
        setEnviandoSolicitacao(false)
      }, 2500)
    } catch (err) {
      setErroSolicitacao(`Erro ao enviar solicitação: ${String(err)}`)
      setEnviandoSolicitacao(false)
    }
  }

  const [veiculoFuncoes, setVeiculoFuncoes] = useState<Record<string, unknown> | null>(null)
  const statusLocado = String(veiculoFuncoes?.status_veiculo_desc ?? '').toUpperCase() === 'LOCADO'
  const clienteInfo = veiculoFuncoes?.cliente as { nome_completo?: string; celular?: string } | undefined
  const [pendenciasVeiculo, setPendenciasVeiculo] = useState<Record<string, unknown>[]>([])
  const pendenciasAtivas = pendenciasVeiculo.filter((p) => p.status === 'ATIVO')
  const [vistoriasDisponiveis, setVistoriasDisponiveis] = useState<string[]>([])
  const [vistoriasIncluir, setVistoriasIncluir] = useState<Record<string, unknown>[]>([])
  const [vistoriasRetirar, setVistoriasRetirar] = useState<Record<string, unknown>[]>([])
  const [modoSub, setModoSub] = useState<'INCLUIR' | 'RETIRAR' | null>(null)
  // No RETIRAR, a "moto nova" tem que ser exatamente essa (unique_id do veículo que saiu no INCLUIR anterior)
  const [placaEsperadaId, setPlacaEsperadaId] = useState('')
  const [carregandoFuncoes, setCarregandoFuncoes] = useState(false)
  const [podeVistoria, setPodeVistoria] = useState(false)
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null)
  const [kmDisponibilidade, setKmDisponibilidade] = useState('')
  const [combustivelDisponibilidade, setCombustivelDisponibilidade] = useState('')
  const [videoDisponibilidade, setVideoDisponibilidade] = useState<string | null>(null)
  const [videoDisponibilidadeFile, setVideoDisponibilidadeFile] = useState<File | null>(null)
  const [enviandoVistoria, setEnviandoVistoria] = useState(false)
  const [etapaEnvio, setEtapaEnvio] = useState<'upload' | 'vistoria' | 'concluido' | null>(null)
  const [vistoriaSucesso, setVistoriaSucesso] = useState(false)
  // Devolução
  const [etapaDevolucao, setEtapaDevolucao] = useState(0)
  const [fotosDevolucao, setFotosDevolucao] = useState<Record<string, string | null>>(FOTOS_DEVOLUCAO_INICIAL)
  const [fotosDevolucaoFiles, setFotosDevolucaoFiles] = useState<Record<string, File | null>>(FOTOS_DEVOLUCAO_INICIAL)
  const [videoAvarias, setVideoAvarias] = useState<string | null>(null)
  const [videoAvariasFile, setVideoAvariasFile] = useState<File | null>(null)
  const [videoAvariasUrl, setVideoAvariasUrl] = useState('')
  const [videoDetalhes, setVideoDetalhes] = useState<string | null>(null)
  const [videoDetalhesFile, setVideoDetalhesFile] = useState<File | null>(null)
  const [videoDetalhesUrl, setVideoDetalhesUrl] = useState('')
  const [violacaoRastreamento, setViolacaoRastreamento] = useState<boolean | null>(null)
  const [videoViolacao, setVideoViolacao] = useState<string | null>(null)
  const [videoViolacaoFile, setVideoViolacaoFile] = useState<File | null>(null)
  const [videoViolacaoUrl, setVideoViolacaoUrl] = useState('')
  const [enviandoVideoDevolucao, setEnviandoVideoDevolucao] = useState(false)
  const [erroVideoDevolucao, setErroVideoDevolucao] = useState('')
  const [perguntasDevolucao, setPerguntasDevolucao] = useState<Record<string, boolean | null>>({
    manutencaoEstetica: null, pneusMalEstado: null, vazamentoOleo: null, motoLigando: null,
    fumandoEscapamento: null, falhando: null, batendoValvula: null, canoAdulterado: null, semFiltroAr: null,
  })
  const [observacaoDevolucao, setObservacaoDevolucao] = useState('')
  const [kmDevolucao, setKmDevolucao] = useState('')
  const [geoLocationDevolucao, setGeoLocationDevolucao] = useState<{ lat: number; lng: number } | 'negado' | null>(null)

  // Substituição — fases: 1º foto da placa nova, depois vistoria da antiga, depois dados da nova
  const [subFase, setSubFase] = useState<'placa' | 'antiga'>('placa')
  const [placaNovaSub, setPlacaNovaSub] = useState('')
  const [fotoNovaSub, setFotoNovaSub] = useState<string | null>(null)
  const [analisandoNovaSub, setAnalisandoNovaSub] = useState(false)
  const [testandoRastreador, setTestandoRastreador] = useState(false)
  const [rastreadorInfo, setRastreadorInfo] = useState<{ ok: boolean; localizacoes: Record<string, { lat: number | null; long: number | null; plataforma: string | null }> } | null>(null)
  const [enderecosRastreador, setEnderecosRastreador] = useState<Record<string, string>>({})
  const [linkVistoriaSub, setLinkVistoriaSub] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  // Guarda a resposta do registro de substituição já gravado — se o envio final
  // falhar e o operador tentar de novo, não registra a mesma vistoria duas vezes
  const registroSubRef = useRef<string | null>(null)
  const [linkVistoriaEntrega, setLinkVistoriaEntrega] = useState('')
  const [linkEntregaCopiado, setLinkEntregaCopiado] = useState(false)
  const [contratoAptoEntrega, setContratoAptoEntrega] = useState(false)
  const [veiculoNovoSub, setVeiculoNovoSub] = useState<Record<string, unknown> | null>(null)
  const [carregandoNovoSub, setCarregandoNovoSub] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Camera propria (com moldura-guia) pra foto da placa na tela de Funcoes
  const [placaCameraAtiva, setPlacaCameraAtiva] = useState(false)
  const [erroPlacaCamera, setErroPlacaCamera] = useState('')
  const [isMobile, setIsMobile] = useState(true)
  const placaPreviewRef = useRef<HTMLVideoElement>(null)
  const placaStreamRef = useRef<MediaStream | null>(null)
  const placaCanvasRef = useRef<HTMLCanvasElement>(null)
  const placaBoxRef = useRef<HTMLDivElement>(null)
  const PLACA_GUIDE_W = 176
  const PLACA_GUIDE_H = Math.round((PLACA_GUIDE_W * 7) / 8)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    return () => {
      placaStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // O <video> só existe no DOM depois que placaCameraAtiva vira true, entao
  // aqui reatribui o stream assim que o elemento for montado
  useEffect(() => {
    if (placaCameraAtiva && placaPreviewRef.current && placaStreamRef.current) {
      placaPreviewRef.current.srcObject = placaStreamRef.current
      placaPreviewRef.current.play().catch(() => {})
    }
  }, [placaCameraAtiva])

  async function iniciarCameraPlaca() {
    setErroPlacaCamera('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      placaStreamRef.current = stream
      setPlacaCameraAtiva(true)
    } catch (err) {
      setErroPlacaCamera(`Erro ao acessar a camera: ${String(err)}`)
    }
  }

  function pararCameraPlaca() {
    placaStreamRef.current?.getTracks().forEach((t) => t.stop())
    placaStreamRef.current = null
    setPlacaCameraAtiva(false)
  }

  function capturarFotoPlaca() {
    const video = placaPreviewRef.current
    const canvas = placaCanvasRef.current
    const box = placaBoxRef.current
    if (!video || !canvas || !box) return
    const rect = box.getBoundingClientRect()
    const videoW = video.videoWidth
    const videoH = video.videoHeight
    const scale = Math.max(rect.width / videoW, rect.height / videoH)
    const offsetX = (rect.width - videoW * scale) / 2
    const offsetY = (rect.height - videoH * scale) / 2
    const winX = (rect.width - PLACA_GUIDE_W) / 2
    const winY = (rect.height - PLACA_GUIDE_H) / 2
    const srcX = (winX - offsetX) / scale
    const srcY = (winY - offsetY) / scale
    const srcW = PLACA_GUIDE_W / scale
    const srcH = PLACA_GUIDE_H / scale
    canvas.width = Math.round(srcW)
    canvas.height = Math.round(srcH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
    pararCameraPlaca()

    setResultado(null)
    setErro(null)
    setAcao(null)
    setVeiculoFuncoes(null)
    setVistoriasDisponiveis([])
    setTipoSelecionado(null)
    setKmDisponibilidade('')
    setCombustivelDisponibilidade('')
    setVideoDisponibilidadeFile(null)
    processarFotoPlaca(canvas.toDataURL('image/jpeg', 0.85))
  }

  const fotoDevRef = useRef<HTMLInputElement>(null)
  const [fotoDevAtual, setFotoDevAtual] = useState<string | null>(null)

  function onVideoDisponibilidadeGravado(file: File) {
    setVideoDisponibilidade(URL.createObjectURL(file))
    setVideoDisponibilidadeFile(file)
  }

  function onFotoDevolucao(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !fotoDevAtual) return
    const url = URL.createObjectURL(file)
    setFotosDevolucao(prev => ({ ...prev, [fotoDevAtual]: url }))
    setFotosDevolucaoFiles(prev => ({ ...prev, [fotoDevAtual]: file }))
    setFotoDevAtual(null)
    e.target.value = ''
  }

  function tirarFotoDevolucao(id: string) {
    setFotoDevAtual(id)
    setTimeout(() => fotoDevRef.current?.click(), 100)
  }

  function onVideoDevolucaoGravado(setter: (v: string | null) => void, fileSetter: (f: File | null) => void, urlSetter: (u: string) => void) {
    return async (arquivo: File) => {
      setErroVideoDevolucao('')
      urlSetter('')
      setter(URL.createObjectURL(arquivo))
      fileSetter(arquivo)

      // Sobe pro Bubble já aqui, na etapa — se estourar o limite, o usuário
      // fica sabendo na hora e regrava, em vez de descobrir só no final
      setEnviandoVideoDevolucao(true)
      try {
        const url = await uploadArquivo(arquivo)
        urlSetter(url)
      } catch (err) {
        setErroVideoDevolucao(String(err))
        setter(null)
        fileSetter(null)
      } finally {
        setEnviandoVideoDevolucao(false)
      }
    }
  }

  function setPergunta(id: string, valor: boolean) {
    setPerguntasDevolucao(prev => {
      const next = { ...prev, [id]: valor }
      if (id === 'motoLigando' && !valor) {
        next.fumandoEscapamento = null
        next.falhando = null
        next.batendoValvula = null
        next.canoAdulterado = null
        next.semFiltroAr = null
      }
      return next
    })
  }

  const todasFotosDevOk = FOTOS_DEVOLUCAO.every(f => fotosDevolucaoFiles[f.id])
  const fotosDevCount = FOTOS_DEVOLUCAO.filter(f => fotosDevolucaoFiles[f.id]).length

  // Vistoria já começou de fato (não apenas o tipo escolhido) — limpar a placa aqui
  // descarta tudo, então o X pede confirmação
  const vistoriaIniciada = !!tipoSelecionado && (
    etapaDevolucao > 0 || subFase === 'antiga' || !!placaNovaSub ||
    !!kmDisponibilidade || !!combustivelDisponibilidade || !!videoDisponibilidadeFile
  )

  // INCLUIR: moto nova precisa estar RESERVA | RETIRAR: precisa ser exatamente a moto esperada (ignora status)
  const motoNovaElegivel = !!veiculoNovoSub && (modoSub === 'RETIRAR'
    ? String(veiculoNovoSub._id) === placaEsperadaId
    : (veiculoNovoSub.status_veiculo_desc as string) === 'RESERVA')

  // Registro pendente de retirada (definindo se o card de Substituição deve indicar RETIRAR).
  // O Bubble já entrega isso pronto: um registro só aparece em 'vistorias-retirar' quando
  // a retirada dessa moto ainda está pendente — o 'status' nele é do INCLUIR (aprovado ou
  // não), não indica se a retirada em si já foi feita, então não filtra por status aqui.
  // 'vistorias-retirar' também traz registros de OUTRAS motos, então filtra só os que
  // envolvem a moto consultada agora (placa1 = moto antiga, placa2 = moto nova) e pega o
  // mais recente entre eles.
  const veiculoFuncoesId = String((veiculoFuncoes as { _id?: string } | null)?._id ?? '')
  const registrosRetirarDaMoto = vistoriasRetirar.filter(r =>
    !!veiculoFuncoesId && (String(r.placa1 ?? '') === veiculoFuncoesId || String(r.placa2 ?? '') === veiculoFuncoesId)
  )
  const pendenteRetirarCard = [...registrosRetirarDaMoto].sort(
    (a, b) => tsRegistro(b) - tsRegistro(a)
  )[0]

  function resetDevolucao() {
    setEtapaDevolucao(0)
    setFotosDevolucao(FOTOS_DEVOLUCAO_INICIAL)
    setFotosDevolucaoFiles(FOTOS_DEVOLUCAO_INICIAL)
    setVideoAvarias(null); setVideoAvariasFile(null); setVideoAvariasUrl('')
    setVideoDetalhes(null); setVideoDetalhesFile(null); setVideoDetalhesUrl('')
    setViolacaoRastreamento(null)
    setVideoViolacao(null); setVideoViolacaoFile(null); setVideoViolacaoUrl('')
    setErroVideoDevolucao('')
    setPerguntasDevolucao({ manutencaoEstetica: null, pneusMalEstado: null, vazamentoOleo: null, motoLigando: null, fumandoEscapamento: null, falhando: null, batendoValvula: null, canoAdulterado: null, semFiltroAr: null })
    setObservacaoDevolucao('')
    setKmDevolucao('')
    setGeoLocationDevolucao(null)
  }

  function resetSubNova() {
    registroSubRef.current = null
    setSubFase('placa')
    setModoSub(null)
    setPlacaEsperadaId('')
    setPlacaNovaSub('')
    setFotoNovaSub(null)
    setAnalisandoNovaSub(false)
    setTestandoRastreador(false)
    setRastreadorInfo(null)
    setLinkVistoriaSub('')
    setLinkCopiado(false)
    setVeiculoNovoSub(null)
  }

  // Foto da placa nova → IA lê a placa → consulta os dados do veículo
  function processarFotoNovaSub(dataUrl: string) {
    setPlacaNovaSub('')
    setVeiculoNovoSub(null)
    const img = new Image()
    img.onload = async () => {
      const MAX = 800
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const compressed = canvas.toDataURL('image/jpeg', 0.7)
      setFotoNovaSub(compressed)
      const b64 = compressed.split(',')[1]
      setAnalisandoNovaSub(true)
      try {
        const res = await fetch('/api/ler-placa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64 }),
        })
        const data = await res.json()
        if (data.placa) {
          setPlacaNovaSub(data.placa)
          await buscarVeiculoNovoSub(data.placa)
        }
      } catch {
      } finally {
        setAnalisandoNovaSub(false)
      }
    }
    img.src = dataUrl
  }

  async function buscarVeiculoNovoSub(placaEscolhida: string) {
    if (!placaEscolhida.trim()) return
    setCarregandoNovoSub(true)
    setVeiculoNovoSub(null)
    try {
      const data = await chamarBubble('consulta-veiculo-funcoes', { placa: placaEscolhida.trim().toUpperCase() })
      const veiculo = data.response?.veiculo ?? null
      setVeiculoNovoSub(veiculo)
      // Moto apta → testa os rastreadores automaticamente
      // INCLUIR: precisa estar RESERVA | RETIRAR: precisa ser exatamente a moto esperada (ignora status)
      const elegivel = modoSub === 'RETIRAR'
        ? !!veiculo && String(veiculo._id) === placaEsperadaId
        : !!veiculo && (veiculo.status_veiculo_desc as string) === 'RESERVA'
      if (elegivel) {
        testarRastreador(placaEscolhida)
      }
    } catch {
      setVeiculoNovoSub(null)
    } finally {
      setCarregandoNovoSub(false)
    }
  }

  async function testarRastreador(placaEscolhida: string) {
    setTestandoRastreador(true)
    setRastreadorInfo(null)
    setEnderecosRastreador({})
    try {
      const res = await fetch('/api/rastreador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placaEscolhida.trim().toUpperCase() }),
      })
      const data = await res.json()
      setRastreadorInfo(data)
      Object.entries(data?.localizacoes ?? {}).forEach(([nome, loc]) => {
        const { lat, long } = loc as { lat: number | null; long: number | null }
        if (lat == null || long == null) return
        fetch('/api/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, long }),
        })
          .then(r => r.json())
          .then(d => {
            if (d?.endereco) setEnderecosRastreador(prev => ({ ...prev, [nome]: d.endereco }))
          })
          .catch(() => {})
      })
    } catch {
      setRastreadorInfo({ ok: false, localizacoes: {} })
    } finally {
      setTestandoRastreador(false)
    }
  }

  async function capturarLocalizacaoAtual(): Promise<{ lat: number; lng: number } | 'negado' | null> {
    try {
      return await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
    } catch (err) {
      const negado = err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
      return negado ? 'negado' : null
    }
  }

  async function uploadArquivo(file: File): Promise<string> {
    const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
    const form = new FormData()
    form.append('foto', file, file.name)
    const res = await fetch('/api/upload-foto', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload falhou: HTTP ${res.status} (arquivo: ${file.name}, ${tamanhoMB}MB)`)
    const data = await res.json()
    return data.url as string
  }

  // Registra/verifica quem já terminou a vistoria de substituição — a moto nova
  // pode ser finalizada pelo cliente (link) antes ou depois da moto antiga aqui
  async function registrarVistoriaSubstituicao(contratoId: string, placaNova: string, placaAntiga: string, modo: 'INCLUIR' | 'RETIRAR'): Promise<unknown> {
    const endpoint = modo === 'RETIRAR' ? 'base-registro-vistoria-retirar' : 'base-registro-vistoria-substituicao'
    return chamarBubble(endpoint, {
      contrato: contratoId,
      'placa-nova': placaNova,
      'placa-antiga': placaAntiga,
    })
  }

  async function enviarVistoriaDevolucao() {
    if (!placa || !kmDevolucao) return
    setEnviandoVistoria(true)
    setErro(null)
    setEtapaEnvio('upload')
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('mc_user') ?? '{}') } catch { return {} } })()

      // Localização do dispositivo no momento da vistoria
      const localizacaoAtual = geoLocationDevolucao ?? await capturarLocalizacaoAtual()
      if (localizacaoAtual) setGeoLocationDevolucao(localizacaoAtual)

      // Vídeos já foram enviados na própria etapa (ver onVideoDevolucao) — só reaproveita as URLs

      // Gerar PDF da vistoria
      const pdfBlob = await gerarPdfVistoria({
        placa: placa.trim().toUpperCase(),
        km: kmDevolucao,
        contrato: (veiculoFuncoes?.contrato as { 'Numero ctr'?: number } | undefined)?.['Numero ctr'] != null
          ? String((veiculoFuncoes?.contrato as { 'Numero ctr'?: number })['Numero ctr'])
          : undefined,
        cliente: clienteInfo?.nome_completo ? String(clienteInfo.nome_completo) : undefined,
        vistoriadorNome: String(user?.Nome ?? user?.nome ?? ''),
        vistoriadorCpf: String(user?.cpf ?? user?.CPF ?? ''),
        vistoriadorWhatsapp: String(user?.celular ?? user?.Celular ?? user?.whatsapp ?? user?.WhatsApp ?? user?.telefone ?? user?.Telefone ?? ''),
        fotos: FOTOS_DEVOLUCAO.map(f => ({
          label: f.label,
          dataUrl: fotosDevolucao[f.id],
        })),
        perguntas: [
          { label: 'Precisa de manutenção estética?', resposta: perguntasDevolucao.manutencaoEstetica },
          { label: 'Pneus estão em mal estado de conservação?', resposta: perguntasDevolucao.pneusMalEstado },
          { label: 'Possui vazamento de óleo?', resposta: perguntasDevolucao.vazamentoOleo },
          { label: 'A moto está ligando?', resposta: perguntasDevolucao.motoLigando },
          ...(perguntasDevolucao.motoLigando ? PERGUNTAS_MOTOR_LIGADO.map(p => ({
            label: p.label,
            resposta: perguntasDevolucao[p.id],
          })) : []),
        ],
        violacaoRastreamento,
        observacao: observacaoDevolucao,
        localizacao: localizacaoAtual,
        videos: [
          { label: 'Vídeo de Detalhes', url: videoDetalhesUrl },
          { label: 'Vídeo de Avarias', url: videoAvariasUrl },
          { label: 'Vídeo de Violação do Rastreamento', url: videoViolacaoUrl },
        ],
      })

      // Upload do PDF
      const pdfUrl = await uploadArquivo(
        new File([pdfBlob], `VISTORIA-DEVOLUCAO-${placa.trim().toUpperCase()}.pdf`, { type: 'application/pdf' })
      )

      setEtapaEnvio('vistoria')

      const sn = (val: boolean | null) => val === true ? 'SIM' : 'NÃO'
      const body = {
        PLACA: placa.trim().toUpperCase(),
        KM: kmDevolucao,
        PDF: pdfUrl,
        TIPO: 'DEVOLUÇÃO',
        VIDEO: videoDetalhesUrl,
        CONTRATO: (veiculoFuncoes?.contrato as { _id?: string } | undefined)?._id ?? '',
        'VIDEO-2': videoAvariasUrl,
        'VIDEO-3': videoViolacaoUrl,
        MANUTENCAO: sn(perguntasDevolucao.manutencaoEstetica),
        PNEUS: sn(perguntasDevolucao.pneusMalEstado),
        VAZAMENTO: sn(perguntasDevolucao.vazamentoOleo),
        LIGANDO: sn(perguntasDevolucao.motoLigando),
        FUMACA: sn(perguntasDevolucao.fumandoEscapamento),
        FALHANDO: sn(perguntasDevolucao.falhando),
        VALVULA: sn(perguntasDevolucao.batendoValvula),
        CANO: sn(perguntasDevolucao.canoAdulterado),
        FILTRO: sn(perguntasDevolucao.semFiltroAr),
        VIOLACAO: sn(violacaoRastreamento),
        NOME: String(user?.Nome ?? user?.nome ?? ''),
        USER: String(user?.user ?? ''),
      }

      await chamarBubble('vistoria_devolucao', body, 'json')

      setEtapaEnvio('concluido')
      setVistoriaSucesso(true)
      setTimeout(() => {
        limpar()
        resetDevolucao()
        setVistoriaSucesso(false)
        setEtapaEnvio(null)
        setEnviandoVistoria(false)
      }, 3000)
    } catch (err) {
      setErro(`Erro ao enviar vistoria: ${String(err)}`)
      setEtapaEnvio(null)
      setEnviandoVistoria(false)
    }
  }

  async function enviarVistoriaSubstituicao() {
    if (!placa || !kmDevolucao || !placaNovaSub) return
    if (enviandoVistoria) return
    setEnviandoVistoria(true)
    setErro(null)
    setEtapaEnvio('upload')
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('mc_user') ?? '{}') } catch { return {} } })()
      const contratoObj = veiculoFuncoes?.contrato as { _id?: string; 'Numero ctr'?: number } | undefined
      const contratoId = contratoObj?._id ?? ''
      const numeroContrato = contratoObj?.['Numero ctr'] ?? ''

      // Localização do dispositivo no momento da vistoria
      const localizacaoAtual = geoLocationDevolucao ?? await capturarLocalizacaoAtual()
      if (localizacaoAtual) setGeoLocationDevolucao(localizacaoAtual)

      // Vídeo da moto ANTIGA já foi enviado na própria etapa (ver onVideoDevolucao)
      const videoAntigaUrl = videoAvariasUrl

      // PDF da moto ANTIGA (saindo) — mesmo formato da Devolução
      const pdfAntigaBlob = await gerarPdfVistoria({
        placa: placa.trim().toUpperCase(),
        km: kmDevolucao,
        contrato: numeroContrato ? String(numeroContrato) : undefined,
        cliente: clienteInfo?.nome_completo ? String(clienteInfo.nome_completo) : undefined,
        vistoriadorNome: String(user?.Nome ?? user?.nome ?? ''),
        vistoriadorCpf: String(user?.cpf ?? user?.CPF ?? ''),
        vistoriadorWhatsapp: String(user?.celular ?? user?.Celular ?? user?.whatsapp ?? user?.WhatsApp ?? user?.telefone ?? user?.Telefone ?? ''),
        fotos: FOTOS_DEVOLUCAO.map(f => ({
          label: f.label,
          dataUrl: fotosDevolucao[f.id],
        })),
        perguntas: [
          { label: 'Precisa de manutenção estética?', resposta: perguntasDevolucao.manutencaoEstetica },
          { label: 'Pneus estão em mal estado de conservação?', resposta: perguntasDevolucao.pneusMalEstado },
          { label: 'Possui vazamento de óleo?', resposta: perguntasDevolucao.vazamentoOleo },
          { label: 'A moto está ligando?', resposta: perguntasDevolucao.motoLigando },
          ...(perguntasDevolucao.motoLigando ? PERGUNTAS_MOTOR_LIGADO.map(p => ({
            label: p.label,
            resposta: perguntasDevolucao[p.id],
          })) : []),
        ],
        violacaoRastreamento,
        observacao: observacaoDevolucao,
        localizacao: localizacaoAtual,
        videos: [
          { label: 'Vídeo de Avarias', url: videoAntigaUrl },
          { label: 'Vídeo de Violação do Rastreamento', url: videoViolacaoUrl },
        ],
      })

      // Upload do PDF (a moto nova é enviada pelo cliente, na outra tela)
      const pdfAntigaUrl = await uploadArquivo(
        new File([pdfAntigaBlob], `VISTORIA-SUB-ANTIGA-${placa.trim().toUpperCase()}.pdf`, { type: 'application/pdf' })
      )

      // Verifica se o cliente já terminou a vistoria da moto nova (ou se esta
      // é a primeira ponta a terminar) — o Bubble decide o tratamento
      const modo = modoSub ?? 'INCLUIR'
      let registroTexto = registroSubRef.current
      if (registroTexto == null) {
        const registro = await registrarVistoriaSubstituicao(contratoId, placaNovaSub.trim().toUpperCase(), placa.trim().toUpperCase(), modo)
        registroTexto = extrairMensagemRegistro(registro)
        registroSubRef.current = registroTexto
      }

      setEtapaEnvio('vistoria')

      const sn = (val: boolean | null) => val === true ? 'SIM' : 'NÃO'
      const body = omitirVazios({
        PLACA_ANTIGA: placa.trim().toUpperCase(),
        KM_ANTIGA: kmDevolucao,
        PDF_ANTIGA: pdfAntigaUrl,
        TIPO: 'SUBSTITUIÇÃO',
        VIDEO_ANTIGA: videoAntigaUrl,
        VIDEO_ANTIGA_VIOLACAO: videoViolacaoUrl,
        CONTRATO: numeroContrato,
        PLACA_NOVA: placaNovaSub.trim().toUpperCase(),
        KM_NOVA: '',
        PDF_NOVA: '',
        VIDEO_NOVA: '',
        TXT: modo,
        MSG: registroTexto,
        ONDE: 'MOTO-ANTIGA',
        MANUTENCAO: sn(perguntasDevolucao.manutencaoEstetica),
        PNEUS: sn(perguntasDevolucao.pneusMalEstado),
        VAZAMENTO: sn(perguntasDevolucao.vazamentoOleo),
        LIGANDO: sn(perguntasDevolucao.motoLigando),
        FUMACA: sn(perguntasDevolucao.fumandoEscapamento),
        FALHANDO: sn(perguntasDevolucao.falhando),
        VALVULA: sn(perguntasDevolucao.batendoValvula),
        CANO: sn(perguntasDevolucao.canoAdulterado),
        FILTRO: sn(perguntasDevolucao.semFiltroAr),
        VIOLACAO: sn(violacaoRastreamento),
        NOME: String(user?.Nome ?? user?.nome ?? ''),
        USER: String(user?.cpf ?? ''),
      })

      const endpointFinal = modo === 'RETIRAR' ? 'base-vitoria-sub-retirar' : 'base_vistoria_nova_sub'

      await chamarBubble(endpointFinal, body, 'json')

      setEtapaEnvio('concluido')
      setVistoriaSucesso(true)
      setTimeout(() => {
        limpar()
        resetDevolucao()
        resetSubNova()
        setVistoriaSucesso(false)
        setEtapaEnvio(null)
        setEnviandoVistoria(false)
      }, 3000)
    } catch (err) {
      setErro(`Erro ao enviar vistoria: ${String(err)}`)
      setEtapaEnvio(null)
      setEnviandoVistoria(false)
    }
  }

  const perguntasBasicasRespondidas = perguntasDevolucao.manutencaoEstetica !== null &&
    perguntasDevolucao.pneusMalEstado !== null &&
    perguntasDevolucao.vazamentoOleo !== null &&
    perguntasDevolucao.motoLigando !== null

  const perguntasMotorRespondidas = !perguntasDevolucao.motoLigando || (
    perguntasDevolucao.fumandoEscapamento !== null &&
    perguntasDevolucao.falhando !== null &&
    perguntasDevolucao.batendoValvula !== null &&
    perguntasDevolucao.canoAdulterado !== null &&
    perguntasDevolucao.semFiltroAr !== null
  )

  const totalPerguntasBasicas = 4
  const totalPerguntasMotor = perguntasDevolucao.motoLigando ? 5 : 0
  const respondidasBasicas = ['manutencaoEstetica', 'pneusMalEstado', 'vazamentoOleo', 'motoLigando'].filter(k => perguntasDevolucao[k] !== null).length
  const respondidasMotor = perguntasDevolucao.motoLigando
    ? PERGUNTAS_MOTOR_LIGADO.filter(p => perguntasDevolucao[p.id] !== null).length
    : 0
  const totalPerguntas = totalPerguntasBasicas + totalPerguntasMotor
  const totalRespondidas = respondidasBasicas + respondidasMotor

  async function enviarVistoriaDisponibilidade() {
    if (!videoDisponibilidadeFile || !placa || !kmDisponibilidade || !combustivelDisponibilidade) return
    setEnviandoVistoria(true)
    setErro(null)
    setEtapaEnvio('vistoria')
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('mc_user') ?? '{}') } catch { return {} } })()

      const uploadForm = new FormData()
      uploadForm.append('foto', videoDisponibilidadeFile, videoDisponibilidadeFile.name)
      const uploadRes = await fetch('/api/upload-foto', { method: 'POST', body: uploadForm })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(`Upload falhou: HTTP ${uploadRes.status}`)
      const videoUrl = uploadData.url as string

      const body = {
        placa: placa.trim().toUpperCase(),
        km: kmDisponibilidade,
        nivel_comb: combustivelDisponibilidade,
        video: videoUrl,
        NOME: String(user?.Nome ?? user?.nome ?? ''),
        USER: String(user?.cpf ?? ''),
      }

      await chamarBubble('base_vistoria_disponibilidade', body, 'json')

      setEtapaEnvio('concluido')
      setVistoriaSucesso(true)

      // Resetar após 3 segundos
      setTimeout(() => {
        setFoto(null)
        setBase64(null)
        setPlaca('')
        setAcao(null)
        setVeiculoFuncoes(null)
        setVistoriasDisponiveis([])
        setTipoSelecionado(null)
        setKmDisponibilidade('')
        setCombustivelDisponibilidade('')
        setVideoDisponibilidadeFile(null)
        setVistoriaSucesso(false)
        setEtapaEnvio(null)
        setEnviandoVistoria(false)
      }, 3000)
    } catch (err) {
      setErro(`Erro ao enviar vistoria: ${String(err)}`)
      setEtapaEnvio(null)
      setEnviandoVistoria(false)
    }
  }

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      setPodeVistoria(user?.vistoria === true)
    } catch {}
  }, [])

  function processarFotoPlaca(dataUrl: string) {
    const img = new Image()
    img.onload = () => {
      const MAX = 800
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const compressed = canvas.toDataURL('image/jpeg', 0.7)
      const b64 = compressed.split(',')[1]
      setFoto(compressed)
      setBase64(b64)
      analisarPlaca(b64)
    }
    img.src = dataUrl
  }

  function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResultado(null)
    setErro(null)
    setAcao(null)
    setVeiculoFuncoes(null)
    setVistoriasDisponiveis([])
    setTipoSelecionado(null)
    setKmDisponibilidade('')
    setCombustivelDisponibilidade('')
    setVideoDisponibilidadeFile(null)
    const reader = new FileReader()
    reader.onload = (ev) => processarFotoPlaca(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function analisarPlaca(b64: string) {
    setAnalisando(true)
    setPlaca('')
    try {
      const res = await fetch('/api/ler-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
      })
      const data = await res.json()
      if (data.placa) {
        setPlaca(data.placa)
        consultarFuncoes(data.placa)
      }
    } catch {
    } finally {
      setAnalisando(false)
    }
  }

  // Mesma trava usada em /vistoria-entrega: contrato só está apto se vier "cliente" preenchido
  async function checarContratoAptoEntrega(placaValue: string, numeroContrato: unknown) {
    if (!numeroContrato) { setContratoAptoEntrega(false); return }
    try {
      const data = await chamarBubble('vistoria-entrega', { placa: placaValue.trim().toUpperCase(), contrato: numeroContrato })
      const cliente = data.response?.cliente
      const isEmpty = cliente == null || (typeof cliente === 'object' && Object.keys(cliente).length === 0)
      setContratoAptoEntrega(!isEmpty)
    } catch {
      setContratoAptoEntrega(false)
    }
  }

  async function consultarFuncoes(placaValue: string) {
    if (!placaValue.trim()) return
    setCarregandoFuncoes(true)
    setVeiculoFuncoes(null)
    setVistoriasDisponiveis([])
    setPendenciasVeiculo([])
    setContratoAptoEntrega(false)
    try {
      const data = await chamarBubble('consulta-veiculo-funcoes', { placa: placaValue.trim().toUpperCase() })
      const vistoriasRaw: Record<string, unknown>[] = data.response?.vistorias ?? []
      setVeiculoFuncoes(data.response?.veiculo ? { ...data.response.veiculo, contrato: data.response.contrato, cliente: data.response.cliente } : null)
      setVistoriasDisponiveis(vistoriasRaw.map((v) => v.nome as string))
      setVistoriasIncluir(data.response?.['vistorias-incluir'] ?? [])
      setVistoriasRetirar(data.response?.['vistorias-retirar'] ?? [])
      setPendenciasVeiculo(data.response?.pendencia ?? [])
      const numeroContrato = (data.response?.contrato as { 'Numero ctr'?: number } | undefined)?.['Numero ctr']
      checarContratoAptoEntrega(placaValue, numeroContrato)
    } catch {
      setErro('Não foi possível consultar as funções disponíveis para esta placa.')
    } finally {
      setCarregandoFuncoes(false)
    }
  }

  async function consultar() {
    if (!placa.trim()) return
    setConsultando(true)
    setErro(null)
    setResultado(null)
    try {
      const data = await chamarBubble('status-de-movimentação', { placa: placa.trim().toUpperCase() })
      const statusmoviRaw: Movimentacao[] = data.response?.statusmovi ?? []
      const contratoRaw: Movimentacao[] = data.response?.contrato ?? []
      const statusMap = Object.fromEntries(statusmoviRaw.map((s) => [s._id as string, s]))
      const contratoMap = Object.fromEntries(contratoRaw.map((c) => [c._id as string, c]))
      const movimentos: Movimentacao[] = data.response?.status ?? []
      const enriched = movimentos.map((m) => ({
        ...m,
        _statusObj: statusMap[m.status as string] ?? null,
        _contratoObj: contratoMap[m.contrato_atrelado as string] ?? null,
      }))
      setResultado([...enriched].reverse())
    } catch {
      setErro('Nao foi possivel consultar o status.')
    } finally {
      setConsultando(false)
    }
  }

  function limpar() {
    setFoto(null)
    setBase64(null)
    setPlaca('')
    setResultado(null)
    setErro(null)
    setAcao(null)
    setVeiculoFuncoes(null)
    setVistoriasDisponiveis([])
    setTipoSelecionado(null)
    setKmDisponibilidade('')
    setCombustivelDisponibilidade('')
    setVideoDisponibilidadeFile(null)
    resetDevolucao()
    resetSubNova()
    if (inputRef.current) inputRef.current.value = ''
    pararCameraPlaca()
    setErroPlacaCamera('')
  }

  // Stepper visual para devolução
  // Na Substituição a etapa "Detalhes" (2º vídeo) não existe
  const etapasDevolucaoVisiveis = ETAPAS_DEVOLUCAO
    .map((e, idx) => ({ ...e, idx }))
    .filter(e => tipoSelecionado !== 'SUBSTITUIÇÃO' || e.idx !== 2)

  const renderStepper = () => (
    <div className="overflow-x-auto pb-2 -mx-5 px-5">
      <div className="flex items-center min-w-[600px]">
        {etapasDevolucaoVisiveis.map((etapa, i) => {
          const Icon = etapa.icon
          const isCompleted = etapa.idx < etapaDevolucao
          const isCurrent = etapa.idx === etapaDevolucao
          return (
            <div key={etapa.idx} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-red-600 text-white ring-2 ring-red-300' : 'bg-gray-200 text-gray-400'
                }`}>
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${
                  isCompleted ? 'text-green-600' : isCurrent ? 'text-red-600' : 'text-gray-400'
                }`}>{etapa.label}</span>
              </div>
              {i < etapasDevolucaoVisiveis.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mt-[-16px] ${etapa.idx < etapaDevolucao ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // Instruções laterais para desktop
  const renderInstrucoes = (titulo: string, itens: string[]) => (
    <div className="hidden lg:flex flex-col bg-slate-50 rounded-xl p-5 border space-y-3 h-fit sticky top-4">
      <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
      <ul className="space-y-2">
        {itens.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
            <span className="shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )

  // Progresso de envio reutilizável
  const renderProgressoEnvio = (corPrimaria: string) => (
    <div className="rounded-xl border bg-gradient-to-b from-slate-50 to-white p-6 space-y-5">
      <div className="flex flex-col items-center gap-4">
        <div className={`flex items-center gap-3 w-full transition-all duration-500 ${etapaEnvio === 'upload' ? 'opacity-100' : 'opacity-50'}`}>
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
            etapaEnvio === 'upload' ? `bg-${corPrimaria}-100 text-${corPrimaria}-600` : etapaEnvio === 'vistoria' || etapaEnvio === 'concluido' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
          }`}>
            {etapaEnvio === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-sm font-medium">Enviando arquivos</p>
            <p className="text-xs text-muted-foreground">Fazendo upload dos arquivos...</p>
          </div>
        </div>

        <div className={`flex items-center gap-3 w-full transition-all duration-500 ${etapaEnvio === 'vistoria' ? 'opacity-100' : etapaEnvio === 'concluido' ? 'opacity-50' : 'opacity-30'}`}>
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
            etapaEnvio === 'vistoria' ? `bg-${corPrimaria}-100 text-${corPrimaria}-600` : etapaEnvio === 'concluido' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
          }`}>
            {etapaEnvio === 'vistoria' ? <Loader2 className="w-4 h-4 animate-spin" /> : etapaEnvio === 'concluido' ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-gray-300" />}
          </div>
          <div>
            <p className="text-sm font-medium">Registrando vistoria</p>
            <p className="text-xs text-muted-foreground">Salvando dados no sistema...</p>
          </div>
        </div>

        {etapaEnvio === 'concluido' && (
          <div className="w-full text-center pt-4 border-t animate-[fadeIn_0.5s_ease-in]">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <p className="text-lg font-bold text-green-700">Vistoria concluída!</p>
            <p className="text-sm text-muted-foreground mt-1">Voltando à tela inicial...</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
    <PageHeader
      title="Funções"
      description="Tire uma foto da placa para consultar"
      icon={<Activity className="w-5 h-5 text-white" />}
    />
    <div className="px-4 sm:px-6 py-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Área da placa - mantém estreito */}
      <div className="max-w-md mx-auto space-y-6">

        {!foto ? (
          placaCameraAtiva ? (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <div ref={placaBoxRef} className="relative w-full h-64 rounded-xl overflow-hidden bg-black">
                <video ref={placaPreviewRef} muted playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Janela recortada: escurece tudo fora da moldura, sem cortar o preview da camera */}
                  <div
                    className="relative w-44 aspect-[8/7] rounded-xl"
                    style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.6)', border: '3px solid #3B82F6' }}
                  >
                    <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 rounded-tl-lg" style={{ borderColor: '#22C55E' }} />
                    <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 rounded-tr-lg" style={{ borderColor: '#22C55E' }} />
                    <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 rounded-bl-lg" style={{ borderColor: '#22C55E' }} />
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 rounded-br-lg" style={{ borderColor: '#22C55E' }} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">Encaixe a placa dentro da moldura.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={pararCameraPlaca} className="px-4">
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button onClick={capturarFotoPlaca} className="flex-1">
                  <Camera className="w-4 h-4 mr-2" /> Tirar foto
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={iniciarCameraPlaca}
                disabled={vistoriaIniciada}
                className="w-full h-48 border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-muted-foreground/30 disabled:hover:text-muted-foreground"
              >
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Tirar foto da placa</span>
                  <span className="text-xs text-muted-foreground/70">Aponte a câmera para a placa</span>
                </div>
              </button>
              {!isMobile && (
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={vistoriaIniciada} className="w-full">
                  <Upload className="w-4 h-4 mr-2" /> Enviar foto
                </Button>
              )}
              {erroPlacaCamera && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erroPlacaCamera}</div>
              )}
            </div>
          )
        ) : (
          <div className="relative rounded-xl overflow-hidden h-40">
            <img src={foto} alt="Placa" className="w-full h-full object-contain rounded-xl bg-black" />
            <button
              onClick={() => {
                if (vistoriaIniciada && !window.confirm('Há uma vistoria em andamento. Limpar a placa vai descartar tudo o que já foi feito. Deseja continuar?')) return
                limpar()
              }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFotoChange}
        />
        <canvas ref={placaCanvasRef} className="hidden" />

        <div className="space-y-2">
          <label className="text-sm font-medium">Placa</label>
          <div className="flex gap-2">
            <input
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && placa.trim() && !vistoriaIniciada) consultarFuncoes(placa) }}
              placeholder={analisando ? 'Analisando...' : 'Ex: ABC1D23'}
              disabled={analisando || vistoriaIniciada}
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30 font-mono uppercase disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => placa.trim() && consultarFuncoes(placa)}
              disabled={analisando || carregandoFuncoes || !placa.trim() || vistoriaIniciada}
              title={vistoriaIniciada ? 'Vistoria em andamento — finalize ou cancele antes de trocar a placa' : 'Buscar placa'}
            >
              <Search className="w-4 h-4" />
            </Button>
            {foto && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => base64 && analisarPlaca(base64)}
                disabled={analisando || !base64 || vistoriaIniciada}
                title={vistoriaIniciada ? 'Vistoria em andamento — finalize ou cancele antes de trocar a placa' : 'Reanalisar foto'}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
          {vistoriaIniciada && (
            <p className="text-xs text-amber-600">
              Placa travada: há uma vistoria em andamento. Finalize ou cancele antes de trocar de moto.
            </p>
          )}
        </div>

        {/* Card dados veículo */}
        {!analisando && placa && veiculoFuncoes && (
          <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#1B2043] px-4 py-2.5 flex items-center gap-2">
              <CircleDot className="w-4 h-4 text-white/70" />
              <span className="text-xs font-medium text-white">Dados do Veículo</span>
              <Badge className="ml-auto bg-white/15 text-white border-white/20 text-xs font-mono">{placa}</Badge>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-xs font-semibold">
                  {(veiculoFuncoes.status_veiculo_desc as string) ?? 'N/A'}
                </Badge>
              </div>
              {veiculoFuncoes.km != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">KM</span>
                  <span className="text-sm font-semibold">{String(veiculoFuncoes.km)} km</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!analisando && placa && pendenciasAtivas.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-800">Esta moto possui pendência ativa e não pode ser vistoriada</p>
              {pendenciasAtivas.map((p, i) => (
                <p key={String(p._id ?? i)} className="text-xs text-red-700">
                  {String(p['descrição'] ?? p.tipo ?? 'Pendência')}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Seleção de ação - cards com ícone */}
        {!analisando && placa && veiculoFuncoes && !acao && (
          <div className="space-y-2">
            <p className="text-sm font-medium">O que deseja fazer?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAcao('status')}
                className="flex flex-col items-center gap-2 bg-white border rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Status</span>
                  <span className="text-[10px] text-muted-foreground">Movimentação</span>
                </div>
              </button>
              <button
                onClick={() => podeVistoria && pendenciasAtivas.length === 0 && setAcao('vistorias')}
                className={`flex flex-col items-center gap-2 bg-white border rounded-xl px-4 py-4 shadow-sm transition-all ${
                  podeVistoria && pendenciasAtivas.length === 0 ? 'hover:shadow-md hover:border-green-300 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
                title={
                  pendenciasAtivas.length > 0
                    ? 'Esta moto possui pendência ativa e não pode ser vistoriada'
                    : podeVistoria ? undefined : 'Seu usuário não tem permissão para realizar vistorias'
                }
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Search className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Vistorias</span>
                  <span className="text-[10px] text-muted-foreground">Realizar vistoria</span>
                </div>
              </button>
              <button
                onClick={() => { setNovoKm(''); setFotoPainelKm(null); setFotoPainelKmFile(null); setMotivoSolicitacao(''); setErroSolicitacao(''); setAcao('editar-km') }}
                className="flex flex-col items-center gap-2 bg-white border rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-orange-300 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Mudar KM</span>
                  <span className="text-[10px] text-muted-foreground">Alterar quilometragem</span>
                </div>
              </button>
              <button
                onClick={() => { if (!statusLocado) { setNovoStatus(''); setKmEditarStatus(''); setMotivoSolicitacao(''); setErroSolicitacao(''); setAcao('editar-status'); buscarStatusVeiculo() } }}
                className={`flex flex-col items-center gap-2 bg-white border rounded-xl px-4 py-4 shadow-sm transition-all ${
                  statusLocado ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:border-purple-300'
                }`}
                title={statusLocado ? 'Não é possível alterar o status de uma moto LOCADO' : undefined}
              >
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Mudar Status</span>
                  <span className="text-[10px] text-muted-foreground">Alterar status da moto</span>
                </div>
              </button>
              <button
                onClick={() => { setAcao('rastreador'); testarRastreador(placa) }}
                className="flex flex-col items-center gap-2 bg-white border rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-cyan-300 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-cyan-600" />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium block">Rastreador</span>
                  <span className="text-[10px] text-muted-foreground">Testar sinal</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {!analisando && placa && acao === 'editar-km' && (
          <div className="space-y-3">
            {solicitacaoSucesso ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-sm font-medium">Solicitação enviada!</p>
              </div>
            ) : (
              <>
                <input ref={fotoPainelKmRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFotoPainelKm} />

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Foto do painel (mostrando o KM real)</label>
                  {fotoPainelKm ? (
                    <div className="relative">
                      <img src={fotoPainelKm} alt="Painel da moto" className="w-full h-44 object-cover rounded-xl border" />
                      <button
                        onClick={() => { setFotoPainelKm(null); setFotoPainelKmFile(null) }}
                        className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => fotoPainelKmRef.current?.click()} className="w-full h-44 border-2 border-dashed border-zinc-300 rounded-xl flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-orange-400 hover:text-orange-500 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
                        <Camera className="w-7 h-7 text-orange-400" />
                      </div>
                      <span className="text-sm font-medium">Fotografar painel da moto</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Novo KM</label>
                  <div className="relative">
                    <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={novoKm}
                      onChange={(e) => setNovoKm(e.target.value)}
                      placeholder={analisandoKm ? 'Lendo KM da foto...' : veiculoFuncoes?.km != null ? `Atual: ${veiculoFuncoes.km}` : 'Ex: 15230'}
                      disabled={analisandoKm}
                      className="w-full pl-9 pr-9 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60"
                    />
                    {analisandoKm && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 animate-spin" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Confira o valor lido pela IA antes de confirmar.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Motivo</label>
                  <textarea
                    value={motivoSolicitacao}
                    onChange={(e) => setMotivoSolicitacao(e.target.value)}
                    placeholder="Descreva o motivo da alteração de KM..."
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                  />
                </div>
                {erroSolicitacao && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{erroSolicitacao}</div>
                )}
                <Button
                  className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
                  disabled={!fotoPainelKmFile || !novoKm.trim() || !motivoSolicitacao.trim() || enviandoSolicitacao}
                  onClick={() => enviarSolicitacaoBase(novoKm.trim(), 'ALTERAÇÃO KM', motivoSolicitacao.trim(), fotoPainelKmFile)}
                >
                  {enviandoSolicitacao ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirmar
                </Button>
                <button onClick={() => setAcao(null)} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Escolher outra opção
                </button>
              </>
            )}
          </div>
        )}

        {!analisando && placa && acao === 'editar-status' && (
          <div className="space-y-3">
            {solicitacaoSucesso ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-sm font-medium">Solicitação enviada!</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Novo status</label>
                    {veiculoFuncoes?.status_veiculo_desc != null && (
                      <span className="text-xs text-muted-foreground">Atual: {String(veiculoFuncoes.status_veiculo_desc)}</span>
                    )}
                  </div>

                  {carregandoStatus ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando status disponíveis...
                    </div>
                  ) : statusOpcoes.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                      Nenhum status disponível.
                    </div>
                  ) : (
                    <select
                      value={novoStatus}
                      onChange={(e) => setNovoStatus(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    >
                      <option value="" disabled>Selecione um status</option>
                      {statusOpcoes
                        .filter((status) => status.trim().toUpperCase() !== String(veiculoFuncoes?.status_veiculo_desc ?? '').trim().toUpperCase())
                        .map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">KM atual da moto</label>
                  <div className="relative">
                    <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={kmEditarStatus}
                      onChange={(e) => setKmEditarStatus(e.target.value)}
                      min={veiculoFuncoes?.km != null ? Number(veiculoFuncoes.km) : undefined}
                      placeholder={veiculoFuncoes?.km != null ? `Mínimo: ${veiculoFuncoes.km}` : 'Ex: 15230'}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>
                  {veiculoFuncoes?.km != null && kmEditarStatus && Number(kmEditarStatus) < Number(veiculoFuncoes.km) && (
                    <p className="text-xs text-red-500">KM não pode ser menor que {String(veiculoFuncoes.km)} km (atual)</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Motivo</label>
                  <textarea
                    value={motivoSolicitacao}
                    onChange={(e) => setMotivoSolicitacao(e.target.value)}
                    placeholder="Descreva o motivo da alteração de status..."
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
                  />
                </div>
                {erroSolicitacao && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{erroSolicitacao}</div>
                )}
                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                  disabled={!novoStatus || !kmEditarStatus.trim() || !motivoSolicitacao.trim() || enviandoSolicitacao || (veiculoFuncoes?.km != null && Number(kmEditarStatus) < Number(veiculoFuncoes.km))}
                  onClick={() => enviarSolicitacaoBase(novoStatus, 'ALTERAÇÃO STATUS', motivoSolicitacao.trim(), null, kmEditarStatus.trim())}
                >
                  {enviandoSolicitacao ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirmar
                </Button>
                <button onClick={() => setAcao(null)} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Escolher outra opção
                </button>
              </>
            )}
          </div>
        )}

        {!analisando && placa && acao === 'status' && (
          <div className="space-y-2">
            <Button className="w-full gap-2" onClick={consultar} disabled={consultando}>
              <Search className="w-4 h-4" />
              {consultando ? 'Consultando...' : 'Consultar Status'}
            </Button>
            <button onClick={() => { setAcao(null); setResultado(null); setErro(null) }} className="text-xs text-muted-foreground hover:text-foreground underline">
              Escolher outra opção
            </button>
          </div>
        )}

        {!analisando && placa && acao === 'rastreador' && (
          <div className="space-y-3">
            {testandoRastreador && (
              <div className="bg-white border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-sm">
                <div className="w-14 h-14 rounded-full bg-cyan-100 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-cyan-600 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Testando rastreador...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Consultando sinal da moto {placa}</p>
                </div>
              </div>
            )}

            {!testandoRastreador && rastreadorInfo && rastreadorInfo.ok && (
              <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-green-50 to-white px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 border-b">
                  <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-green-800">Rastreador ativo</p>
                    <p className="text-xs text-muted-foreground truncate">Moto {placa}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8 w-full sm:w-auto justify-center shrink-0"
                    onClick={() => testarRastreador(placa)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Testar novamente
                  </Button>
                </div>
                <div className="p-4 space-y-2.5">
                  {Object.entries(rastreadorInfo.localizacoes).map(([nome, loc]) => {
                    const temSinal = loc.lat != null && loc.long != null
                    return (
                      <div
                        key={nome}
                        className={`rounded-xl border p-3 flex items-center gap-3 ${temSinal ? 'border-green-200 bg-green-50/50' : 'border-zinc-200 bg-zinc-50'}`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${temSinal ? 'bg-green-100' : 'bg-zinc-200'}`}>
                          <MapPin className={`w-4 h-4 ${temSinal ? 'text-green-600' : 'text-zinc-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {nome}
                            {loc.plataforma && <span className="text-xs font-normal text-muted-foreground"> · {loc.plataforma}</span>}
                          </p>
                          {temSinal ? (
                            <p className="text-xs text-muted-foreground truncate">
                              {enderecosRastreador[nome] ?? `${loc.lat!.toFixed(5)}, ${loc.long!.toFixed(5)}`}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-400">Sem sinal</p>
                          )}
                        </div>
                        {temSinal && (
                          <a
                            href={`https://www.google.com/maps?q=${loc.lat},${loc.long}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <Button variant="outline" size="sm" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8">
                              <MapPin className="w-3.5 h-3.5" /> Ver mapa
                            </Button>
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!testandoRastreador && rastreadorInfo && !rastreadorInfo.ok && (
              <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="w-7 h-7 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-800">Sem sinal</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Nenhum rastreador desta moto retornou localização.</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 mt-1" onClick={() => testarRastreador(placa)}>
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                  </Button>
                </div>
              </div>
            )}

            <button onClick={() => { setAcao(null); setRastreadorInfo(null); setEnderecosRastreador({}) }} className="text-xs text-muted-foreground hover:text-foreground underline">
              Escolher outra opção
            </button>
          </div>
        )}

        {/* Grid de tipos de vistoria */}
        {acao === 'vistorias' && !tipoSelecionado && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Tipo de vistoria</p>
            {carregandoFuncoes ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Carregando vistorias disponíveis...</div>
            ) : vistoriasDisponiveis.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhuma vistoria disponível para esta moto.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {TIPOS_VISTORIA.filter(({ tipo }) => tipo === 'ENTREGA' ? contratoAptoEntrega : (ALIASES_TIPO_VISTORIA[tipo] ?? [tipo]).some(alias => vistoriasDisponiveis.includes(alias))).map(({ tipo, icon: Icon, cor }) => (
                  <button
                    key={tipo}
                    onClick={() => {
                      if (tipo === 'SUBSTITUIÇÃO') {
                        // Os nomes indicam a AÇÃO PENDENTE: 'vistorias-retirar' tem registro
                        // quando essa moto ainda precisa ser retirada (INCLUIR feito, RETIRAR pendente)
                        if (pendenteRetirarCard) {
                          setModoSub('RETIRAR')
                          setPlacaEsperadaId(String(pendenteRetirarCard.placa1 ?? ''))
                        } else {
                          setModoSub('INCLUIR')
                          setPlacaEsperadaId('')
                        }
                      }
                      if (tipo === 'DISPONIBILIDADE') {
                        testarRastreador(placa)
                      }
                      if (tipo === 'ENTREGA') {
                        const contratoObj = veiculoFuncoes?.contrato as { 'Numero ctr'?: number } | undefined
                        const numeroContrato = contratoObj?.['Numero ctr'] ?? ''
                        setLinkVistoriaEntrega(`${window.location.origin}/vistoria-entrega?placa=${placa.trim().toUpperCase()}&contrato=${numeroContrato}`)
                      }
                      if (tipo === 'DEVOLUÇÃO' || tipo === 'SUBSTITUIÇÃO') {
                        // Pede a permissão de localização já no início, pra não travar o envio no final
                        capturarLocalizacaoAtual().then(loc => { if (loc) setGeoLocationDevolucao(loc) })
                      }
                      setTipoSelecionado(tipo)
                    }}
                    className="flex items-center gap-2.5 bg-white border rounded-xl px-3.5 py-4 shadow-sm hover:shadow-md hover:scale-[1.02] hover:border-foreground/20 transition-all text-left"
                  >
                    <div className={`${tipo === 'SUBSTITUIÇÃO' && pendenteRetirarCard ? 'bg-orange-500' : cor} p-2 rounded-lg shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium leading-tight">
                      {tipo === 'SUBSTITUIÇÃO' && pendenteRetirarCard ? 'SUBSTITUIÇÃO (RETIRAR)' : tipo}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setAcao(null)} className="text-xs text-muted-foreground hover:text-foreground underline">
              Escolher outra opção
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ DISPONIBILIDADE ═══════════ */}
      {acao === 'vistorias' && tipoSelecionado === 'DISPONIBILIDADE' && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Vistoria de Disponibilidade</p>
                <p className="text-[#8E92B3] text-xs mt-0.5">Preencha os dados abaixo</p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {pendenciasAtivas.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-800">Esta moto possui pendência ativa e não pode ser vistoriada</p>
                    {pendenciasAtivas.map((p, i) => (
                      <p key={String(p._id ?? i)} className="text-xs text-red-700">
                        {String(p['descrição'] ?? p.tipo ?? 'Pendência')}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {/* Desktop: duas colunas */}
              <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-5 lg:space-y-0">
                {/* Coluna esquerda: KM + Combustível */}
                <div className="space-y-5">
                  {/* KM */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">KM da moto</label>
                    <div className="relative">
                      <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="number"
                        value={kmDisponibilidade}
                        onChange={(e) => {
                          const val = e.target.value
                          setKmDisponibilidade(val)
                        }}
                        min={veiculoFuncoes?.km != null ? Number(veiculoFuncoes.km) : undefined}
                        placeholder={veiculoFuncoes?.km != null ? `Mínimo: ${veiculoFuncoes.km}` : 'Ex: 15230'}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                    {veiculoFuncoes?.km != null && kmDisponibilidade && Number(kmDisponibilidade) < Number(veiculoFuncoes.km) && (
                      <p className="text-xs text-red-500">KM não pode ser menor que {String(veiculoFuncoes.km)} km (atual)</p>
                    )}
                  </div>

                  {/* Combustível */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5 text-muted-foreground" />
                      Combustível
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {NIVEIS_COMBUSTIVEL.map((nivel) => (
                        <button
                          key={nivel}
                          onClick={() => setCombustivelDisponibilidade(nivel)}
                          className={`py-2.5 rounded-lg text-xs font-medium border transition-all ${
                            combustivelDisponibilidade === nivel
                              ? 'bg-[#1B2043] text-white border-[#1B2043] scale-105 shadow-md'
                              : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                          }`}
                        >
                          <Fuel className={`w-3 h-3 mx-auto mb-0.5 ${combustivelDisponibilidade === nivel ? 'text-white' : 'text-muted-foreground/50'}`} />
                          {nivel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Coluna direita: Vídeo */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-muted-foreground" />
                    Vídeo 360° da moto
                  </label>

                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
                    {INSTRUCOES_VIDEO.map((instrucao, i) => (
                      <div key={instrucao} className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-xs text-blue-900 leading-relaxed">{instrucao}</p>
                      </div>
                    ))}
                  </div>

                  {videoDisponibilidade ? (
                    <div className="relative">
                      <video src={videoDisponibilidade} controls className="w-full rounded-xl border max-h-72 lg:max-h-96 border-green-300" />
                      <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                      <button
                        onClick={() => { setVideoDisponibilidade(null); setVideoDisponibilidadeFile(null) }}
                        className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <GravadorVideo
                      onGravado={onVideoDisponibilidadeGravado}
                      label="Gravar vídeo 360°"
                      triggerHeightClassName="h-40 lg:h-52"
                      accentBorderClassName="hover:border-blue-400 hover:text-blue-500"
                      accentIconBgClassName="bg-blue-50"
                      accentIconClassName="text-blue-400"
                    />
                  )}
                </div>
              </div>

              {/* Teste dos rastreadores */}
              {testandoRastreador && (
                <div className="bg-white border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-cyan-100 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 text-cyan-600 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Testando rastreador...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Consultando sinal da moto {placa}</p>
                  </div>
                </div>
              )}

              {!testandoRastreador && rastreadorInfo && rastreadorInfo.ok && (
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-green-50 to-white px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 border-b">
                    <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-green-800">Rastreador ativo</p>
                      <p className="text-xs text-muted-foreground truncate">Moto {placa}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8 w-full sm:w-auto justify-center shrink-0"
                      onClick={() => testarRastreador(placa)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Testar novamente
                    </Button>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {Object.entries(rastreadorInfo.localizacoes).map(([nome, loc]) => {
                      const temSinal = loc.lat != null && loc.long != null
                      return (
                        <div
                          key={nome}
                          className={`rounded-xl border p-3 flex items-center gap-3 ${temSinal ? 'border-green-200 bg-green-50/50' : 'border-zinc-200 bg-zinc-50'}`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${temSinal ? 'bg-green-100' : 'bg-zinc-200'}`}>
                            <MapPin className={`w-4 h-4 ${temSinal ? 'text-green-600' : 'text-zinc-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium capitalize">
                              {nome}
                              {loc.plataforma && <span className="text-xs font-normal text-muted-foreground"> · {loc.plataforma}</span>}
                            </p>
                            {temSinal ? (
                              <p className="text-xs text-muted-foreground truncate">
                                {enderecosRastreador[nome] ?? `${loc.lat!.toFixed(5)}, ${loc.long!.toFixed(5)}`}
                              </p>
                            ) : (
                              <p className="text-xs text-zinc-400">Sem sinal</p>
                            )}
                          </div>
                          {temSinal && (
                            <a
                              href={`https://www.google.com/maps?q=${loc.lat},${loc.long}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="outline" size="sm" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8">
                                <MapPin className="w-3.5 h-3.5" /> Ver mapa
                              </Button>
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!testandoRastreador && rastreadorInfo && !rastreadorInfo.ok && (
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-6 flex flex-col items-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="w-7 h-7 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-800">Sem sinal</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Nenhum rastreador desta moto retornou localização. Não é possível prosseguir com a vistoria.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 mt-1" onClick={() => testarRastreador(placa)}>
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </Button>
                  </div>
                </div>
              )}

              {enviandoVistoria || vistoriaSucesso ? (
                renderProgressoEnvio('blue')
              ) : (
                <>
                  <Button
                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700 h-12 text-base"
                    disabled={!kmDisponibilidade.trim() || !combustivelDisponibilidade || !videoDisponibilidadeFile || (veiculoFuncoes?.km != null && Number(kmDisponibilidade) < Number(veiculoFuncoes.km)) || testandoRastreador || !rastreadorInfo?.ok || pendenciasAtivas.length > 0}
                    onClick={enviarVistoriaDisponibilidade}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Confirmar Vistoria
                  </Button>

                  <button onClick={() => setTipoSelecionado(null)} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Escolher outro tipo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ENTREGA ═══════════ */}
      {acao === 'vistorias' && tipoSelecionado === 'ENTREGA' && (
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg shrink-0">
                <LogIn className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Vistoria de Entrega</p>
                <p className="text-[#8E92B3] text-xs mt-0.5">Copie o link e envie para o cliente</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm font-semibold text-green-800">Link da vistoria de entrega</p>
                </div>
                <p className="text-xs text-green-700">Envie este link para o cliente fazer a vistoria de entrega.</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={linkVistoriaEntrega}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 px-3 py-2 text-xs border border-green-200 rounded-lg bg-white font-mono text-green-900 focus:outline-none"
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => {
                      navigator.clipboard.writeText(linkVistoriaEntrega).then(() => {
                        setLinkEntregaCopiado(true)
                        setTimeout(() => setLinkEntregaCopiado(false), 2000)
                      }).catch(() => {})
                    }}
                  >
                    {linkEntregaCopiado ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : 'Copiar'}
                  </Button>
                </div>
              </div>

              <button onClick={() => setTipoSelecionado(null)} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
                Escolher outro tipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ DEVOLUÇÃO ═══════════ */}
      {acao === 'vistorias' && (tipoSelecionado === 'DEVOLUÇÃO' || (tipoSelecionado === 'SUBSTITUIÇÃO' && subFase === 'antiga')) && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg shrink-0">
                <LogOut className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">
                  {tipoSelecionado === 'SUBSTITUIÇÃO' ? 'Vistoria de Substituição — Moto Antiga' : 'Vistoria de Devolução'}
                </p>
                <p className="text-[#8E92B3] text-xs mt-0.5">
                  Etapa {etapasDevolucaoVisiveis.findIndex(e => e.idx === etapaDevolucao) + 1} de {etapasDevolucaoVisiveis.length}
                </p>
              </div>
              {tipoSelecionado === 'SUBSTITUIÇÃO' && (
                <Badge className={`text-xs shrink-0 ${modoSub === 'RETIRAR' ? 'bg-orange-500/20 text-orange-200 border-orange-400/30' : 'bg-purple-500/20 text-purple-200 border-purple-400/30'}`}>
                  {modoSub}
                </Badge>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* Stepper visual */}
              {renderStepper()}

              {/* Link da vistoria de entrega do cliente (Substituição) */}
              {tipoSelecionado === 'SUBSTITUIÇÃO' && linkVistoriaSub && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-purple-600 shrink-0" />
                    <p className="text-sm font-semibold text-purple-800">Link da vistoria de entrega — moto nova ({placaNovaSub})</p>
                  </div>
                  <p className="text-xs text-purple-700">Envie este link para o cliente fazer a vistoria de entrega da moto nova.</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={linkVistoriaSub}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white font-mono text-purple-900 focus:outline-none"
                    />
                    <Button
                      variant="outline"
                      className="shrink-0 border-purple-300 text-purple-700 hover:bg-purple-100"
                      onClick={() => {
                        navigator.clipboard.writeText(linkVistoriaSub).then(() => {
                          setLinkCopiado(true)
                          setTimeout(() => setLinkCopiado(false), 2000)
                        }).catch(() => {})
                      }}
                    >
                      {linkCopiado ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : 'Copiar'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Input oculto para fotos (vídeos usam o fallback interno do GravadorVideo) */}
              <input ref={fotoDevRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFotoDevolucao} />

              {/* ── ETAPA 0: Alerta + Fotos ── */}
              {etapaDevolucao === 0 && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Instruções para Fotos', [
                    'Limpe a câmera antes de tirar as fotos.',
                    'Tire as fotos em local bem iluminado.',
                    'Mantenha distância para mostrar a moto por completo.',
                    'Todas as fotos devem ser tiradas diretamente da câmera.',
                  ])}
                  <div className="space-y-4">
                    {/* Alerta mobile */}
                    <div className="lg:hidden bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p className="text-sm font-semibold">Atenção antes de fotografar</p>
                      </div>
                      <ul className="text-xs text-amber-800 space-y-1.5 ml-7">
                        <li>Limpe a câmera antes de tirar as fotos.</li>
                        <li>Tire as fotos em local bem iluminado.</li>
                        <li>Mantenha distância para mostrar a moto por completo.</li>
                        <li>Todas as fotos devem ser tiradas diretamente da câmera.</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Tire as {FOTOS_DEVOLUCAO.length} fotos da moto:</p>
                      <Badge variant="outline" className={`text-xs ${todasFotosDevOk ? 'bg-green-50 text-green-700 border-green-200' : ''}`}>
                        {fotosDevCount}/{FOTOS_DEVOLUCAO.length} fotos
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {FOTOS_DEVOLUCAO.map(({ id, label }) => (
                        <div key={id} className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{label}</span>
                          {fotosDevolucao[id] ? (
                            <div className="relative rounded-xl overflow-hidden h-36 lg:h-44 border-2 border-green-400">
                              <img src={fotosDevolucao[id]!} alt={label} className="w-full h-full object-cover" />
                              <div className="absolute top-1.5 left-1.5 bg-green-500 rounded-full p-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                              </div>
                              <button
                                onClick={() => {
                                  setFotosDevolucao(prev => ({ ...prev, [id]: null }))
                                  setFotosDevolucaoFiles(prev => ({ ...prev, [id]: null }))
                                }}
                                className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => tirarFotoDevolucao(id)}
                              className="w-full h-36 lg:h-44 border-2 border-dashed border-zinc-300 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-red-400 hover:text-red-500 transition-colors"
                            >
                              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                                <Camera className="w-5 h-5 text-red-300" />
                              </div>
                              <span className="text-[11px] font-medium">Tirar foto</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12"
                        disabled={!todasFotosDevOk}
                        onClick={() => setEtapaDevolucao(1)}
                      >
                        Próximo: Vídeo de Avarias
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 1: Vídeo de Avarias ── */}
              {etapaDevolucao === 1 && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Vídeo de Avarias', [
                    'Grave um vídeo apontando as avarias encontradas na moto.',
                    'Fique atento a avarias em carenagens, rodas, faróis, lanternas e etc.',
                  ])}
                  <div className="space-y-4">
                    {/* Instruções mobile */}
                    <div className="lg:hidden bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                        <Video className="w-4 h-4" /> Vídeo de Avarias
                      </p>
                      <ul className="text-xs text-blue-800 space-y-1 ml-6">
                        <li>Grave um vídeo apontando as avarias encontradas na moto.</li>
                        <li>Fique atento a avarias em carenagens, rodas, faróis, lanternas e etc.</li>
                      </ul>
                    </div>

                    {videoAvarias ? (
                      <div className="relative">
                        <video src={videoAvarias} controls className="w-full rounded-xl border-2 border-green-300 max-h-72 lg:max-h-96" />
                        {enviandoVideoDevolucao ? (
                          <div className="absolute inset-0 bg-black/50 rounded-xl flex flex-col items-center justify-center gap-2 text-white">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs font-medium">Enviando vídeo...</span>
                          </div>
                        ) : (
                          <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <button onClick={() => { setVideoAvarias(null); setVideoAvariasFile(null); setVideoAvariasUrl('') }} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <GravadorVideo
                        onGravado={onVideoDevolucaoGravado(setVideoAvarias, setVideoAvariasFile, setVideoAvariasUrl)}
                        label="Gravar vídeo de avarias"
                        icon={Video}
                        triggerHeightClassName="h-40 lg:h-52"
                        accentBorderClassName="hover:border-red-400 hover:text-red-500"
                        accentIconBgClassName="bg-red-50"
                        accentIconClassName="text-red-300"
                      />
                    )}

                    {erroVideoDevolucao && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroVideoDevolucao}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(0)}>
                        <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                      </Button>
                      <Button className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12" disabled={!videoAvariasUrl || enviandoVideoDevolucao} onClick={() => setEtapaDevolucao(tipoSelecionado === 'SUBSTITUIÇÃO' ? 3 : 2)}>
                        {tipoSelecionado === 'SUBSTITUIÇÃO' ? 'Próximo: Rastreio' : 'Próximo: Vídeo Detalhes'} <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 2: Vídeo Detalhes ── */}
              {etapaDevolucao === 2 && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Vídeo de Detalhes', [
                    'Remova a tampa lateral e a tampa do filtro de ar.',
                    'Grave mostrando: Filtro de Ar, Escapamento, Rabeta e Retrovisores.',
                  ])}
                  <div className="space-y-4">
                    <div className="lg:hidden bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                        <Video className="w-4 h-4" /> Vídeo de Detalhes
                      </p>
                      <p className="text-xs text-blue-800 ml-6">Remova a tampa lateral e a tampa do filtro de ar. Grave um vídeo mostrando apenas detalhes de:</p>
                      <ul className="text-xs text-blue-800 space-y-1 ml-6 font-medium">
                        <li>Filtro de Ar</li>
                        <li>Escapamento</li>
                        <li>Rabeta</li>
                        <li>Retrovisores</li>
                      </ul>
                    </div>

                    {videoDetalhes ? (
                      <div className="relative">
                        <video src={videoDetalhes} controls className="w-full rounded-xl border-2 border-green-300 max-h-72 lg:max-h-96" />
                        {enviandoVideoDevolucao ? (
                          <div className="absolute inset-0 bg-black/50 rounded-xl flex flex-col items-center justify-center gap-2 text-white">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs font-medium">Enviando vídeo...</span>
                          </div>
                        ) : (
                          <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <button onClick={() => { setVideoDetalhes(null); setVideoDetalhesFile(null); setVideoDetalhesUrl('') }} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <GravadorVideo
                        onGravado={onVideoDevolucaoGravado(setVideoDetalhes, setVideoDetalhesFile, setVideoDetalhesUrl)}
                        label="Gravar vídeo de detalhes"
                        icon={Video}
                        triggerHeightClassName="h-40 lg:h-52"
                        accentBorderClassName="hover:border-red-400 hover:text-red-500"
                        accentIconBgClassName="bg-red-50"
                        accentIconClassName="text-red-300"
                      />
                    )}

                    {erroVideoDevolucao && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroVideoDevolucao}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(1)}>
                        <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                      </Button>
                      <Button className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12" disabled={!videoDetalhesUrl || enviandoVideoDevolucao} onClick={() => setEtapaDevolucao(3)}>
                        Próximo: Rastreamento <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 3: Violação do Rastreamento ── */}
              {etapaDevolucao === 3 && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Violação de Rastreamento', [
                    'Verifique se houve violação do sistema de rastreamento.',
                    'Se sim, grave um vídeo mostrando o sistema violado.',
                  ])}
                  <div className="space-y-4">
                    <p className="text-sm font-semibold">Possui violação do sistema de rastreamento?</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setViolacaoRastreamento(true)}
                        className={`py-5 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center gap-2 ${violacaoRastreamento === true ? 'border-red-500 bg-red-50 text-red-700 shadow-md scale-[1.02]' : 'border-zinc-200 text-muted-foreground hover:border-red-300'}`}
                      >
                        <AlertTriangle className={`w-6 h-6 ${violacaoRastreamento === true ? 'text-red-500' : 'text-zinc-300'}`} />
                        Sim
                      </button>
                      <button
                        onClick={() => { setViolacaoRastreamento(false); setVideoViolacao(null); setVideoViolacaoFile(null); setVideoViolacaoUrl(''); setErroVideoDevolucao('') }}
                        className={`py-5 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center gap-2 ${violacaoRastreamento === false ? 'border-green-500 bg-green-50 text-green-700 shadow-md scale-[1.02]' : 'border-zinc-200 text-muted-foreground hover:border-green-300'}`}
                      >
                        <CheckCircle2 className={`w-6 h-6 ${violacaoRastreamento === false ? 'text-green-500' : 'text-zinc-300'}`} />
                        Não
                      </button>
                    </div>

                    {violacaoRastreamento === true && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Grave um vídeo mostrando o sistema violado:</p>
                        {videoViolacao ? (
                          <div className="relative">
                            <video src={videoViolacao} controls className="w-full rounded-xl border-2 border-green-300 max-h-72 lg:max-h-96" />
                            {enviandoVideoDevolucao ? (
                              <div className="absolute inset-0 bg-black/50 rounded-xl flex flex-col items-center justify-center gap-2 text-white">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span className="text-xs font-medium">Enviando vídeo...</span>
                              </div>
                            ) : (
                              <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <button onClick={() => { setVideoViolacao(null); setVideoViolacaoFile(null); setVideoViolacaoUrl('') }} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <GravadorVideo
                            onGravado={onVideoDevolucaoGravado(setVideoViolacao, setVideoViolacaoFile, setVideoViolacaoUrl)}
                            label="Gravar vídeo da violação"
                            icon={Video}
                            triggerHeightClassName="h-32"
                            accentBorderClassName="hover:border-red-400 hover:text-red-500"
                            accentIconBgClassName="bg-red-50"
                            accentIconClassName="text-red-300"
                          />
                        )}
                      </div>
                    )}

                    {erroVideoDevolucao && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroVideoDevolucao}</p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(tipoSelecionado === 'SUBSTITUIÇÃO' ? 1 : 2)}>
                        <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                      </Button>
                      <Button
                        className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12"
                        disabled={violacaoRastreamento === null || enviandoVideoDevolucao || (violacaoRastreamento === true && !videoViolacaoUrl)}
                        onClick={() => setEtapaDevolucao(4)}
                      >
                        Próximo: Perguntas <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 4: Perguntas ── */}
              {etapaDevolucao === 4 && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Perguntas da Vistoria', [
                    'Responda todas as perguntas sobre o estado da moto.',
                    'Se a moto estiver ligando, perguntas adicionais serão exibidas.',
                    'Todas as perguntas são obrigatórias.',
                  ])}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" /> Perguntas da Vistoria
                      </p>
                      <Badge variant="outline" className={`text-xs ${totalRespondidas === totalPerguntas && totalPerguntas > 0 ? 'bg-green-50 text-green-700 border-green-200' : ''}`}>
                        {totalRespondidas}/{totalPerguntas} respondidas
                      </Badge>
                    </div>

                    {/* Perguntas básicas */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {[
                        { id: 'manutencaoEstetica', label: 'Precisa de manutenção estética?' },
                        { id: 'pneusMalEstado', label: 'Pneus estão em mal estado de conservação?' },
                        { id: 'vazamentoOleo', label: 'Possui vazamento de óleo?' },
                        { id: 'motoLigando', label: 'A moto está ligando?' },
                      ].map(({ id, label }) => (
                        <div key={id} className={`rounded-xl border p-3 space-y-2 transition-all ${
                          perguntasDevolucao[id] === true ? 'border-red-200 bg-red-50/30' :
                          perguntasDevolucao[id] === false ? 'border-green-200 bg-green-50/30' : 'border-zinc-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium flex-1">{label}</p>
                            {perguntasDevolucao[id] !== null && (
                              <Badge className={`text-[10px] ${perguntasDevolucao[id] ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                                {perguntasDevolucao[id] ? 'Sim' : 'Não'}
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setPergunta(id, true)}
                              className={`py-2 rounded-lg text-xs font-medium border transition-all ${perguntasDevolucao[id] === true ? 'bg-red-500 text-white border-red-500' : 'border-zinc-200 text-muted-foreground hover:border-red-300'}`}
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setPergunta(id, false)}
                              className={`py-2 rounded-lg text-xs font-medium border transition-all ${perguntasDevolucao[id] === false ? 'bg-green-500 text-white border-green-500' : 'border-zinc-200 text-muted-foreground hover:border-green-300'}`}
                            >
                              Não
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sub-perguntas se moto está ligando */}
                    {perguntasDevolucao.motoLigando === true && (
                      <div className="border-l-4 border-blue-400 rounded-r-xl bg-blue-50/30 p-4 space-y-3 mt-3">
                        <p className="text-xs font-semibold text-blue-700">Mantenha a moto ligada, acelere toda a rotação e responda:</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {PERGUNTAS_MOTOR_LIGADO.map(({ id, label }) => (
                            <div key={id} className={`rounded-xl border p-3 space-y-2 transition-all bg-white ${
                              perguntasDevolucao[id] === true ? 'border-red-200' :
                              perguntasDevolucao[id] === false ? 'border-green-200' : 'border-zinc-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium flex-1">{label}</p>
                                {perguntasDevolucao[id] !== null && (
                                  <Badge className={`text-[10px] ${perguntasDevolucao[id] ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                                    {perguntasDevolucao[id] ? 'Sim' : 'Não'}
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => setPergunta(id, true)}
                                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${perguntasDevolucao[id] === true ? 'bg-red-500 text-white border-red-500' : 'border-zinc-200 text-muted-foreground hover:border-red-300'}`}
                                >
                                  Sim
                                </button>
                                <button
                                  onClick={() => setPergunta(id, false)}
                                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${perguntasDevolucao[id] === false ? 'bg-green-500 text-white border-green-500' : 'border-zinc-200 text-muted-foreground hover:border-green-300'}`}
                                >
                                  Não
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(3)}>
                        <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                      </Button>
                      <Button
                        className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12"
                        disabled={!perguntasBasicasRespondidas || !perguntasMotorRespondidas}
                        onClick={() => setEtapaDevolucao(5)}
                      >
                        Próximo: Revisão <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 5: REVISÃO (NOVA) ── */}
              {etapaDevolucao === 5 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm font-semibold">Revisão - Confira os dados antes de prosseguir</p>
                  </div>

                  {/* Fotos */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fotos</p>
                    <div className="grid grid-cols-4 gap-2">
                      {FOTOS_DEVOLUCAO.map(({ id, label }) => (
                        <div key={id} className="space-y-1">
                          {fotosDevolucao[id] ? (
                            <div className="relative rounded-lg overflow-hidden h-20 border border-green-300">
                              <img src={fotosDevolucao[id]!} alt={label} className="w-full h-full object-cover" />
                              <div className="absolute top-1 left-1 bg-green-500 rounded-full p-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-20 rounded-lg bg-zinc-100 flex items-center justify-center">
                              <X className="w-4 h-4 text-zinc-300" />
                            </div>
                          )}
                          <p className="text-[9px] text-muted-foreground text-center truncate">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vídeos */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vídeos</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { label: 'Vídeo de Avarias', ok: !!videoAvariasFile },
                        { label: 'Vídeo de Detalhes', ok: !!videoDetalhesFile, condicional: tipoSelecionado !== 'SUBSTITUIÇÃO' },
                        { label: 'Vídeo Violação', ok: !!videoViolacaoFile, condicional: violacaoRastreamento === true },
                      ].filter(v => v.condicional !== false || v.condicional === undefined).map(({ label, ok }) => (
                        <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${ok ? 'border-green-200 bg-green-50' : 'border-zinc-200'}`}>
                          {ok ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-zinc-300 shrink-0" />}
                          <span className="font-medium">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Violação */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Violação Rastreamento</p>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      violacaoRastreamento ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
                    }`}>
                      {violacaoRastreamento ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span className="font-medium">{violacaoRastreamento ? 'Sim - Sistema violado' : 'Não - Sistema intacto'}</span>
                    </div>
                  </div>

                  {/* Perguntas */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Respostas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {Object.entries(perguntasDevolucao).map(([id, valor]) => {
                        if (valor === null) return null
                        if (!perguntasDevolucao.motoLigando && PERGUNTAS_MOTOR_LIGADO.some(p => p.id === id)) return null
                        return (
                          <div key={id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                            valor ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'
                          }`}>
                            <span className="text-muted-foreground">{PERGUNTA_LABELS[id] || id}</span>
                            <Badge className={`text-[10px] ${valor ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                              {valor ? 'Sim' : 'Não'}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(4)}>
                      <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12"
                      onClick={() => setEtapaDevolucao(6)}
                    >
                      Tudo certo, prosseguir <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ETAPA 6: KM + Observação + Enviar ── */}
              {etapaDevolucao === 6 && !enviandoVistoria && !vistoriaSucesso && (
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">
                  {renderInstrucoes('Finalização', [
                    'Informe o KM atual da moto.',
                    'Adicione observações se necessário.',
                    'Confirme para enviar a vistoria.',
                  ])}
                  <div className="space-y-4">
                    {/* KM */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">KM da moto</label>
                      <div className="relative">
                        <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="number"
                          value={kmDevolucao}
                          onChange={(e) => setKmDevolucao(e.target.value)}
                          min={veiculoFuncoes?.km != null ? Number(veiculoFuncoes.km) : undefined}
                          placeholder={veiculoFuncoes?.km != null ? `Mínimo: ${veiculoFuncoes.km}` : 'Ex: 15230'}
                          className="w-full pl-9 pr-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-red-600/30"
                        />
                      </div>
                      {veiculoFuncoes?.km != null && kmDevolucao && Number(kmDevolucao) < Number(veiculoFuncoes.km) && (
                        <p className="text-xs text-red-500">KM não pode ser menor que {String(veiculoFuncoes.km)} km (último registrado)</p>
                      )}
                    </div>

                    {/* Observação */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Observações (opcional)</label>
                      <textarea
                        value={observacaoDevolucao}
                        onChange={(e) => setObservacaoDevolucao(e.target.value)}
                        placeholder="Descreva observações adicionais, se houver..."
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-red-600/30 resize-none"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="gap-1 h-12" onClick={() => setEtapaDevolucao(5)}>
                        <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                      </Button>
                      <Button
                        className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-12"
                        disabled={!kmDevolucao.trim() || (veiculoFuncoes?.km != null && Number(kmDevolucao) < Number(veiculoFuncoes.km))}
                        onClick={tipoSelecionado === 'SUBSTITUIÇÃO' ? enviarVistoriaSubstituicao : enviarVistoriaDevolucao}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        Confirmar Vistoria
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Progresso de envio */}
              {(enviandoVistoria || vistoriaSucesso) && (tipoSelecionado === 'DEVOLUÇÃO' || tipoSelecionado === 'SUBSTITUIÇÃO') && (
                renderProgressoEnvio(tipoSelecionado === 'SUBSTITUIÇÃO' ? 'purple' : 'red')
              )}

              {/* Voltar para tipos (quando não está enviando) */}
              {!enviandoVistoria && !vistoriaSucesso && etapaDevolucao === 0 && (
                <button onClick={() => { setTipoSelecionado(null); resetDevolucao(); resetSubNova() }} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Escolher outro tipo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tailwind safelist p/ renderProgressoEnvio('purple'): bg-purple-100 text-purple-600 */}
      {/* ═══════════ SUBSTITUIÇÃO — Seleção da placa nova (1ª fase) ═══════════ */}
      {acao === 'vistorias' && tipoSelecionado === 'SUBSTITUIÇÃO' && subFase === 'placa' && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg shrink-0">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Vistoria de Substituição</p>
                <p className="text-[#8E92B3] text-xs mt-0.5">
                  {modoSub === 'RETIRAR'
                    ? `Fotografe a moto que vai voltar a substituir a ${placa.toUpperCase() || 'atual'}`
                    : `Selecione a moto nova que vai substituir a ${placa.toUpperCase() || 'atual'}`}
                </p>
              </div>
              <Badge className={`text-xs shrink-0 ${modoSub === 'RETIRAR' ? 'bg-orange-500/20 text-orange-200 border-orange-400/30' : 'bg-purple-500/20 text-purple-200 border-purple-400/30'}`}>
                {modoSub}
              </Badge>
            </div>

            <div className="p-5 space-y-4">
              {/* Foto da placa nova */}
              {fotoNovaSub ? (
                <div className="relative">
                  <img src={fotoNovaSub} alt="Placa da moto nova" className="w-full h-44 object-cover rounded-xl border" />
                  <button
                    onClick={() => { setFotoNovaSub(null); setPlacaNovaSub(''); setVeiculoNovoSub(null); setRastreadorInfo(null) }}
                    className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <PlacaCameraPicker
                  onCapture={processarFotoNovaSub}
                  label="Fotografar placa da moto nova"
                  triggerHeightClassName="h-44"
                  accentBorderClassName="hover:border-purple-400 hover:text-purple-500"
                  accentIconBgClassName="bg-purple-50"
                  accentIconClassName="text-purple-400"
                />
              )}

              {/* Analisando */}
              {(analisandoNovaSub || carregandoNovoSub) && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {analisandoNovaSub ? 'Lendo placa com IA...' : 'Consultando dados do veículo...'}
                </div>
              )}

              {/* Dados do veículo novo */}
              {!analisandoNovaSub && !carregandoNovoSub && placaNovaSub && veiculoNovoSub && (
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-[#1B2043] px-4 py-2.5 flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-white/70" />
                    <span className="text-xs font-medium text-white">Moto Nova</span>
                    <Badge className="ml-auto bg-white/15 text-white border-white/20 text-xs font-mono">{placaNovaSub}</Badge>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {modoSub === 'RETIRAR' ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Moto esperada</span>
                        <Badge variant="outline" className={`text-xs font-semibold ${
                          String(veiculoNovoSub._id) === placaEsperadaId ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {String(veiculoNovoSub._id) === placaEsperadaId ? 'CONFERE' : 'NÃO CONFERE'}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status</span>
                        <Badge variant="outline" className={`text-xs font-semibold ${
                          (veiculoNovoSub.status_veiculo_desc as string) === 'RESERVA' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {(veiculoNovoSub.status_veiculo_desc as string) ?? 'N/A'}
                        </Badge>
                      </div>
                    )}
                    {veiculoNovoSub.km != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">KM</span>
                        <span className="text-sm font-semibold">{String(veiculoNovoSub.km)} km</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bloqueio: INCLUIR precisa RESERVA | RETIRAR precisa ser a moto esperada */}
              {!analisandoNovaSub && !carregandoNovoSub && veiculoNovoSub && !motoNovaElegivel && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    {modoSub === 'RETIRAR'
                      ? 'Esta não é a moto esperada para retirar nesta substituição. Fotografe a moto correta.'
                      : <>Esta moto não pode ser usada na substituição: o status precisa ser <strong>RESERVA</strong>.</>}
                  </p>
                </div>
              )}

              {/* Teste dos rastreadores */}
              {testandoRastreador && (
                <div className="bg-white border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-cyan-100 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 text-cyan-600 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Testando rastreador...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Consultando sinal da moto {placaNovaSub}</p>
                  </div>
                </div>
              )}

              {!testandoRastreador && rastreadorInfo && rastreadorInfo.ok && (
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-green-50 to-white px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 border-b">
                    <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-green-800">Rastreador ativo</p>
                      <p className="text-xs text-muted-foreground truncate">Moto {placaNovaSub}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8 w-full sm:w-auto justify-center shrink-0"
                      onClick={() => testarRastreador(placaNovaSub)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Testar novamente
                    </Button>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {Object.entries(rastreadorInfo.localizacoes).map(([nome, loc]) => {
                      const temSinal = loc.lat != null && loc.long != null
                      return (
                        <div
                          key={nome}
                          className={`rounded-xl border p-3 flex items-center gap-3 ${temSinal ? 'border-green-200 bg-green-50/50' : 'border-zinc-200 bg-zinc-50'}`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${temSinal ? 'bg-green-100' : 'bg-zinc-200'}`}>
                            <MapPin className={`w-4 h-4 ${temSinal ? 'text-green-600' : 'text-zinc-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium capitalize">
                              {nome}
                              {loc.plataforma && <span className="text-xs font-normal text-muted-foreground"> · {loc.plataforma}</span>}
                            </p>
                            {temSinal ? (
                              <p className="text-xs text-muted-foreground truncate">
                                {enderecosRastreador[nome] ?? `${loc.lat!.toFixed(5)}, ${loc.long!.toFixed(5)}`}
                              </p>
                            ) : (
                              <p className="text-xs text-zinc-400">Sem sinal</p>
                            )}
                          </div>
                          {temSinal && (
                            <a
                              href={`https://www.google.com/maps?q=${loc.lat},${loc.long}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="outline" size="sm" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100 text-xs h-8">
                                <MapPin className="w-3.5 h-3.5" /> Ver mapa
                              </Button>
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!testandoRastreador && rastreadorInfo && !rastreadorInfo.ok && (
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-6 flex flex-col items-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="w-7 h-7 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-800">Sem sinal</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Nenhum rastreador desta moto retornou localização. Não é possível prosseguir com a substituição.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 mt-1" onClick={() => testarRastreador(placaNovaSub)}>
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </Button>
                  </div>
                </div>
              )}

              {/* Placa não encontrada */}
              {!analisandoNovaSub && !carregandoNovoSub && fotoNovaSub && placaNovaSub && !veiculoNovoSub && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">Veículo <strong>{placaNovaSub}</strong> não encontrado. Tire outra foto da placa.</p>
                </div>
              )}

              <Button
                className="w-full gap-2 bg-purple-600 hover:bg-purple-700 h-12"
                disabled={!placaNovaSub.trim() || analisandoNovaSub || carregandoNovoSub || testandoRastreador || !motoNovaElegivel || !rastreadorInfo?.ok}
                onClick={() => {
                  const contratoObj = veiculoFuncoes?.contrato as { _id?: string; 'Numero ctr'?: number } | undefined
                  const numeroContrato = contratoObj?.['Numero ctr'] ?? ''
                  const contratoId = contratoObj?._id ?? ''
                  const placaNova = placaNovaSub.trim().toUpperCase()
                  const placaAntiga = placa.trim().toUpperCase()

                  // Travas: um link com placa repetida ou contrato vazio grava a vistoria
                  // no lado errado (ou nem abre), então bloqueia antes de gerar
                  if (!placaNova || !placaAntiga) {
                    setErro('Não foi possível gerar o link: placa da moto nova ou da moto antiga não identificada.')
                    return
                  }
                  if (placaNova === placaAntiga) {
                    setErro(`A moto nova (${placaNova}) é a mesma do contrato. Fotografe a moto correta.`)
                    return
                  }
                  if (!numeroContrato || !contratoId) {
                    setErro('Não foi possível gerar o link: contrato não identificado para esta placa.')
                    return
                  }

                  const rota = modoSub === 'RETIRAR' ? 'vistoria-entrega-retirada' : 'vistoria-entrega-sub'
                  const params = new URLSearchParams({
                    placa: placaNova,
                    contrato: String(numeroContrato),
                    placaContrato: placaAntiga,
                    contratoId: String(contratoId),
                  })
                  const link = `${window.location.origin}/${rota}?${params.toString()}`
                  setErro(null)
                  setLinkVistoriaSub(link)
                  setSubFase('antiga')
                  // TODO: número fixo para teste — trocar para clienteInfo.celular antes de ir pra produção
                  fetch('/api/enviar-vistoria-whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cliente: clienteInfo?.nome_completo, celular: '15997847674', link }),
                  }).catch(() => {})
                }}
              >
                Iniciar Vistoria da Moto Antiga <ChevronRight className="w-4 h-4" />
              </Button>

              <button onClick={() => { setTipoSelecionado(null); resetDevolucao(); resetSubNova() }} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
                Escolher outro tipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SUBSTITUIÇÃO — Moto Nova (última fase) ═══════════ */}
      {/* Erro */}
      {erro && (
        <div className="max-w-md mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Erro</p>
              <p className="text-xs text-red-600 mt-0.5">{erro}</p>
            </div>
            <button onClick={() => setErro(null)} className="shrink-0 text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {resultado && (
        resultado.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhuma movimentacao encontrada para esta placa.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-semibold">Historico de movimentacao</p>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {resultado.length} registros
              </span>
            </div>

            {/* Mobile: cards */}
            <div className="sm:hidden space-y-2">
              {resultado.map((mov, i) => (
                <CardMovimentacao key={mov._id as string} mov={mov} index={i} />
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden sm:block rounded-xl border shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Entrada</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Saida</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">KM inicial</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">KM final</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Comb. saida</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Comb. retorno</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Contrato</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.map((mov, i) => (
                    <RowMovimentacao key={mov._id as string} mov={mov} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>

    <Dialog open={!!mensagemBloqueioSolicitacao} onOpenChange={(open) => { if (!open) setMensagemBloqueioSolicitacao('') }}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Não é possível registrar
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{mensagemBloqueioSolicitacao}</p>
        <Button className="w-full" onClick={() => setMensagemBloqueioSolicitacao('')}>Entendi</Button>
      </DialogContent>
    </Dialog>
    </>
  )
}
