'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Square, X, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { comprimirVideo } from '@/lib/comprimir-video'

// Câmera própria (getUserMedia + MediaRecorder) gravando já em resolução/bitrate
// baixos — evita estourar o limite de corpo de requisição do Vercel (~4.5MB)
// sem precisar de uma etapa de compressão depois de gravar.
const RESOLUCAO = { width: 640, height: 360 }
const BITRATE = 250_000

function escolherMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidatos = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const tipo of candidatos) {
    if (MediaRecorder.isTypeSupported(tipo)) return tipo
  }
  return ''
}

type Props = {
  value: File | null
  onChange: (file: File | null) => void
  label?: string
  variant?: 'light' | 'dark'
}

export function GravadorVideo({ value, onChange, label = 'Gravar vídeo', variant = 'light' }: Props) {
  const [suportado, setSuportado] = useState(true)
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState('')
  const [comprimindo, setComprimindo] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSuportado(false)
    }
  }, [])

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  useEffect(() => () => pararCamera(), [])

  async function abrirCamera() {
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: RESOLUCAO.width }, height: { ideal: RESOLUCAO.height } },
      })
      streamRef.current = stream
      setCameraAtiva(true)
      requestAnimationFrame(() => {
        if (previewRef.current) {
          previewRef.current.srcObject = stream
          previewRef.current.play().catch(() => {})
        }
      })
    } catch {
      setSuportado(false)
      setErro('Não foi possível acessar a câmera. Usando a câmera padrão do aparelho.')
    }
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
    setGravando(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function iniciarGravacao() {
    if (!streamRef.current) return
    const mimeType = escolherMimeType()
    try {
      const recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: BITRATE,
      })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        const ext = (mimeType || 'video/webm').includes('mp4') ? 'mp4' : 'webm'
        const file = new File([blob], `video-${Date.now()}.${ext}`, { type: mimeType || 'video/webm' })
        pararCamera()
        onChange(file)
      }
      recorder.onerror = () => setErro('Erro ao gravar vídeo.')
      recorderRef.current = recorder
      recorder.start()
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch {
      setErro('Erro ao iniciar gravação.')
    }
  }

  function pararGravacao() {
    recorderRef.current?.stop()
  }

  // Câmera nativa do aparelho (fallback) não controla resolução/bitrate —
  // precisa comprimir depois, diferente da gravação pela câmera própria
  async function onFallbackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setErro('')
    setComprimindo(true)
    try {
      const arquivo = await comprimirVideo(file)
      onChange(arquivo)
    } catch {
      onChange(file)
    } finally {
      setComprimindo(false)
    }
  }

  const placeholderClasses = variant === 'dark'
    ? 'border-dashed border-white/20 bg-white/5 hover:border-white/40 text-white/50'
    : 'border-dashed border-zinc-300 hover:border-zinc-400 text-muted-foreground'

  const cancelarClasses = variant === 'dark'
    ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
    : ''

  // Sem suporte a getUserMedia/MediaRecorder — cai pro input nativo do aparelho
  if (!suportado && !value) {
    return (
      <div className="space-y-1.5">
        {comprimindo ? (
          <div className={`w-full h-40 border-2 rounded-xl flex flex-col items-center justify-center gap-2 ${placeholderClasses}`}>
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm font-medium">Comprimindo vídeo...</span>
          </div>
        ) : (
          <button
            onClick={() => fallbackRef.current?.click()}
            className={`w-full h-40 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${placeholderClasses}`}
          >
            <Camera className="w-7 h-7" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        )}
        <input ref={fallbackRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onFallbackFile} />
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </div>
    )
  }

  if (value && previewUrl) {
    return (
      <div className="relative">
        <video src={previewUrl} controls className="w-full rounded-xl border-2 border-green-400 max-h-72" />
        <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
        <button onClick={() => onChange(null)} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (cameraAtiva) {
    return (
      <div className="space-y-2">
        <div className="bg-black rounded-xl overflow-hidden relative h-56">
          <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
          {gravando && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
              <Circle className="w-2 h-2 fill-white animate-pulse" /> {segundos}s
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className={`h-11 ${cancelarClasses}`} onClick={pararCamera} disabled={gravando}>
            Cancelar
          </Button>
          {!gravando ? (
            <Button type="button" className="flex-1 h-11 gap-2 bg-red-600 hover:bg-red-700" onClick={iniciarGravacao}>
              <Circle className="w-4 h-4 fill-white" /> Gravar
            </Button>
          ) : (
            <Button type="button" className="flex-1 h-11 gap-2 bg-zinc-900 hover:bg-zinc-800" onClick={pararGravacao}>
              <Square className="w-4 h-4 fill-white" /> Parar
            </Button>
          )}
        </div>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={abrirCamera}
        className={`w-full h-40 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${placeholderClasses}`}
      >
        <Camera className="w-7 h-7" />
        <span className="text-sm font-medium">{label}</span>
      </button>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  )
}
