'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, Video, Gauge, MapPin, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Loader2, XCircle, ImageIcon, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { gerarPdfVistoriaEntrega } from '@/lib/gerar-pdf-vistoria'
import { comprimirVideo } from '@/lib/comprimir-video'

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

// Remove campos com string vazia antes de mandar pro Bubble (senão preenche com null lá)
function omitirVazios<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '') out[k as keyof T] = v as T[keyof T]
  }
  return out
}

// Extrai só a mensagem de texto da resposta do registro de substituição
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

const FOTOS_ENTREGA = [
  { id: 'frente', label: 'Foto da Frente' },
  { id: 'ladoDireito', label: 'Lado Direito (lado do pesinho)' },
  { id: 'traseira', label: 'Foto da Traseira' },
  { id: 'ladoEsquerdo', label: 'Lado Esquerdo (lado do escapamento)' },
] as const

const ETAPAS = [
  { label: 'Selfie', icon: UserCircle },
  { label: 'Fotos', icon: ImageIcon },
  { label: 'Avarias', icon: AlertTriangle },
  { label: 'Video', icon: Video },
  { label: 'KM', icon: Gauge },
  { label: 'Local', icon: MapPin },
  { label: 'Envio', icon: Loader2 },
  { label: 'Fim', icon: CheckCircle2 },
]

const STEP_THEMES = [
  { color: '#6C63FF', name: 'purple' },
  { color: '#3B82F6', name: 'blue' },
  { color: '#F59E0B', name: 'yellow' },
  { color: '#EC4899', name: 'pink' },
  { color: '#14B8A6', name: 'teal' },
  { color: '#8B5CF6', name: 'violet' },
  { color: '#6C63FF', name: 'purple' },
  { color: '#22C55E', name: 'green' },
]

function GradientBorderCard({ children, etapaKey, themeColor }: { children: React.ReactNode; etapaKey: number; themeColor: string }) {
  return (
    <div
      key={etapaKey}
      className="rounded-2xl p-[1px] mx-4"
      style={{
        background: `linear-gradient(135deg, ${themeColor}60, transparent 50%, ${themeColor}30)`,
        animation: 'cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="bg-[#0D1229] rounded-2xl p-6">
        {children}
      </div>
    </div>
  )
}

function InfoCard({ children, etapaKey, themeColor }: { children: React.ReactNode; etapaKey: number; themeColor: string }) {
  return (
    <div
      key={etapaKey}
      className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2)] mx-4"
      style={{
        borderTopWidth: '2px',
        borderTopColor: themeColor,
        animation: 'cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="p-6">
        {children}
      </div>
    </div>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function VistoriaEntregaContent() {
  const searchParams = useSearchParams()
  const placa = searchParams.get('placa')
  const contrato = searchParams.get('contrato')
  // Placa antiga (já vinculada ao contrato) — usada só pra localizar a CNH do cliente.
  // A vistoria em si (fotos, km, envio) é sempre da placa nova (`placa` acima).
  const placaContrato = searchParams.get('placaContrato') || placa
  // unique_id do contrato — usado no registro de substituição (diferente do `contrato` acima, que é o número)
  const contratoId = searchParams.get('contratoId') || contrato

  const [etapa, setEtapa] = useState(0)
  const [etapaKey, setEtapaKey] = useState(0)
  const [vistoriaEncerrada, setVistoriaEncerrada] = useState(false)

  const mudarEtapa = useCallback((novaEtapa: number) => {
    setEtapa(novaEtapa)
    setEtapaKey(k => k + 1)
  }, [])

  // Substituição: a consulta no carregamento serve apenas para buscar a CNH
  // (validação facial) — sem bloquear a página caso o contrato não esteja apto
  const [fotoCnhUrl, setFotoCnhUrl] = useState<string | null>(null)
  const [buscandoCnh, setBuscandoCnh] = useState(true)

  // Dados do veiculo
  const [veiculoKm, setVeiculoKm] = useState<number | null>(null)
  const [carregandoVeiculo, setCarregandoVeiculo] = useState(true)

  // Etapa 0 - Selfie
  const [selfie, setSelfie] = useState<string | null>(null)
  const [cameraSelfieAtiva, setCameraSelfieAtiva] = useState(false)
  const [erroCameraSelfie, setErroCameraSelfie] = useState('')
  const previewSelfieRef = useRef<HTMLVideoElement>(null)
  const streamSelfieRef = useRef<MediaStream | null>(null)
  const canvasSelfieRef = useRef<HTMLCanvasElement>(null)

  // Validacao facial
  const [validandoFacial, setValidandoFacial] = useState(false)
  const [facialStatus, setFacialStatus] = useState<'idle' | 'aprovado' | 'reprovado'>('idle')
  const [facialErro, setFacialErro] = useState('')
  const [facialStep, setFacialStep] = useState(0) // 0=idle, 1=enviando, 2=analisando, 3=comparando

  // Etapa 1 - Fotos
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [fotoAtualIdx, setFotoAtualIdx] = useState(0)
  const fotoRef = useRef<HTMLInputElement>(null)

  // Etapa 3 - Video
  const [videoAvarias, setVideoAvarias] = useState<string | null>(null)
  const [videoAvariasFile, setVideoAvariasFile] = useState<File | null>(null)
  const [comprimindoVideo, setComprimindoVideo] = useState(false)
  const videoRef = useRef<HTMLInputElement>(null)

  // Etapa 4 - KM
  const [km, setKm] = useState('')
  const [kmErro, setKmErro] = useState('')

  // Etapa 5 - Geolocation
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | 'negado' | null>(null)
  const [geoErro, setGeoErro] = useState('')
  const [geoCarregando, setGeoCarregando] = useState(false)

  // Etapa 6 - Envio
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  const theme = STEP_THEMES[etapa] || STEP_THEMES[0]

  // Busca a foto da CNH do cliente (para a validação facial) — usa a placa ANTIGA
  // (a que já está vinculada ao contrato), não a nova que está sendo incluída
  useEffect(() => {
    if (!placaContrato || !contrato) { setBuscandoCnh(false); return }
    setBuscandoCnh(true)
    chamarBubble('vistoria-entrega-sub', { placa: placaContrato.trim().toUpperCase(), contrato })
      .then(data => {
        const cliente = data.response?.cliente
        if (cliente?.foto_cnh) {
          const url = cliente.foto_cnh.startsWith('//') ? `https:${cliente.foto_cnh}` : cliente.foto_cnh
          setFotoCnhUrl(url)
        }
      })
      .catch(() => {})
      .finally(() => setBuscandoCnh(false))
  }, [placaContrato, contrato])

  // Busca KM do veiculo
  useEffect(() => {
    if (!placa) return
    setCarregandoVeiculo(true)
    chamarBubble('consulta-veiculo-funcoes', { placa: placa.trim().toUpperCase() })
      .then(data => {
        const kmVal = data.response?.veiculo?.km
        if (kmVal != null) setVeiculoKm(Number(kmVal))
      })
      .catch(() => {})
      .finally(() => setCarregandoVeiculo(false))
  }, [placa])

  // Desliga a camera da selfie se o componente desmontar com ela ligada
  useEffect(() => {
    return () => {
      streamSelfieRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function iniciarCameraSelfie() {
    setErroCameraSelfie('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      })
      streamSelfieRef.current = stream
      if (previewSelfieRef.current) {
        previewSelfieRef.current.srcObject = stream
        await previewSelfieRef.current.play().catch(() => {})
      }
      setCameraSelfieAtiva(true)
    } catch (err) {
      setErroCameraSelfie(`Erro ao acessar a camera: ${String(err)}`)
    }
  }

  function pararCameraSelfie() {
    streamSelfieRef.current?.getTracks().forEach((t) => t.stop())
    streamSelfieRef.current = null
    setCameraSelfieAtiva(false)
  }

  function capturarSelfie() {
    const video = previewSelfieRef.current
    const canvas = canvasSelfieRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Espelha a captura pra bater com o preview (efeito selfie)
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setFacialStatus('idle')
    setFacialErro('')
    setSelfie(dataUrl)
    pararCameraSelfie()
  }

  if (!placa || !contrato) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#080C1F] via-[#1B2043] to-[#2E4080] flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-6 text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Link invalido</h2>
          <p className="text-sm text-white/60">Este link precisa conter os parametros <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">placa</code> e <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">contrato</code>.</p>
        </div>
      </div>
    )
  }

  if (buscandoCnh) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#080C1F] via-[#1B2043] to-[#2E4080] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#6C63FF]" />
          <p className="text-sm text-white/60">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (vistoriaEncerrada) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#080C1F] via-[#1B2043] to-[#2E4080] flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-6 text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Vistoria encerrada</h2>
          <p className="text-sm text-white/60">Entre em contato com a empresa para mais informacoes.</p>
        </div>
      </div>
    )
  }

  const fotosCount = Object.keys(fotos).length

  async function validarFacial() {
    if (!selfie) return
    // Sem CNH encontrada não há o que comparar — avança direto
    if (!fotoCnhUrl) {
      mudarEtapa(1)
      return
    }
    setValidandoFacial(true)
    setFacialErro('')
    setFacialStatus('idle')
    setFacialStep(1)
    try {
      const selfieRes = await fetch(selfie)
      const selfieBlob = await selfieRes.blob()
      const cnhRes = await fetch(fotoCnhUrl)
      const cnhBlob = await cnhRes.blob()
      setFacialStep(2)
      const form = new FormData()
      form.append('selfie', selfieBlob, 'selfie.jpg')
      form.append('cnh_imagem', cnhBlob, 'cnh.jpg')
      setFacialStep(3)
      const res = await fetch('/api/validar-facial', { method: 'POST', body: form })
      const data = await res.json()
      console.log('[vistoria-entrega] Validacao facial:', data)
      const status = data.dados_extraidos?.status
      if (status === 'APROVADO') {
        setFacialStatus('aprovado')
        await new Promise(r => setTimeout(r, 600))
        mudarEtapa(1)
      } else {
        setFacialStatus('reprovado')
        setFacialErro(data.dados_extraidos?.motivo || 'A validacao facial nao foi aprovada.')
      }
    } catch (err) {
      console.error('[vistoria-entrega] Erro validacao facial:', err)
      setFacialErro('Erro ao validar reconhecimento facial. Tente novamente.')
    } finally {
      setValidandoFacial(false)
      setFacialStep(0)
    }
  }

  function podeAvancar(): boolean {
    switch (etapa) {
      case 0: return !!selfie && !validandoFacial
      case 1: return fotosCount === 4
      case 2: return true
      case 3: return !!videoAvarias && !comprimindoVideo
      case 4: {
        if (!km) return false
        if (veiculoKm != null && Number(km) < veiculoKm) return false
        return true
      }
      default: return true
    }
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    const fotoId = FOTOS_ENTREGA[fotoAtualIdx].id
    setFotos(prev => ({ ...prev, [fotoId]: dataUrl }))
    if (fotoAtualIdx < 3) setFotoAtualIdx(fotoAtualIdx + 1)
  }

  async function onVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setComprimindoVideo(true)
    try {
      const arquivo = await comprimirVideo(file)
      const dataUrl = await readFileAsDataUrl(arquivo)
      setVideoAvarias(dataUrl)
      setVideoAvariasFile(arquivo)
    } catch {
      // Compressão falhou (ex: navegador sem suporte a MediaRecorder) — usa o original
      const dataUrl = await readFileAsDataUrl(file)
      setVideoAvarias(dataUrl)
      setVideoAvariasFile(file)
    } finally {
      setComprimindoVideo(false)
    }
  }

  function capturarLocalizacao() {
    setGeoCarregando(true)
    setGeoErro('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoCarregando(false)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoLocation('negado')
        } else {
          setGeoErro(`Erro ao obter localizacao: ${err.message}`)
        }
        setGeoCarregando(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  async function finalizarVistoria() {
    setEnviando(true)
    setErroEnvio('')
    try {
      let localizacaoAtual = geoLocation
      if (!localizacaoAtual) {
        try {
          localizacaoAtual = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 10000 }
            )
          })
          setGeoLocation(localizacaoAtual)
        } catch (err) {
          if (err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED) {
            localizacaoAtual = 'negado'
            setGeoLocation('negado')
          }
        }
      }

      async function uploadArquivo(file: File): Promise<string> {
        const form = new FormData()
        form.append('foto', file, file.name)
        const res = await fetch('/api/upload-foto', { method: 'POST', body: form })
        const text = await res.text()
        if (!res.ok) throw new Error(`HTTP ${res.status} (${(file.size / 1024 / 1024).toFixed(1)}MB) — ${text.slice(0, 200)}`)
        const data = JSON.parse(text)
        return data.url as string
      }

      let videoUrl = ''
      if (videoAvariasFile) {
        try {
          videoUrl = await uploadArquivo(videoAvariasFile)
        } catch (err) {
          throw new Error(`Erro ao enviar video: ${String(err)}`)
        }
      }

      let pdfBlob: Blob
      try {
        pdfBlob = await gerarPdfVistoriaEntrega({
          placa: placa!.trim().toUpperCase(),
          contrato: contrato!,
          km,
          selfieDataUrl: selfie,
          fotos: FOTOS_ENTREGA.map(f => ({
            label: f.label,
            dataUrl: fotos[f.id] || null,
          })),
          geoLocation: localizacaoAtual,
          videoUrl,
        })
      } catch (err) {
        throw new Error(`Erro ao gerar PDF: ${String(err)}`)
      }

      let pdfUrl: string
      try {
        pdfUrl = await uploadArquivo(
          new File([pdfBlob], `VISTORIA-ENTREGA-${placa!.trim().toUpperCase()}.pdf`, { type: 'application/pdf' })
        )
      } catch (err) {
        throw new Error(`Erro ao enviar PDF: ${String(err)}`)
      }

      // Registra/verifica quem já terminou a vistoria de substituição — a moto
      // antiga pode ser finalizada pelo usuário (outra tela) antes ou depois desta
      const registro = await chamarBubble('base-registro-vistoria-substituicao', {
        contrato: contratoId ?? '',
        'placa-nova': placa!.trim().toUpperCase(),
        'placa-antiga': (placaContrato ?? '').trim().toUpperCase(),
      }).catch(() => null)
      const registroTexto = extrairMensagemRegistro(registro)

      const body = omitirVazios({
        PLACA_ANTIGA: (placaContrato ?? '').trim().toUpperCase(),
        KM_ANTIGA: '',
        PDF_ANTIGA: '',
        TIPO: 'SUBSTITUIÇÃO',
        VIDEO_ANTIGA: '',
        CONTRATO: contrato ?? '',
        PLACA_NOVA: placa!.trim().toUpperCase(),
        KM_NOVA: km,
        PDF_NOVA: pdfUrl,
        VIDEO_NOVA: videoUrl,
        TXT: 'INCLUIR',
        MSG: registroTexto,
        ONDE: 'MOTO-NOVA',
      })

      try {
        await chamarBubble('base_vistoria_nova_sub', body, 'json')
      } catch (err) {
        throw new Error(`Erro ao registrar vistoria: ${String(err)}`)
      }

      mudarEtapa(7)
    } catch (err) {
      setErroEnvio(String(err))
    } finally {
      setEnviando(false)
    }
  }

  function handleAvancar() {
    if (etapa === 0) {
      validarFacial()
      return
    }
    if (etapa === 4) {
      if (veiculoKm != null && Number(km) < veiculoKm) {
        setKmErro(`KM nao pode ser inferior ao ultimo registrado (${veiculoKm} km)`)
        return
      }
      setKmErro('')
    }
    if (etapa === 5) {
      mudarEtapa(6)
      return
    }
    if (etapa === 6) {
      finalizarVistoria()
      return
    }
    mudarEtapa(etapa + 1)
  }

  function Stepper() {
    const progress = (etapa / (ETAPAS.length - 1)) * 100
    const prevStep = etapa > 0 ? ETAPAS[etapa - 1] : null
    const currentStep = ETAPAS[etapa]
    const nextStep = etapa < ETAPAS.length - 1 ? ETAPAS[etapa + 1] : null

    return (
      <div className="mx-4 mt-3">
        {/* Progress bar */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${STEP_THEMES[0].color}, ${theme.color})`,
            }}
          />
        </div>
        {/* Pills */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {prevStep && (
              <span className="text-xs text-white/40 bg-white/5 px-2.5 py-1 rounded-full">
                {prevStep.label}
              </span>
            )}
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
              style={{ backgroundColor: `${theme.color}30`, color: theme.color, boxShadow: `0 0 12px ${theme.color}30` }}
            >
              {currentStep.label}
            </span>
            {nextStep && (
              <span className="text-xs text-white/40 bg-white/5 px-2.5 py-1 rounded-full">
                {nextStep.label}
              </span>
            )}
          </div>
          <span className="text-xs text-white/50 font-mono">{etapa + 1}/{ETAPAS.length}</span>
        </div>
      </div>
    )
  }

  function StepIcon({ icon: Icon }: { icon: typeof UserCircle }) {
    return (
      <div className="relative">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            backgroundColor: `${theme.color}20`,
            boxShadow: `0 0 30px ${theme.color}25`,
          }}
        >
          <Icon className="w-10 h-10" style={{ color: theme.color }} />
        </div>
        <div
          className="absolute inset-0 w-20 h-20 rounded-3xl animate-[pulse-ring_2s_ease-out_infinite]"
          style={{ border: `2px solid ${theme.color}40` }}
        />
      </div>
    )
  }


  function renderEtapa() {
    switch (etapa) {
      case 0:
        return (
          <div
            key={etapaKey}
            className="mx-4 rounded-2xl p-6 bg-[#1E2233] flex flex-col items-center gap-4"
            style={{ animation: 'cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Tire uma selfie</h2>
              <p className="text-sm text-white/60 mt-1">Precisamos de uma foto sua para identificacao.</p>
            </div>
            {selfie ? (
              <div className="relative">
                <img
                  src={selfie}
                  alt="Selfie"
                  className="w-56 aspect-[3/4] object-cover rounded-full transition-all duration-500"
                  style={{
                    border: facialStatus === 'aprovado'
                      ? '3px solid #22C55E'
                      : facialStatus === 'reprovado'
                        ? '3px solid #EF4444'
                        : '3px solid #6C63FF',
                  }}
                />
                {/* Approved checkmark overlay */}
                {facialStatus === 'aprovado' && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ animation: 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                    <div className="w-16 h-16 rounded-full bg-[#22C55E] flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="relative w-56 aspect-[3/4] rounded-full overflow-hidden bg-black"
                style={{ border: '3px solid #6C63FF' }}
              >
                <video
                  ref={previewSelfieRef}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!cameraSelfieAtiva && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/50 text-xs text-center px-4">
                    Camera desligada
                  </div>
                )}
              </div>
            )}
            <canvas ref={canvasSelfieRef} className="hidden" />
            {/* Facial analysis steps */}
            {validandoFacial && (
              <div className="w-full space-y-2" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
                  {facialStep >= 1 ? (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${facialStep > 1 ? 'bg-[#22C55E]' : 'bg-[#6C63FF] animate-pulse'}`}>
                      {facialStep > 1 ? <CheckCircle2 className="w-3 h-3 text-white" /> : <Loader2 className="w-3 h-3 text-white animate-spin" />}
                    </div>
                  ) : <div className="w-5 h-5 rounded-full bg-white/10" />}
                  <span className={`text-xs ${facialStep >= 1 ? 'text-white/80' : 'text-white/40'}`}>Enviando imagens...</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
                  {facialStep >= 2 ? (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${facialStep > 2 ? 'bg-[#22C55E]' : 'bg-[#6C63FF] animate-pulse'}`}>
                      {facialStep > 2 ? <CheckCircle2 className="w-3 h-3 text-white" /> : <Loader2 className="w-3 h-3 text-white animate-spin" />}
                    </div>
                  ) : <div className="w-5 h-5 rounded-full bg-white/10" />}
                  <span className={`text-xs ${facialStep >= 2 ? 'text-white/80' : 'text-white/40'}`}>Analisando rosto...</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
                  {facialStep >= 3 ? (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#6C63FF] animate-pulse">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                  ) : <div className="w-5 h-5 rounded-full bg-white/10" />}
                  <span className={`text-xs ${facialStep >= 3 ? 'text-white/80' : 'text-white/40'}`}>Comparando com CNH...</span>
                </div>
              </div>
            )}
            {!validandoFacial && (
              selfie ? (
                <Button
                  onClick={() => { setSelfie(null); setFacialStatus('idle'); setFacialErro(''); iniciarCameraSelfie() }}
                  className="bg-white/10 border border-white/20 text-white hover:bg-white/20 min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Tirar novamente
                </Button>
              ) : cameraSelfieAtiva ? (
                <Button
                  onClick={capturarSelfie}
                  className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Tirar foto
                </Button>
              ) : (
                <Button
                  onClick={iniciarCameraSelfie}
                  className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Ligar Camera
                </Button>
              )
            )}
            {erroCameraSelfie && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 w-full">
                <p className="text-sm text-red-300 text-center">{erroCameraSelfie}</p>
              </div>
            )}
            {facialStatus === 'reprovado' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 w-full" style={{ animation: 'shakeX 0.5s ease-out' }}>
                <p className="text-sm text-red-300 text-center">{facialErro}</p>
              </div>
            )}
            {facialErro && facialStatus === 'idle' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 w-full" style={{ animation: 'shakeX 0.5s ease-out' }}>
                <p className="text-sm text-red-300 text-center">{facialErro}</p>
              </div>
            )}
          </div>
        )

      case 1:
        return (
          <GradientBorderCard etapaKey={etapaKey} themeColor={theme.color}>
            <div className="flex flex-col gap-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-200/80">Tire fotos nitidas e bem iluminadas. Certifique-se de que o veiculo esteja totalmente visivel.</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Fotos do Veiculo</h2>
                <Badge className="bg-[#3B82F6]/20 text-[#3B82F6] border-[#3B82F6]/30 hover:bg-[#3B82F6]/30">{fotosCount}/4 fotos</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {FOTOS_ENTREGA.map((foto, i) => {
                  const dataUrl = fotos[foto.id]
                  return (
                    <button
                      key={foto.id}
                      onClick={() => { setFotoAtualIdx(i); fotoRef.current?.click() }}
                      className={`relative rounded-2xl flex flex-col items-center justify-center p-3 min-h-[140px] transition-all duration-200 ${
                        dataUrl
                          ? 'border-2 border-[#22C55E]/50 bg-white/5 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
                          : 'border-2 border-dashed border-[#3B82F6]/40 bg-white/5 hover:border-[#3B82F6]/60 hover:bg-white/10'
                      }`}
                    >
                      {dataUrl ? (
                        <img src={dataUrl} alt={foto.label} className="w-full h-full object-cover rounded-xl absolute inset-0 hover:scale-[1.03] transition-transform" />
                      ) : (
                        <>
                          <Camera className="w-8 h-8 text-white/30 mb-1" />
                          <span className="text-xs text-white/50 text-center">{foto.label}</span>
                        </>
                      )}
                      {dataUrl && (
                        <div className="absolute top-2 right-2 bg-[#22C55E] rounded-full p-0.5 shadow-[0_0_8px_rgba(34,197,94,0.4)]">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} />
            </div>
          </GradientBorderCard>
        )

      case 2:
        return (
          <InfoCard etapaKey={etapaKey} themeColor={theme.color}>
            <div className="flex flex-col items-center gap-5">
              <StepIcon icon={AlertTriangle} />
              <div className="text-center">
                <h2 className="text-xl font-bold text-white">Concordancia de Avarias</h2>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-sm text-white/80 text-center leading-relaxed">
                  Voce concorda que se nao apontar as avarias e porque a moto esta em perfeito estado?
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <Button
                  className="flex-1 bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white font-bold min-h-[48px] text-base"
                  onClick={() => mudarEtapa(3)}
                >
                  SIM
                </Button>
                <Button
                  className="flex-1 bg-red-500/80 hover:bg-red-500 shadow-[0_4px_15px_rgba(239,68,68,0.3)] text-white font-bold min-h-[48px] text-base"
                  onClick={() => {
                    if (confirm('A vistoria sera encerrada. Deseja continuar?')) {
                      setVistoriaEncerrada(true)
                    }
                  }}
                >
                  NAO
                </Button>
              </div>
            </div>
          </InfoCard>
        )

      case 3:
        return (
          <GradientBorderCard etapaKey={etapaKey} themeColor={theme.color}>
            <div className="flex flex-col items-center gap-4">
              <StepIcon icon={Video} />
              <div className="text-center">
                <h2 className="text-xl font-bold text-white">Video de Avarias</h2>
                <p className="text-sm text-white/60 mt-1">Grave um video mostrando possiveis avarias do veiculo.</p>
              </div>
              {comprimindoVideo ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-[#EC4899]" />
                  <p className="text-sm text-white/60">Comprimindo video...</p>
                </div>
              ) : (
                <>
                  {videoAvarias && (
                    <div className="w-full">
                      <video src={videoAvarias} controls className="w-full rounded-2xl border border-white/20" />
                    </div>
                  )}
                  <Button
                    onClick={() => videoRef.current?.click()}
                    className={
                      videoAvarias
                        ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20 min-h-[44px]'
                        : 'bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]'
                    }
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {videoAvarias ? 'Gravar novamente' : 'Gravar Video'}
                  </Button>
                </>
              )}
              <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onVideo} />
            </div>
          </GradientBorderCard>
        )

      case 4:
        return (
          <InfoCard etapaKey={etapaKey} themeColor={theme.color}>
            <div className="flex flex-col items-center gap-4">
              <StepIcon icon={Gauge} />
              <h2 className="text-xl font-bold text-white text-center">Quilometragem Atual</h2>
              {carregandoVeiculo ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/40" />
              ) : veiculoKm != null ? (
                <div className="bg-white/10 text-white/70 rounded-lg px-3 py-2 text-sm">
                  Ultimo KM registrado: <strong className="text-white">{veiculoKm} km</strong>
                </div>
              ) : null}
              <input
                type="number"
                inputMode="numeric"
                value={km}
                onChange={(e) => { setKm(e.target.value); setKmErro('') }}
                placeholder="Digite o KM atual"
                className="w-full bg-white/10 border border-white/20 text-white placeholder:text-white/30 rounded-xl px-4 py-3 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/50 focus:border-[#14B8A6] transition-all"
              />
              {kmErro && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 w-full">
                  <p className="text-sm text-red-300 text-center">{kmErro}</p>
                </div>
              )}
            </div>
          </InfoCard>
        )

      case 5:
        return (
          <InfoCard etapaKey={etapaKey} themeColor={theme.color}>
            <div className="flex flex-col items-center gap-4">
              <StepIcon icon={MapPin} />
              <div className="text-center">
                <h2 className="text-xl font-bold text-white">Localizacao</h2>
                <p className="text-sm text-white/60 mt-1">Precisamos da sua localizacao para registrar a vistoria.</p>
              </div>
              {geoLocation && geoLocation !== 'negado' ? (
                <div className="bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl p-4 text-center w-full">
                  <CheckCircle2 className="w-6 h-6 text-[#22C55E] mx-auto mb-2" />
                  <p className="text-sm font-mono text-white/80">{geoLocation.lat.toFixed(6)}, {geoLocation.lng.toFixed(6)}</p>
                </div>
              ) : geoLocation === 'negado' ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center w-full">
                  <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-300">Localização negada — isso vai constar no PDF da vistoria.</p>
                </div>
              ) : geoCarregando ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
                  <p className="text-sm text-white/60">Obtendo localizacao...</p>
                </div>
              ) : (
                <Button onClick={capturarLocalizacao} className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]">
                  <MapPin className="w-4 h-4 mr-2" />
                  Obter Localizacao
                </Button>
              )}
              {geoErro && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 w-full">
                  <p className="text-sm text-red-300 text-center">{geoErro}</p>
                </div>
              )}
            </div>
          </InfoCard>
        )

      case 6:
        return (
          <div
            key={etapaKey}
            className="rounded-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-6 mx-4"
            style={{
              background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(13,18,41,0.95), rgba(108,99,255,0.05))',
              animation: 'cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div className="flex flex-col items-center gap-4">
              {enviando ? (
                <>
                  <Loader2 className="w-16 h-16 animate-spin text-[#6C63FF]" />
                  <h2 className="text-xl font-bold text-white text-center animate-pulse">Gerando PDF...</h2>
                  <p className="text-sm text-white/60">Aguarde enquanto preparamos o relatorio.</p>
                </>
              ) : erroEnvio ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 w-full">
                    <p className="text-sm text-red-300 text-center">{erroEnvio}</p>
                  </div>
                  <Button onClick={finalizarVistoria} className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]">
                    Tentar novamente
                  </Button>
                </>
              ) : (
                <>
                  <StepIcon icon={CheckCircle2} />
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white">Pronto para finalizar</h2>
                    <p className="text-sm text-white/60 mt-1">Clique em &quot;Finalizar&quot; para gerar o PDF da vistoria.</p>
                  </div>
                  <Button
                    onClick={finalizarVistoria}
                    className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white text-lg px-8 py-3 min-h-[48px] font-bold"
                  >
                    Finalizar Vistoria
                  </Button>
                </>
              )}
            </div>
          </div>
        )

      case 7:
        return (
          <div
            key={etapaKey}
            className="rounded-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-8 mx-4"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(13,18,41,0.95), rgba(34,197,94,0.05))',
              animation: 'cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div className="flex flex-col items-center gap-5">
              {/* Celebration icon with concentric rings */}
              <div className="relative flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-[#22C55E] flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.5)] z-10">
                  <CheckCircle2 className="w-14 h-14 text-white" />
                </div>
                <div className="absolute w-28 h-28 rounded-full border-2 border-[#22C55E]/50 animate-ping" />
                <div className="absolute w-36 h-36 rounded-full border border-[#22C55E]/25 animate-[pulse-ring_2.5s_ease-out_infinite]" />
                <div className="absolute w-44 h-44 rounded-full border border-[#22C55E]/15 animate-[pulse-ring_3s_ease-out_infinite_0.5s]" />
                {/* Confetti dots */}
                <div className="absolute w-3 h-3 rounded-full bg-[#6C63FF] animate-[confetti-float_2s_ease-in-out_infinite]" style={{ top: '-8px', left: '20%' }} />
                <div className="absolute w-2 h-2 rounded-full bg-[#F59E0B] animate-[confetti-float_2.5s_ease-in-out_infinite_0.3s]" style={{ top: '10%', right: '-4px' }} />
                <div className="absolute w-3 h-3 rounded-full bg-[#EC4899] animate-[confetti-float_2s_ease-in-out_infinite_0.6s]" style={{ bottom: '5%', left: '-8px' }} />
                <div className="absolute w-2 h-2 rounded-full bg-[#3B82F6] animate-[confetti-float_2.2s_ease-in-out_infinite_0.9s]" style={{ bottom: '-4px', right: '25%' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-[#14B8A6] animate-[confetti-float_1.8s_ease-in-out_infinite_0.4s]" style={{ top: '20%', left: '-6px' }} />
              </div>
              <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-[#22C55E] to-[#4ADE80] bg-clip-text text-transparent">
                Vistoria concluida!
              </h2>
              <p className="text-sm text-white/60 text-center">O PDF foi gerado e baixado automaticamente.</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const showNav = etapa !== 2 && etapa !== 6 && etapa !== 7

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080C1F] via-[#1B2043] to-[#2E4080] flex flex-col relative overflow-hidden">
      {/* Decorative blurs */}
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(108,99,255,0.3), transparent 70%)' }} />
      <div className="fixed bottom-[-15%] right-[-10%] w-[45vw] h-[45vw] rounded-full opacity-25 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.25), transparent 70%)' }} />

      <style>{`
        @keyframes cardEnter {
          0% { opacity: 0; transform: translateY(30px) scale(0.97); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes confetti-float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
          50% { transform: translateY(-12px) rotate(180deg); opacity: 1; }
        }
        @keyframes scan-line {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes scan-border {
          0% { border-color: rgba(108,99,255,0.3); }
          50% { border-color: rgba(108,99,255,0.8); }
          100% { border-color: rgba(108,99,255,0.3); }
        }
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(5px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(3px); }
          75% { transform: translateX(-1px); }
        }
      `}</style>

      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen relative z-10">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-gradient-to-b from-[#0D1229]/95 to-[#0D1229]/80 backdrop-blur-2xl border-b border-white/[0.08] px-4 pt-3 pb-3" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#6C63FF]/20 to-[#22C55E]/20 border border-white/10 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#22C55E] border-2 border-[#0D1229]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-[15px] tracking-wide bg-gradient-to-r from-white via-white to-[#22C55E] bg-clip-text text-transparent">
                MODO CORRE
              </span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#8E92B3] font-medium">Vistoria de Entrega</span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5">
              <Badge className="bg-gradient-to-r from-[#6C63FF]/20 to-[#6C63FF]/10 text-[#A5A0FF] border-[#6C63FF]/25 hover:bg-[#6C63FF]/30 text-[11px] font-bold tracking-wider px-2.5 py-0.5">{placa.toUpperCase()}</Badge>
              <Badge className="bg-gradient-to-r from-[#22C55E]/15 to-[#22C55E]/5 text-[#4ADE80] border-[#22C55E]/20 hover:bg-[#22C55E]/25 text-[10px] font-medium px-2 py-0">Contrato #{contrato}</Badge>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <Stepper />

        {/* Conteudo */}
        <div className="flex-1 flex flex-col justify-center py-4">
          {renderEtapa()}
        </div>

        {/* Navegacao */}
        {showNav && (
          <div className="bg-[#0D1229]/90 backdrop-blur-xl border-t border-white/10 px-4 py-3">
            {/* Thin progress bar at top */}
            <div className="h-[2px] bg-white/5 rounded-full mb-3 -mt-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${((etapa + 1) / ETAPAS.length) * 100}%`,
                  background: `linear-gradient(90deg, ${STEP_THEMES[0].color}, #22C55E)`,
                }}
              />
            </div>
            <div className="flex gap-3">
              {etapa > 0 && (
                <Button
                  onClick={() => mudarEtapa(etapa - 1)}
                  className="bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white min-h-[44px] px-4"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Voltar
                </Button>
              )}
              <Button
                onClick={handleAvancar}
                disabled={!podeAvancar() || enviando}
                className="flex-1 bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white disabled:opacity-30 min-h-[52px] text-base font-bold transition-all duration-200"
              >
                {etapa === 6 ? 'Finalizar' : 'Proximo'}
                {etapa < 6 && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#080C1F] via-[#1B2043] to-[#2E4080] flex items-center justify-center">
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin text-[#6C63FF]" />
          <div className="absolute inset-0 w-10 h-10 rounded-full shadow-[0_0_20px_rgba(108,99,255,0.4)]" />
        </div>
      </div>
    }>
      <VistoriaEntregaContent />
    </Suspense>
  )
}
