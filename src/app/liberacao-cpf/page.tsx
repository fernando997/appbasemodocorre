'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  RotateCcw,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PlacaCameraPicker } from '@/components/placa-camera-picker'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const USUARIO_LOGADO = 'Operador Teste'

type Registro = Record<string, unknown>

type ResultadoLiberacao = {
  contrato: Registro | null
  parcelas: Registro[]
  vistorias: Registro[]
  fast_entrega: Registro[]
  indicacao: Registro[]
}

type Validacao = {
  podeLiberar: boolean
  motivos: string[]
}

function validarLiberacao(r: ResultadoLiberacao): Validacao {
  const motivos: string[] = []
  const inicioDoDia = (ts: number) => {
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const hoje = inicioDoDia(Date.now())

  const parcelaVencida = r.parcelas.some((p) => {
    const vencimento = p['vencimento']
    return p['status'] === 'GERADO' && typeof vencimento === 'number' && inicioDoDia(vencimento) < hoje
  })
  if (parcelaVencida) {
    motivos.push('Existe uma parcela vencida para este contrato.')
  }

  if (r.vistorias.length === 0 && r.fast_entrega.length === 0) {
    motivos.push('Nenhuma vistoria foi realizada nesta moto nas últimas 24 horas.')
  }

  const ultimaIndicacao = r.indicacao[r.indicacao.length - 1]
  if (!ultimaIndicacao || ultimaIndicacao['tipo'] !== 'INCLUSÃO') {
    motivos.push('Não há indicação de condutor ativa para este contrato.')
  }

  return { podeLiberar: motivos.length === 0, motivos }
}

type RegistroLiberado = {
  resultado: ResultadoLiberacao
  placa: string
  cpf: string
  operador: string
  hora: string
}

function obterUsuarioBubble(): string {
  try {
    const raw = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
    return raw?.user ?? ''
  } catch {
    return ''
  }
}

async function consultarLiberacao(placa: string, cpf: string): Promise<ResultadoLiberacao> {
  const data = await chamarBubble('liberacao_veiculo', { placa, cpf })
  const response = data.response ?? data
  return {
    contrato: response.contrato ?? null,
    parcelas: response.parcelas ?? [],
    vistorias: response.vistorias ?? [],
    fast_entrega: response.fast_entrega ?? [],
    indicacao: response.indicao ?? [],
  }
}

async function liberarMoto(contratoId: string): Promise<void> {
  const user = obterUsuarioBubble()
  await chamarBubble('liberar_moto', { contrato: contratoId, user })
}

function LiberacaoCpfContent() {
  const searchParams = useSearchParams()
  const [placa, setPlaca] = useState(() => searchParams.get('placa')?.toUpperCase() ?? '')
  const [cpf, setCpf] = useState(() => searchParams.get('cpf') ?? '')
  // Guardado pela tela de tratamento de agendados — não é exibido, só fica disponível pro fluxo de liberação
  const [agendadoOrigem] = useState<Registro | null>(() => {
    try {
      const raw = localStorage.getItem('mc_agendado_liberacao')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLiberacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [liberando, setLiberando] = useState(false)
  const [liberado, setLiberado] = useState<RegistroLiberado | null>(null)
  const [lendoPlaca, setLendoPlaca] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const [placaCameraAberta, setPlacaCameraAberta] = useState(false)

  async function consultar() {
    if (!placa.trim() || !cpf.trim()) {
      setErro('Preencha CPF e Placa para buscar.')
      return
    }
    setConsultando(true)
    setErro(null)
    setResultado(null)
    setLiberado(null)
    try {
      const res = await consultarLiberacao(placa.trim().toUpperCase(), cpf.trim())
      setResultado(res)
    } catch {
      setErro('Não foi possível consultar. Verifique a conexão e tente novamente.')
    } finally {
      setConsultando(false)
    }
  }

  async function confirmarLiberacao() {
    if (!resultado?.contrato) return
    setLiberando(true)
    setErro(null)
    try {
      await liberarMoto(String(resultado.contrato['_id'] ?? ''))
      setLiberado({
        resultado,
        placa,
        cpf,
        operador: USUARIO_LOGADO,
        hora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      })
    } catch {
      setErro('Não foi possível confirmar a liberação. Tente novamente.')
    } finally {
      setLiberando(false)
    }
  }

  function novaConsulta() {
    setPlaca('')
    setCpf('')
    setResultado(null)
    setErro(null)
    setLiberado(null)
    limparFoto()
  }

  const validacao = resultado?.contrato ? validarLiberacao(resultado) : null

  function processarFotoDataUrl(dataUrl: string) {
    setErro(null)
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
      setFotoBase64(b64)
      lerPlacaDaFoto(b64)
    }
    img.src = dataUrl
  }

  async function lerPlacaDaFoto(b64: string) {
    setLendoPlaca(true)
    setErro(null)
    setPlaca('')
    try {
      const res = await fetch('/api/ler-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
      })
      const data = await res.json()
      if (data.placa) setPlaca(data.placa)
      else setErro('Não foi possível identificar a placa na foto.')
    } catch {
      setErro('Não foi possível identificar a placa na foto.')
    } finally {
      setLendoPlaca(false)
    }
  }

  function limparFoto() {
    setFoto(null)
    setFotoBase64(null)
    setPlacaCameraAberta(false)
  }

  return (
    <>
    <PageHeader
      title="Liberação de Veículos"
      description="Base Central"
      icon={<KeyRound className="w-5 h-5 text-white" />}
    />
    <div className="max-w-3xl mx-auto space-y-6 pt-6">

      <div className="px-4 sm:px-6 pb-6 space-y-6">

        {/* Busca */}
        <div className="bg-white rounded-2xl shadow-sm border p-8 sm:p-10 space-y-6">
          <div className="grid sm:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="space-y-4 min-w-0">
              <div className="flex items-center gap-3">
                <Search className="w-6 h-6 text-[#6C63FF]" />
                <h2 className="text-xl font-bold">Busca de Veículos</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Para liberar a moto, informe o <strong className="text-foreground">CPF</strong> do cliente e a{' '}
                <strong className="text-foreground">Placa</strong> do veículo. Caso não tenha a placa em mãos, use a opção{' '}
                <strong className="text-foreground">Foto da placa</strong> para que o sistema identifique automaticamente.
              </p>

              {foto && (
                <div className="relative rounded-xl overflow-hidden h-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt="Placa capturada" className="w-full h-full object-contain rounded-xl bg-black" />
                  <button
                    type="button"
                    onClick={limparFoto}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
                    title="Remover foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {!foto && placaCameraAberta && (
                <div className="space-y-2">
                  <PlacaCameraPicker
                    autoStart
                    onCapture={(dataUrl) => { setPlacaCameraAberta(false); processarFotoDataUrl(dataUrl) }}
                  />
                  <button
                    type="button"
                    onClick={() => setPlacaCameraAberta(false)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">CPF <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && consultar()}
                    placeholder="Digite o CPF"
                    disabled={consultando}
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Placa <span className="text-red-500">*</span></label>
                  <div className="flex gap-2 mt-1 min-w-0 max-w-[180px]">
                    <input
                      type="text"
                      value={placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && consultar()}
                      placeholder={lendoPlaca ? 'Analisando...' : 'Digite a Placa'}
                      maxLength={8}
                      disabled={consultando || lendoPlaca}
                      className="flex-1 min-w-0 px-3 py-2 text-sm font-mono uppercase border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 disabled:opacity-50"
                    />
                    {foto && (
                      <Button
                        variant="outline"
                        size="icon"
                        title="Reanalisar foto"
                        onClick={() => fotoBase64 && lerPlacaDaFoto(fotoBase64)}
                        disabled={lendoPlaca || !fotoBase64}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  title="Tirar foto da placa"
                  onClick={() => setPlacaCameraAberta(true)}
                  disabled={consultando || lendoPlaca || placaCameraAberta}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {foto ? 'Nova foto' : 'Foto da placa'}
                </Button>
                <Button
                  className="flex-1 bg-[#6C63FF] hover:brightness-110"
                  onClick={() => consultar()}
                  disabled={consultando || lendoPlaca || !placa.trim() || !cpf.trim()}
                >
                  {consultando
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><Search className="w-4 h-4 mr-2" />Buscar</>
                  }
                </Button>
              </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/busca-veiculo.png"
              alt=""
              className="hidden sm:block w-64 h-auto justify-self-center self-start"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-500 bg-red-50 rounded-md px-3 py-2">{erro}</p>
          )}

          {/* Resultado da busca */}
          {resultado && !liberado && (
            <>
              <Separator />
              <div className="space-y-4">
                {resultado.contrato ? (
                  <div className="rounded-xl border-l-4 border-l-[#6C63FF] bg-[#6C63FF]/5 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-lg">Contrato Nº {String(resultado.contrato['Numero ctr'] ?? '-')}</p>
                      <Badge className="bg-[#6C63FF]/20 text-[#6C63FF] border-[#6C63FF]/25">
                        {String(resultado.contrato['status'] ?? '-')}
                      </Badge>
                    </div>
                    <p className="text-sm font-mono text-muted-foreground">Placa: {placa}</p>
                    <p className="text-sm text-muted-foreground">CPF: {cpf}</p>
                    <p className="text-sm text-muted-foreground">Tipo de entrega: {String(resultado.contrato['tipo_de_entrega'] ?? '-')}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                    Nenhum contrato encontrado para os dados informados.
                  </p>
                )}

                {validacao && (
                  <div className={`rounded-lg px-3 py-2.5 border ${validacao.podeLiberar ? 'bg-[#6C63FF]/5 border-[#6C63FF]/20' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-1.5">
                      {validacao.podeLiberar ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#6C63FF]" />
                          <span className="text-sm font-semibold text-[#6C63FF]">Liberado</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm font-semibold text-red-600">Bloqueado</span>
                        </>
                      )}
                    </div>
                    {!validacao.podeLiberar && (
                      <ul className="mt-2 space-y-1">
                        {validacao.motivos.map((m) => (
                          <li key={m} className="text-sm text-red-600">• {m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={novaConsulta}>
                    Cancelar
                  </Button>
                  {validacao?.podeLiberar && (
                    <Button
                      className="flex-1 bg-[#6C63FF] hover:brightness-110"
                      onClick={confirmarLiberacao}
                      disabled={liberando}
                    >
                      {liberando
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Liberando...</>
                        : 'Confirmar Liberação'
                      }
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Confirmação de liberado */}
          {liberado && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-[#6C63FF]/5 border border-[#6C63FF]/20 rounded-lg px-4 py-3">
                  <CheckCircle2 className="w-6 h-6 text-[#6C63FF] shrink-0" />
                  <div>
                    <p className="font-semibold text-[#6C63FF]">Moto liberada com sucesso</p>
                    <p className="text-xs text-[#6C63FF]">
                      Operador: <span className="font-medium">{liberado.operador}</span> — {liberado.hora}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-mono text-muted-foreground">Placa: {liberado.placa}</p>
                  <p className="text-sm text-muted-foreground">CPF: {liberado.cpf}</p>
                  <p className="text-sm text-muted-foreground">
                    Contrato: {String(liberado.resultado.contrato?.['Numero ctr'] ?? '-')}
                  </p>
                </div>
                <Button className="w-full bg-[#6C63FF] hover:brightness-110" onClick={novaConsulta}>
                  Nova Liberação
                </Button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
    </>
  )
}

export default function LiberacaoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Carregando...
      </div>
    }>
      <LiberacaoCpfContent />
    </Suspense>
  )
}
