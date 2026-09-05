'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bike, Camera, CheckCircle2, ChevronDown,
  Filter, Loader2, RefreshCw, Wrench, X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PlacaCameraPicker } from '@/components/placa-camera-picker'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { BUBBLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_AUTH_TOKEN } from '@/lib/config'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

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


type MotoAPI = {
  _id: string
  chassi: string
  cor: string
  modelo: string
  status: string
  nota_numero: string
  'nota_emissão': number
  nota_valor: number
  status_veiculo_desc: string
  'previsão de entrega': number
  Unidade: string
  nota_fornecedor?: string
  nome_fornecedor?: string
  locadora?: string
  nome_locadora?: string
  _placa?: string
  _foto?: string
  _data_recebimento?: number
  _data_instalacao?: number
  nota_arquivo?: string
  processo?: string
  pedido_compra?: string
}

const STATUS_TRANSITO  = 'COMPRA EM TRÂNSITO'
const STATUS_RECEBIDA  = 'novo'
const STATUS_INSTALADO = 'RASTREADOR INSTALADO'

function fmtTS(ts: number) {
  return format(new Date(ts), 'dd/MM/yyyy', { locale: ptBR })
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const selectClass = 'w-full px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30'

export default function RecebimentoPage() {
  const [motos, setMotos] = useState<MotoAPI[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroApi, setErroApi] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState('recebimento')

  async function carregarMotos() {
    setCarregando(true)
    setErroApi(null)
    try {
      const unidade = getUnidadesAtivas()
      const data = await chamarBubble('recebimento-de-motos', { unidade }, 'json')
      if (data.status !== 'success') throw new Error(`status: ${data.status}`)
      const recebimento = data.response.recebimento ?? []
      const pedidos: Record<string, unknown>[] = data.response.pedido ?? []
      setPedidosMap(Object.fromEntries(pedidos.map((p) => [p._id as string, p.numero as number])))
      setMotos(recebimento)
    } catch {
      setErroApi('Não foi possível carregar os dados de recebimento.')
    } finally {
      setCarregando(false)
    }
  }

  async function carregarFila() {
    setCarregando(true)
    setErroApi(null)
    try {
      const unidade = getUnidadesAtivas()
      const data = await chamarBubble('instalacao-motos', { unidade }, 'json')
      if (data.status !== 'success') throw new Error(`status: ${data.status}`)
      const fila1Raw: Record<string, unknown>[] = data.response['instalação 1'] ?? []
      const fila2Raw: Record<string, unknown>[] = data.response['instalação 2'] ?? []
      const fila1 = fila1Raw.filter((item, idx, arr) =>
        arr.findIndex((i) => i.veiculo === item.veiculo) === idx
      )
      const fila2 = fila2Raw.filter((item, idx, arr) =>
        arr.findIndex((i) => i._id === item._id) === idx
      )
      const fila4Raw: Record<string, unknown>[] = data.response['instalação 4'] ?? []
      const veiculosMap = Object.fromEntries(fila4Raw.map((v) => [v._id as string, v]))
      const filaMotos = fila2.map((veiculo) => {
        const item = fila1.find((i) => i.veiculo === veiculo._id) ?? {}
        return {
          ...veiculo,
          _id: (item as Record<string, unknown>)._id ?? veiculo._id,
          status_veiculo_desc: STATUS_RECEBIDA,
          _data_recebimento: (item as Record<string, unknown>).data,
          _placa: veiculo.placa ?? (item as Record<string, unknown>).PLACA,
        }
      })
      const instalacao3Raw: Record<string, unknown>[] = data.response['instalação 3'] ?? []
      const fila3 = instalacao3Raw.filter((item, idx, arr) =>
        arr.findIndex((i) => i.veiculo === item.veiculo) === idx
      )
      const confirmados = fila3.map((registro) => {
        const veiculo = veiculosMap[registro.veiculo as string] ?? {}
        return {
          ...veiculo,
          _id: registro._id as string,
          status_veiculo_desc: STATUS_INSTALADO,
          _placa: registro.PLACA ?? (veiculo as Record<string, unknown>).placa,
          _data_instalacao: registro['Data-confirmacao'] ?? registro.data,
        }
      })
      setMotos((prev) => [
        ...prev.filter((m) => m.status_veiculo_desc === STATUS_TRANSITO),
        ...(filaMotos as MotoAPI[]),
        ...(confirmados as MotoAPI[]),
      ])
    } catch {
      setErroApi('Não foi possível carregar a fila de instalação.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregarMotos() }, [])

  // Dialog — Recebimento
  const [ativa, setAtiva] = useState<string | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [placaInput, setPlacaInput] = useState('')
  const [lendoPlaca, setLendoPlaca] = useState(false)
  const [dadosMoto, setDadosMoto] = useState<Record<string, unknown> | null>(null)
  const [pedidoData, setPedidoData] = useState<Record<string, unknown> | null>(null)
  const [erroChassi, setErroChassi] = useState<string | null>(null)
  const [corSelecionada, setCorSelecionada] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const confirmandoRef = useRef(false)
  const [fotoFile, setFotoFile] = useState<File | null>(null)

  // Dialog — câmera filtro
  const [cameraFiltroAberto, setCameraFiltroAberto] = useState(false)
  const [buscandoPorFoto, setBuscandoPorFoto] = useState(false)
  const buscandoPorFotoRef = useRef(false)
  const [erroBuscaFoto, setErroBuscaFoto] = useState<string | null>(null)
  const [placaBusca, setPlacaBusca] = useState('')
  const [fotoBusca, setFotoBusca] = useState<string | null>(null)
  const [fotoBuscaFile, setFotoBuscaFile] = useState<File | null>(null)

  // Dialog — resultado da busca (achar-moto-base)
  const [buscandoMotoBubble, setBuscandoMotoBubble] = useState(false)
  const [motoBubbleAberto, setMotoBubbleAberto] = useState(false)
  const [resultadoMotoBubble, setResultadoMotoBubble] = useState<{
    veiculo: Record<string, unknown>
    locadora: Record<string, unknown> | null
    fornecedor: Record<string, unknown> | null
    placa: string
    fotoUrl: string
    fotoFile: File
    dadosMotoData: Record<string, unknown>
  } | null>(null)

  // Localização — decide a unidade sem depender de filtro por unidade do usuário.
  // Roda toda vez que uma moto é encontrada, sem cache.
  type UnidadeLocalizada = { id: string; nome: string; distanciaMetros: number }
  const [resolvendoUnidade, setResolvendoUnidade] = useState(false)
  const [unidadeResolvida, setUnidadeResolvida] = useState<UnidadeLocalizada | null>(null)
  const [erroUnidade, setErroUnidade] = useState<string | null>(null)
  // Mais de uma unidade no mesmo raio (ex: duas no mesmo endereço) — o operador escolhe
  const [unidadesCandidatas, setUnidadesCandidatas] = useState<UnidadeLocalizada[]>([])

  const [pedidosMap, setPedidosMap] = useState<Record<string, number>>({})

  // Dialog — Instalação
  const [ativaInstalacao, setAtivaInstalacao] = useState<string | null>(null)
  const [instalando, setInstalando] = useState(false)
  const instalandoRef = useRef(false)

  // Filtro — sub-aba Novo
  const [fNov, setFNov] = useState({ dataInicio: '', dataFim: '', chassi: '', placa: '' })
  const [fNovAberto, setFNovAberto] = useState(false)
  const fNovAtivos = Object.values(fNov).filter(Boolean).length

  // Filtro — sub-aba Confirmado
  const [fCon, setFCon] = useState({ dataInicio: '', dataFim: '' })
  const [fConAberto, setFConAberto] = useState(false)
  const fConAtivos = Object.values(fCon).filter(Boolean).length


  const naFila = motos
    .filter((m) => m.status_veiculo_desc === STATUS_RECEBIDA)
    .filter((m) => {
      if (fNov.chassi && !m.chassi?.toLowerCase().includes(fNov.chassi.toLowerCase())) return false
      if (fNov.placa  && !(m._placa ?? '').toLowerCase().includes(fNov.placa.toLowerCase())) return false
      if (m._data_recebimento) {
        const dr = new Date(m._data_recebimento)
        if (fNov.dataInicio && dr < new Date(fNov.dataInicio + 'T00:00:00')) return false
        if (fNov.dataFim    && dr > new Date(fNov.dataFim    + 'T23:59:59')) return false
      }
      return true
    })

  const instaladas = motos
    .filter((m) => m.status_veiculo_desc === STATUS_INSTALADO)
    .filter((m) => {
      if (m._data_instalacao) {
        const di = new Date(m._data_instalacao)
        if (fCon.dataInicio && di < new Date(fCon.dataInicio + 'T00:00:00')) return false
        if (fCon.dataFim    && di > new Date(fCon.dataFim    + 'T23:59:59')) return false
      }
      return true
    })

  const motoAtiva      = motos.find((m) => m._id === ativa) ?? null
  const motoInstalacao = motos.find((m) => m._id === ativaInstalacao) ?? null

  async function consultarPedido(numeroPedido: number) {
    try {
      const res = await fetch(`${SUPABASE_URL}/consultar-pedido`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ numero: numeroPedido }),
      })
      const data = await res.json()
      if (data.success) setPedidoData(data.pedido as Record<string, unknown>)
    } catch {
    }
  }

  function fecharDialog() {
    if (confirmando || lendoPlaca) return
    setAtiva(null); setFoto(null); setFotoFile(null); setPlacaInput(''); setDadosMoto(null); setPedidoData(null); setErroChassi(null); setCorSelecionada('')
    setUnidadeResolvida(null); setUnidadesCandidatas([]); setErroUnidade(null); setResultadoMotoBubble(null)
  }

  async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const blob = await (await fetch(dataUrl)).blob()
    return new File([blob], filename, { type: blob.type || 'image/jpeg' })
  }

  async function onPlacaCapturada(dataUrl: string) {
    const file = await dataUrlToFile(dataUrl, 'placa.jpg')
    setFoto(URL.createObjectURL(file))
    setFotoFile(file)
    lerPlaca(file)
  }

  function abrirCameraFiltro() {
    setCameraFiltroAberto(true)
    setErroBuscaFoto(null)
    setPlacaBusca('')
    setFotoBusca(null)
    setFotoBuscaFile(null)
    // Localização primeiro — só libera a câmera (e a chamada FIPE) depois de resolvida
    resolverUnidadeAtual()
  }

  // Busca a moto direto no Bubble pelo chassi (sem filtro de unidade) — substitui
  // o antigo `motos.find(...)` que dependia da lista pré-carregada por unidade
  async function abrirRecebimentoPorChassi(chassi: string, placa: string, dadosMotoData: Record<string, unknown>, fotoUrl: string, fotoFileData: File) {
    setBuscandoMotoBubble(true)
    setErroBuscaFoto(null)
    setResultadoMotoBubble(null)
    try {
      const data = await chamarBubble('achar-moto-base', { chassi }, 'json')
      const veiculo = data.response?.veiculo
      if (!veiculo) {
        setErroBuscaFoto(`Chassi ${chassi} não encontrado.`)
        return
      }
      if (veiculo.status_veiculo_desc !== STATUS_TRANSITO) {
        setErroBuscaFoto(`Esta moto não está disponível para recebimento (status atual: ${veiculo.status_veiculo_desc ?? 'desconhecido'}).`)
        return
      }
      setResultadoMotoBubble({
        veiculo,
        locadora: data.response?.locadora ?? null,
        fornecedor: data.response?.fornecedor ?? null,
        placa,
        fotoUrl,
        fotoFile: fotoFileData,
        dadosMotoData,
      })
      setCameraFiltroAberto(false)
      setMotoBubbleAberto(true)
    } catch {
      setErroBuscaFoto('Erro ao consultar a moto.')
    } finally {
      setBuscandoMotoBubble(false)
    }
  }

  // Sem filtro de unidade na tela: descobre onde o operador está fisicamente
  // (GPS) e compara com a localização de todas as unidades (link do Google Maps).
  // Roda do zero a cada recebimento — sem cache. Se o GPS falhar ou nenhuma
  // unidade estiver num raio de 1km, trava e não deixa receber a moto.
  async function resolverUnidadeAtual() {
    setResolvendoUnidade(true)
    setUnidadeResolvida(null)
    setUnidadesCandidatas([])
    setErroUnidade(null)
    try {
      const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('geolocation indisponível')); return }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
      })
      const { latitude, longitude } = posicao.coords

      const dataUnidades = await chamarBubble('achar-unidade', {}, 'json')
      const unidades: Record<string, unknown>[] = dataUnidades.response?.unidade ?? []
      if (unidades.length === 0) {
        setErroUnidade('Nenhuma unidade cadastrada para comparar a localização.')
        return
      }

      const res = await fetch('/api/localizar-unidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: latitude,
          lng: longitude,
          unidades: unidades.map((u) => ({
            id: u._id,
            nome: u['Nome Unidade'],
            link: u['End Link google '],
          })),
        }),
      })
      const data = await res.json()
      const dentroDoRaio: UnidadeLocalizada[] = data?.unidades ?? []
      if (!res.ok || dentroDoRaio.length === 0) {
        setErroUnidade(data?.erro ?? 'Nenhuma unidade encontrada num raio de 1km da sua localização.')
        return
      }

      // As unidades no raio precisam estar atreladas ao usuário
      // (ex: usuário vinculado só à Sorocaba, mas fisicamente em Campinas → bloqueia)
      let unidadesDoUsuario: string[] = []
      try {
        unidadesDoUsuario = (JSON.parse(localStorage.getItem('mc_unidades') ?? '[]') as { _id: string }[]).map((u) => u._id)
      } catch {}
      const permitidas = dentroDoRaio.filter((u) => unidadesDoUsuario.includes(u.id))

      if (permitidas.length === 0) {
        const nomes = dentroDoRaio.map((u) => u.nome).join(', ')
        setErroUnidade(`Você não está vinculado à unidade ${nomes}. Não é possível receber motos por ela.`)
        return
      }

      // Mais de uma unidade no mesmo raio (ex: duas no mesmo endereço) → operador escolhe
      if (permitidas.length > 1) {
        setUnidadesCandidatas(permitidas)
        return
      }

      setUnidadeResolvida(permitidas[0])
    } catch {
      setErroUnidade('Não foi possível obter sua localização. Ative o GPS e tente novamente.')
    } finally {
      setResolvendoUnidade(false)
    }
  }

  // Abre o dialog de recebimento de fato, só depois da unidade resolvida por GPS
  function continuarParaRecebimento() {
    if (!resultadoMotoBubble || !unidadeResolvida) return
    const { veiculo, placa, fotoUrl, fotoFile, dadosMotoData } = resultadoMotoBubble
    setMotoBubbleAberto(false)
    setAtiva(String(veiculo._id))
    setFoto(fotoUrl)
    setFotoFile(fotoFile)
    setPlacaInput(placa)
    setDadosMoto(dadosMotoData)
    setPedidoData(null)
    setLendoPlaca(false)
    setErroChassi(null)
    setCorSelecionada('')
    if (veiculo.processo === 'NOVO' && veiculo.pedido_compra) {
      const numeroPedido = pedidosMap[veiculo.pedido_compra as string]
      if (numeroPedido != null) consultarPedido(numeroPedido)
    }
  }

  async function onPlacaBuscaCapturada(dataUrl: string) {
    const file = await dataUrlToFile(dataUrl, 'placa-busca.jpg')
    const url = URL.createObjectURL(file)
    setFotoBusca(url)
    setFotoBuscaFile(file)
    lerPlacaBusca(file, url)
  }

  async function lerPlacaBusca(file: File, fotoUrl: string) {
    setBuscandoPorFoto(true)
    setErroBuscaFoto(null)
    setPlacaBusca('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/ler-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })
      const data = await res.json()
      if (data.placa) setPlacaBusca(data.placa)
      if (data.dadosMoto) {
        const chassi = (data.dadosMoto?.data?.veiculo?.chassi as string | undefined)?.toUpperCase().trim()
        if (chassi) abrirRecebimentoPorChassi(chassi, data.placa ?? '', data.dadosMoto, fotoUrl, file)
        else setErroBuscaFoto('Chassi não identificado. Corrija a placa e consulte novamente.')
      } else {
        setErroBuscaFoto('Não foi possível ler a placa. Corrija manualmente e consulte.')
      }
    } catch {
      setErroBuscaFoto('Erro ao processar a foto.')
    } finally {
      setBuscandoPorFoto(false)
    }
  }

  async function consultarPlacaBusca(placa: string) {
    if (!placa.trim() || !fotoBusca || !fotoBuscaFile) return
    if (buscandoPorFotoRef.current) return
    buscandoPorFotoRef.current = true
    setBuscandoPorFoto(true)
    setErroBuscaFoto(null)
    try {
      const res = await fetch('/api/ler-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa }),
      })
      const data = await res.json()
      if (data.dadosMoto) {
        const chassi = (data.dadosMoto?.data?.veiculo?.chassi as string | undefined)?.toUpperCase().trim()
        if (chassi) abrirRecebimentoPorChassi(chassi, placa, data.dadosMoto, fotoBusca, fotoBuscaFile)
        else setErroBuscaFoto('Chassi não encontrado para esta placa.')
      } else {
        setErroBuscaFoto('Placa não encontrada na FIPE.')
      }
    } catch {
      setErroBuscaFoto('Erro ao consultar FIPE.')
    } finally {
      buscandoPorFotoRef.current = false
      setBuscandoPorFoto(false)
    }
  }

  async function lerPlaca(file: File) {
    setLendoPlaca(true)
    setPlacaInput('')
    setDadosMoto(null)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/ler-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      const data = await res.json()

      if (data.placa) setPlacaInput(data.placa)
      if (data.dadosMoto) {
        setDadosMoto(data.dadosMoto)

        const chassiFipe = (data.dadosMoto?.data?.veiculo?.chassi as string | undefined)?.toUpperCase().trim()
        // motos achadas pelo fluxo novo (achar-moto-base) não estão na lista `motos`
        // (que é filtrada por unidade) — usa o resultado da busca como alternativa
        const chassiMotoLista = motos.find((m) => m._id === ativa)?.chassi
        const chassiMotoBubble = resultadoMotoBubble?.veiculo.chassi as string | undefined
        const chassiMoto = (chassiMotoLista ?? chassiMotoBubble)?.toUpperCase().trim()

        if (chassiFipe && chassiMoto && chassiFipe !== chassiMoto) {
          setErroChassi(`Placa não pertence a esta moto. Chassi FIPE: ${chassiFipe} · Chassi esperado: ${chassiMoto}`)
        } else {
          setErroChassi(null)
        }
      }
    } catch {
    } finally {
      setLendoPlaca(false)
    }
  }
  async function confirmarRecebimento() {
    if (!ativa || !foto || !fotoFile || !placaInput.trim() || !corSelecionada) return
    if (!unidadeResolvida) return // sem localização confirmada, não recebe
    if (confirmandoRef.current) return
    confirmandoRef.current = true
    setConfirmando(true)
    try {
      // 1. upload da foto via API route (evita CORS)
      const uploadForm = new FormData()
      uploadForm.append('foto', fotoFile, fotoFile.name)
      const uploadRes = await fetch('/api/upload-foto', { method: 'POST', body: uploadForm })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(`upload-foto HTTP ${uploadRes.status}`)
      const fotoUrl = uploadData.url as string

      // 2. chamar o workflow com a URL da foto
      const veiculo = (dadosMoto as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      const veiculoDados = veiculo?.veiculo as Record<string, unknown> | undefined

      const receberBody: Record<string, unknown> = {
        moto: ativa,
        placa: placaInput.trim().toUpperCase(),
        cor: corSelecionada,
        'foto-entrega': fotoUrl,
        // Unidade decidida por localização (GPS), não mais por filtro do usuário
        unidade: unidadeResolvida?.id ?? '',
      }
      if (veiculoDados?.marca_modelo) receberBody.modelo = String(veiculoDados.marca_modelo)
      if (veiculoDados?.ano)          receberBody['ano-modelo'] = String(veiculoDados.ano)
      if (veiculoDados?.uf)           receberBody.estado = String(veiculoDados.uf)
      if (veiculoDados?.municipio)    receberBody.cidade = String(veiculoDados.municipio)
      if (veiculoDados?.combustivel)  receberBody.combustivel = String(veiculoDados.combustivel)

      await chamarBubble('receber-moto', receberBody, 'form')

      const pagamento = pedidoData?.pagamento as Record<string, unknown>
      if (pagamento?.forma === 'pix_recebimento' && pagamento?.pago === 0) {
        // motos achadas pelo fluxo novo (achar-moto-base) não estão em `motos`
        // (lista filtrada por unidade) — usa o resultado da busca como alternativa
        const chassiMoto = motos.find((m) => m._id === ativa)?.chassi ?? (resultadoMotoBubble?.veiculo.chassi as string | undefined)
        await fetch(`${SUPABASE_URL}/receber-veiculo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'x-api-key': BUBBLE_KEY,
          },
          body: JSON.stringify({ pedido_numero: pedidoData?.numero, chassi: chassiMoto }),
        })
      }

      setMotos((prev) => prev.map((m) =>
        m._id === ativa
          ? { ...m, status_veiculo_desc: STATUS_RECEBIDA, _foto: foto, _placa: placaInput.trim().toUpperCase(), cor: corSelecionada, _data_recebimento: Date.now() }
          : m
      ))
      setAtiva(null); setFoto(null); setFotoFile(null); setPlacaInput(''); setCorSelecionada('')
      setUnidadeResolvida(null); setUnidadesCandidatas([]); setErroUnidade(null); setResultadoMotoBubble(null)
    } catch {
    } finally {
      confirmandoRef.current = false
      setConfirmando(false)
    }
  }

  function abrirDialogInstalacao(id: string) { setAtivaInstalacao(id) }
  function fecharDialogInstalacao() { if (instalando) return; setAtivaInstalacao(null) }
  async function confirmarInstalacao() {
    if (!ativaInstalacao) return
    if (instalandoRef.current) return
    instalandoRef.current = true
    setInstalando(true)
    try {
      await chamarBubble('confirmar-instalação', { 'moto-instacao': ativaInstalacao }, 'form')

      setMotos((prev) => prev.map((m) =>
        m._id === ativaInstalacao
          ? { ...m, status_veiculo_desc: STATUS_INSTALADO, _data_instalacao: Date.now() }
          : m
      ))
      setAtivaInstalacao(null)
    } catch {
    } finally {
      instalandoRef.current = false
      setInstalando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Carregando...
      </div>
    )
  }

  if (erroApi) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        {erroApi}
      </div>
    )
  }

  const totalRecebida  = motos.filter((m) => m.status_veiculo_desc === STATUS_RECEBIDA).length
  const totalInstalado = motos.filter((m) => m.status_veiculo_desc === STATUS_INSTALADO).length

  return (
    <>
      <PageHeader
        title="Recebimento de Motos"
        description="Base Central"
        icon={<Bike className="w-5 h-5 text-white" />}
      />
    <div className="max-w-2xl mx-auto space-y-6 pt-6">

      {/* Tabs */}
      <div className="px-4 sm:px-6 pb-8">
        <Tabs value={abaAtiva} onValueChange={(v) => { setAbaAtiva(v); if (v === 'fila') carregarFila() }}>
          <TabsList className="w-full h-[35px]">
            <TabsTrigger value="recebimento" className="flex-1 gap-2 text-sm font-semibold">
              Recebimento
            </TabsTrigger>
            <TabsTrigger value="fila" className="flex-1 gap-2 text-sm font-semibold">
              Fila de Instalação
              {totalRecebida > 0 && (
                <Badge className="bg-[#1B2043] text-[#8E92B3] border-[#2A2F5B] text-xs">
                  {totalRecebida}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ABA RECEBIMENTO */}
          <TabsContent value="recebimento" className="mt-5">
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
              <div className="w-20 h-20 rounded-2xl bg-[#1B2043] flex items-center justify-center">
                <Camera className="w-9 h-9 text-white" />
              </div>
              <div>
                <p className="text-base font-semibold">Fotografe a placa da moto</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  A moto é localizada automaticamente, sem precisar escolher a unidade.
                </p>
              </div>
              <Button onClick={abrirCameraFiltro} size="lg" className="bg-[#1B2043] hover:bg-[#262B59] text-white gap-2 mt-2">
                <Camera className="w-4 h-4" />
                Buscar moto por foto
              </Button>
            </div>
          </TabsContent>

          {/* ABA FILA DE INSTALAÇÃO */}
          <TabsContent value="fila" className="mt-4">

            <Tabs defaultValue="novo">
              <TabsList className="w-full h-11">
                <TabsTrigger value="novo" className="flex-1 gap-2 text-sm font-semibold">
                  Novo
                  {totalRecebida > 0 && (
                    <Badge className="bg-[#1B2043] text-[#8E92B3] border-[#2A2F5B] text-xs">
                      {totalRecebida}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="confirmado" className="flex-1 gap-2 text-sm font-semibold">
                  Confirmado
                  {totalInstalado > 0 && (
                    <Badge className="bg-[#1B2043] text-[#8E92B3] border-[#2A2F5B] text-xs">
                      {totalInstalado}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* SUB-ABA NOVO */}
              <TabsContent value="novo" className="mt-5 space-y-4">

                <div>
                  <button
                    onClick={() => setFNovAberto((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Filter className="w-4 h-4" />
                    Filtros
                    {fNovAtivos > 0 && (
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-xs px-1.5 h-4">{fNovAtivos}</Badge>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform ${fNovAberto ? 'rotate-180' : ''}`} />
                  </button>

                  {fNovAberto && (
                    <div className="mt-3 p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Chassi</label>
                          <div className="relative">
                            <input type="text" value={fNov.chassi} onChange={(e) => setFNov((p) => ({ ...p, chassi: e.target.value }))} placeholder="Buscar..." className={`${selectClass} font-mono pr-8`} />
                            {fNov.chassi && <button onClick={() => setFNov((p) => ({ ...p, chassi: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Placa</label>
                          <div className="relative">
                            <input type="text" value={fNov.placa} onChange={(e) => setFNov((p) => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="Buscar..." className={`${selectClass} font-mono pr-8`} />
                            {fNov.placa && <button onClick={() => setFNov((p) => ({ ...p, placa: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Data de recebimento</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="date" value={fNov.dataInicio} onChange={(e) => setFNov((p) => ({ ...p, dataInicio: e.target.value }))} className={`${selectClass} min-w-0 flex-1`} />
                          <span className="text-xs text-muted-foreground shrink-0">até</span>
                          <input type="date" value={fNov.dataFim} onChange={(e) => setFNov((p) => ({ ...p, dataFim: e.target.value }))} className={`${selectClass} min-w-0 flex-1`} />
                        </div>
                      </div>
                      {fNovAtivos > 0 && (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setFNov({ dataInicio: '', dataFim: '', chassi: '', placa: '' })}>
                          <X className="w-3.5 h-3.5 mr-1.5" />Limpar filtros
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {naFila.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma moto aguardando instalação</div>
                ) : (
                  naFila.map((moto) => (
                    <Card key={moto._id} className="shadow-sm">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-base">{moto.modelo} · {moto.cor}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-1">{moto.chassi}</p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700 border-blue-300 shrink-0">Compra Recebida</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          {moto._data_recebimento && (
                            <div><p className="text-muted-foreground text-xs mb-0.5">Data do recebimento</p><p className="font-medium">{fmtTS(moto._data_recebimento)}</p></div>
                          )}
                          {moto.nota_arquivo && (
                            <div><p className="text-muted-foreground text-xs mb-0.5">Nota fiscal</p><a href={`https:${moto.nota_arquivo}`} target="_blank" rel="noreferrer" className="inline-flex items-center h-7 px-3 mt-0.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">Ver nota</a></div>
                          )}
                          {moto._placa && <div><p className="text-muted-foreground text-xs mb-0.5">Placa</p><p className="font-mono font-medium">{moto._placa}</p></div>}
                        </div>
                        <Button variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => abrirDialogInstalacao(moto._id)}>
                          <Wrench className="w-4 h-4" />Confirmar Instalação
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* SUB-ABA CONFIRMADO */}
              <TabsContent value="confirmado" className="mt-5 space-y-4">

                <div>
                  <button
                    onClick={() => setFConAberto((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Filter className="w-4 h-4" />
                    Filtros
                    {fConAtivos > 0 && (
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-xs px-1.5 h-4">{fConAtivos}</Badge>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform ${fConAberto ? 'rotate-180' : ''}`} />
                  </button>

                  {fConAberto && (
                    <div className="mt-3 p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Data de instalação</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="date" value={fCon.dataInicio} onChange={(e) => setFCon((p) => ({ ...p, dataInicio: e.target.value }))} className={`${selectClass} min-w-0 flex-1`} />
                          <span className="text-xs text-muted-foreground shrink-0">até</span>
                          <input type="date" value={fCon.dataFim} onChange={(e) => setFCon((p) => ({ ...p, dataFim: e.target.value }))} className={`${selectClass} min-w-0 flex-1`} />
                        </div>
                      </div>
                      {fConAtivos > 0 && (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setFCon({ dataInicio: '', dataFim: '' })}>
                          <X className="w-3.5 h-3.5 mr-1.5" />Limpar filtros
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {instaladas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma instalação confirmada</div>
                ) : (
                  instaladas.map((moto) => (
                    <Card key={moto._id} className="shadow-sm">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-base">{moto.modelo} · {moto.cor}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-1">{moto.chassi}</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700 border-green-300 shrink-0">Rastreador Instalado</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          {moto._data_instalacao && (
                            <div><p className="text-muted-foreground text-xs mb-0.5">Data de instalação</p><p className="font-medium">{fmtTS(moto._data_instalacao)}</p></div>
                          )}
                          {moto.nota_arquivo && (
                            <div><p className="text-muted-foreground text-xs mb-0.5">Nota fiscal</p><a href={`https:${moto.nota_arquivo}`} target="_blank" rel="noreferrer" className="inline-flex items-center h-7 px-3 mt-0.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">Ver nota</a></div>
                          )}
                          {moto._placa && <div><p className="text-muted-foreground text-xs mb-0.5">Placa</p><p className="font-mono font-medium">{moto._placa}</p></div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog — Recebimento */}
      <Dialog open={ativa !== null} onOpenChange={(open) => { if (!open) fecharDialog() }}>
        <DialogContent showCloseButton={!confirmando} className="flex flex-col max-h-[90dvh] sm:max-w-lg p-0 gap-0">
          <div className="px-6 pt-6 pb-3 shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Receber Moto
                {pedidoData && (() => {
                  const forma = (pedidoData.pagamento as Record<string, unknown>)?.forma
                  if (forma === 'pix_recebimento') return <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs font-medium">PIX/Receb</Badge>
                  if (forma === 'voucher') return <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs font-medium">Voucher</Badge>
                  return null
                })()}
              </DialogTitle>
              {(() => {
                // motoAtiva vem da lista carregada por unidade; motos achadas pelo
                // fluxo novo (sem filtro de unidade) não estão nela — usa o resultado
                // da busca por chassi como alternativa
                const info = motoAtiva ?? (resultadoMotoBubble?.veiculo as MotoAPI | undefined)
                if (!info) return null
                return (
                  <p className="text-sm text-muted-foreground">
                    {info.modelo} · {info.cor}
                    <span className="block font-mono text-xs mt-0.5">{info.chassi}</span>
                  </p>
                )
              })()}
              {unidadeResolvida && (
                <Badge className="bg-green-50 text-green-700 border-green-200 text-xs font-medium w-fit">
                  Recebendo em: {unidadeResolvida.nome}
                </Badge>
              )}
            </DialogHeader>
          </div>
          <Separator />

          {/* Área rolável */}
          <div className="flex-1 overflow-x-hidden overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Foto da placa</p>
              {foto ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt="Foto da placa" className="w-full h-36 object-cover rounded-lg border" />
                  {lendoPlaca && (
                    <div className="absolute inset-0 bg-black/40 rounded-lg flex flex-col items-center justify-center gap-2 text-white">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-medium">Lendo placa...</span>
                    </div>
                  )}
                  {!confirmando && !lendoPlaca && (
                    <button onClick={() => { setFoto(null); setPlacaInput(''); setErroChassi(null) }} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <PlacaCameraPicker
                  onCapture={onPlacaCapturada}
                  triggerHeightClassName="h-28"
                  accentBorderClassName="hover:border-blue-400 hover:text-blue-500"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Placa da moto</label>
              <div className="relative">
                <input
                  type="text"
                  value={placaInput}
                  onChange={(e) => setPlacaInput(e.target.value.toUpperCase())}
                  placeholder={lendoPlaca ? 'Lendo...' : 'Ex: ABC1D23'}
                  maxLength={8}
                  readOnly
                  disabled={confirmando || lendoPlaca}
                  className="w-full px-3 py-2 text-sm font-mono uppercase border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-50"
                />
                {lendoPlaca && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Cor da moto <span className="text-red-500">*</span>
              </label>
              <select
                value={corSelecionada}
                onChange={(e) => setCorSelecionada(e.target.value)}
                disabled={confirmando}
                className={`w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-50 ${!corSelecionada ? 'text-muted-foreground' : ''}`}
              >
                <option value="">Selecione a cor...</option>
                <option>Preta</option>
                <option>Branca</option>
                <option>Vermelha</option>
                <option>Azul</option>
                <option>Cinza</option>
                <option>Prata</option>
                <option>Verde</option>
                <option>Amarela</option>
                <option>Laranja</option>
                <option>Marrom</option>
              </select>
            </div>

            {dadosMoto && !lendoPlaca && (() => {
              const v = (dadosMoto as Record<string, unknown>)?.data as Record<string, unknown> | undefined
              const veiculo = v?.veiculo as Record<string, unknown> | undefined
              const fipe = (v?.fipes as Record<string, unknown>[] | undefined)?.[0]
              if (!veiculo && !fipe) return null
              return (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  {veiculo && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Veículo</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {!!veiculo.marca_modelo && <div><p className="text-muted-foreground">Modelo</p><p className="font-medium">{String(veiculo.marca_modelo)}</p></div>}
                        {!!veiculo.ano && <div><p className="text-muted-foreground">Ano</p><p className="font-medium">{String(veiculo.ano)}</p></div>}
                        {!!veiculo.cor && <div><p className="text-muted-foreground">Cor</p><p className="font-medium">{String(veiculo.cor)}</p></div>}
                        {!!veiculo.combustivel && <div><p className="text-muted-foreground">Combustível</p><p className="font-medium">{String(veiculo.combustivel)}</p></div>}
                        {!!veiculo.chassi && <div><p className="text-muted-foreground">Chassi</p><p className="font-medium font-mono text-xs">{String(veiculo.chassi)}</p></div>}
                        {!!(veiculo.municipio || veiculo.uf) && <div><p className="text-muted-foreground">Localização</p><p className="font-medium">{[veiculo.municipio, veiculo.uf].filter(Boolean).join(' — ')}</p></div>}
                      </div>
                    </>
                  )}
                  {fipe && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tabela FIPE</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {!!fipe.marca_modelo && <div><p className="text-muted-foreground">Modelo FIPE</p><p className="font-medium">{String(fipe.marca_modelo)}</p></div>}
                        {fipe.valor != null && <div><p className="text-muted-foreground">Valor FIPE</p><p className="font-medium text-green-700">{moeda(Number(fipe.valor))}</p></div>}
                        {!!fipe.codigo && <div><p className="text-muted-foreground">Código FIPE</p><p className="font-medium font-mono">{String(fipe.codigo)}</p></div>}
                      </div>
                    </>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Rodapé fixo */}
          <div className="px-6 pb-6 pt-3 shrink-0 space-y-3 border-t bg-background">
            {erroChassi && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                ⚠ {erroChassi}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={fecharDialog} disabled={confirmando || lendoPlaca}>Cancelar</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={confirmarRecebimento} disabled={!foto || !placaInput.trim() || !corSelecionada || confirmando || lendoPlaca || !!erroChassi || !unidadeResolvida}>
                {confirmando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Recebimento</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Câmera filtro */}
      <Dialog open={cameraFiltroAberto} onOpenChange={(open) => { if (!open && !buscandoPorFoto && !buscandoMotoBubble) { setCameraFiltroAberto(false) } }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[90dvh]">
          <div className="px-6 pt-6 pb-3 shrink-0">
            <DialogHeader>
              <DialogTitle>Buscar moto por foto</DialogTitle>
              <p className="text-sm text-muted-foreground">Fotografe a placa para identificar a moto automaticamente.</p>
            </DialogHeader>
          </div>
          <Separator />
          <div className="px-6 py-4 space-y-4 overflow-x-hidden overflow-y-auto flex-1">
            {/* Localização primeiro — só libera a câmera/FIPE depois de resolvida */}
            {resolvendoUnidade && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Localizando sua unidade...</p>
              </div>
            )}

            {!resolvendoUnidade && erroUnidade && (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 w-full">⚠ {erroUnidade}</p>
                <Button variant="outline" size="sm" onClick={resolverUnidadeAtual}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Tentar novamente
                </Button>
              </div>
            )}

            {/* Mais de uma unidade na mesma localização — operador escolhe qual */}
            {!resolvendoUnidade && !erroUnidade && !unidadeResolvida && unidadesCandidatas.length > 1 && (
              <div className="space-y-3 py-2">
                <div className="text-center">
                  <p className="text-sm font-semibold">Mais de uma unidade aqui</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione em qual unidade você está recebendo a moto.
                  </p>
                </div>
                <div className="space-y-2">
                  {unidadesCandidatas.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setUnidadeResolvida(u); setUnidadesCandidatas([]) }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 border rounded-lg text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <span className="text-sm font-medium">{u.nome}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{Math.round(u.distanciaMetros)}m</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!resolvendoUnidade && !erroUnidade && unidadeResolvida && (
              <>
                <Badge className="bg-green-50 text-green-700 border-green-200 text-xs font-medium">
                  Unidade: {unidadeResolvida.nome}
                </Badge>

                {fotoBusca ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoBusca} alt="Foto da placa" className="w-full h-36 object-cover rounded-lg border" />
                    {(buscandoPorFoto || buscandoMotoBubble) && (
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex flex-col items-center justify-center gap-2 text-white">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-sm font-medium">{buscandoPorFoto ? 'Consultando FIPE...' : 'Buscando moto...'}</span>
                      </div>
                    )}
                    {!buscandoPorFoto && !buscandoMotoBubble && (
                      <button onClick={() => { setFotoBusca(null); setFotoBuscaFile(null); setPlacaBusca(''); setErroBuscaFoto(null) }} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <PlacaCameraPicker
                    onCapture={onPlacaBuscaCapturada}
                    triggerHeightClassName="h-28"
                    accentBorderClassName="hover:border-blue-400 hover:text-blue-500"
                  />
                )}

                {fotoBusca && !buscandoPorFoto && !buscandoMotoBubble && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Placa detectada</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={placaBusca}
                        onChange={(e) => setPlacaBusca(e.target.value.toUpperCase())}
                        placeholder="Ex: ABC1D23"
                        maxLength={8}
                        className="flex-1 px-3 py-2 text-sm font-mono uppercase border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => consultarPlacaBusca(placaBusca)} disabled={!placaBusca.trim()}>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Consultar FIPE
                      </Button>
                    </div>
                  </div>
                )}

                {erroBuscaFoto && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">⚠ {erroBuscaFoto}</p>
                )}
              </>
            )}
          </div>
          <div className="px-6 pb-6 pt-0">
            <Button variant="outline" className="w-full" onClick={() => setCameraFiltroAberto(false)} disabled={buscandoPorFoto || buscandoMotoBubble}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Resultado da busca (achar-moto-base) */}
      <Dialog open={motoBubbleAberto} onOpenChange={(open) => { if (!open) { setMotoBubbleAberto(false); setResultadoMotoBubble(null); setUnidadeResolvida(null); setUnidadesCandidatas([]); setErroUnidade(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Moto localizada</DialogTitle>
          </DialogHeader>
          {resultadoMotoBubble && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Placa</p>
                  <p className="font-mono font-semibold">{resultadoMotoBubble.placa || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Chassi</p>
                  <p className="font-mono font-semibold">{String(resultadoMotoBubble.veiculo.chassi ?? '—')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Modelo</p>
                  <p className="font-semibold">{String(resultadoMotoBubble.veiculo.modelo ?? '—')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cor</p>
                  <p className="font-semibold">{String(resultadoMotoBubble.veiculo.cor ?? '—')}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Locadora</p>
                <p className="text-sm font-semibold">{String(resultadoMotoBubble.locadora?.nome ?? 'Não informada')}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fornecedor</p>
                <p className="text-sm font-semibold">{String(resultadoMotoBubble.fornecedor?.['nome social'] ?? 'Não informado')}</p>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unidade (por localização)</p>
                {resolvendoUnidade && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Obtendo sua localização...
                  </div>
                )}
                {!resolvendoUnidade && unidadeResolvida && (
                  <p className="text-sm font-semibold text-green-700">
                    {unidadeResolvida.nome} <span className="text-xs text-muted-foreground font-normal">({Math.round(unidadeResolvida.distanciaMetros)}m)</span>
                  </p>
                )}
                {!resolvendoUnidade && erroUnidade && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">⚠ {erroUnidade}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setMotoBubbleAberto(false); setResultadoMotoBubble(null); setUnidadeResolvida(null); setUnidadesCandidatas([]); setErroUnidade(null) }}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={resolvendoUnidade || !unidadeResolvida}
                  onClick={continuarParaRecebimento}
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog — Instalação */}
      <Dialog open={ativaInstalacao !== null} onOpenChange={(open) => { if (!open) fecharDialogInstalacao() }}>
        <DialogContent showCloseButton={!instalando} className="max-w-[calc(100%-1rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Instalação do Rastreador</DialogTitle>
            {motoInstalacao && (
              <p className="text-sm text-muted-foreground">
                {motoInstalacao.modelo} · {motoInstalacao.cor}
                <span className="block font-mono text-xs mt-0.5">{motoInstalacao.chassi}</span>
                {motoInstalacao._placa && <span className="block font-mono font-medium text-foreground mt-0.5">{motoInstalacao._placa}</span>}
              </p>
            )}
          </DialogHeader>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Confirme que o rastreador foi instalado e testado nesta moto. Após confirmar, ela estará liberada para cadastro no sistema.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={fecharDialogInstalacao} disabled={instalando}>Cancelar</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={confirmarInstalacao} disabled={instalando}>
              {instalando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Instalação</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  )
}
