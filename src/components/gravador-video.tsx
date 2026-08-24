'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Camera, Circle, Square, RotateCcw, Video as VideoIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { comprimirVideo } from '@/lib/comprimir-video'
import {
  RESOLUCAO_VISTORIA,
  TAMANHO_MAXIMO_BYTES,
  calcularDuracaoMaxima,
  bitrateParaDispositivo,
  escolherMimeTypeVideo,
} from '@/lib/gravacao-video'

// Componente compartilhado pra gravar vídeo de vistoria com câmera própria
// (getUserMedia + MediaRecorder), já em resolução/bitrate controlados, com
// cronômetro regressivo e rede de segurança de tamanho real — evita estourar
// o limite de corpo de Serverless Function da Vercel (~4.5MB) sem depender
// de comprimir depois. Validado na tela /teste-camera (config compartilhada
// em src/lib/gravacao-video.ts).
//
// Se a câmera própria falhar em qualquer ponto (permissão negada, sem
// suporte, tela preta, erro no meio da gravação, câmera perdida pro
// sistema), cai SILENCIOSAMENTE pro <input capture> nativo do aparelho +
// comprimirVideo() pós-gravação — o mesmo caminho que o app já usava antes
// dessa mudança, então nunca fica sem alternativa.
//
// Fix de tela preta: essa mesma ideia (câmera própria nas vistorias) já foi
// tentada e revertida em 07/08 — o componente removido atribuía o srcObject
// direto na função async que pedia a câmera, mas o <video> só existe no DOM
// depois que cameraAtiva vira true (renderização condicional), então o
// elemento podia ainda não estar montado quando a atribuição rodava, e o
// stream se perdia (tela preta). Aqui o srcObject é atribuído num useEffect
// que depende de cameraAtiva — só roda depois do <video> já estar montado.
// Mesmo padrão usado em PlacaCameraPicker e corrigido no modo Selfie do
// teste-camera (commit 7121d02). Como reforço, também há um timeout: se o
// vídeo não carregar dimensões reais em alguns segundos, trata como falha
// e cai pro fallback.

const TIMEOUT_TELA_PRETA_MS = 4000

type Props = {
  onGravado: (file: File) => void
  label?: string
  labelRegravar?: string
  variant?: 'light' | 'dark'
  triggerHeightClassName?: string
  accentBorderClassName?: string
  accentIconBgClassName?: string
  accentIconClassName?: string
  icon?: LucideIcon
}

export function GravadorVideo({
  onGravado,
  label = 'Gravar vídeo',
  labelRegravar = 'Gravar novamente',
  variant = 'light',
  triggerHeightClassName = 'h-40',
  accentBorderClassName = 'hover:border-primary/50',
  accentIconBgClassName = 'bg-muted/50',
  accentIconClassName = '',
  icon: Icone = Camera,
}: Props) {
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [comprimindo, setComprimindo] = useState(false)
  const [erro, setErro] = useState('')
  const [jaGravouAntes, setJaGravouAntes] = useState(false)

  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tamanhoAcumuladoRef = useRef(0)
  const fallbackRef = useRef<HTMLInputElement>(null)
  // Evita disparar o fallback duas vezes (ex: onerror e track.onended quase juntos)
  // e faz o onstop ignorar o resultado quando já decidimos cair pro nativo
  const abortadoRef = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => pararCamera(), [])

  // Fix de tela preta: só atribui o stream depois que o <video> realmente monta
  useEffect(() => {
    if (!(cameraAtiva && previewRef.current && streamRef.current)) return
    const video = previewRef.current
    video.srcObject = streamRef.current
    video.play().catch(() => {})

    let resolvido = false
    const timeoutId = setTimeout(() => {
      if (resolvido) return
      resolvido = true
      if (!video.videoWidth) {
        pararCamera()
        acionarFallback()
      }
    }, TIMEOUT_TELA_PRETA_MS)
    const onLoaded = () => { resolvido = true; clearTimeout(timeoutId) }
    video.addEventListener('loadedmetadata', onLoaded)
    return () => {
      clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onLoaded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraAtiva])

  function pararTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
    setGravando(false)
    pararTimer()
  }

  function acionarFallback() {
    if (abortadoRef.current) return
    abortadoRef.current = true
    fallbackRef.current?.click()
  }

  async function iniciarCamera() {
    setErro('')
    abortadoRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: RESOLUCAO_VISTORIA.width }, height: { ideal: RESOLUCAO_VISTORIA.height } },
      })
      streamRef.current = stream
      setCameraAtiva(true)
    } catch {
      acionarFallback()
    }
  }

  function iniciarGravacao() {
    if (!streamRef.current) return

    if (typeof MediaRecorder === 'undefined') {
      pararCamera()
      acionarFallback()
      return
    }

    const bitrate = bitrateParaDispositivo()
    const duracaoMaxima = calcularDuracaoMaxima(bitrate)
    const videoTrack = streamRef.current.getVideoTracks()[0]

    try {
      const mimeType = escolherMimeTypeVideo()
      const recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: bitrate,
      })
      chunksRef.current = []
      tamanhoAcumuladoRef.current = 0
      recorder.ondataavailable = (e) => {
        if (e.data.size <= 0) return
        chunksRef.current.push(e.data)
        tamanhoAcumuladoRef.current += e.data.size
        // Rede de segurança: o bitrate pedido é só uma sugestão pro encoder, que
        // pode estourar. Se o tamanho real já bateu o limite, para na hora.
        if (tamanhoAcumuladoRef.current >= TAMANHO_MAXIMO_BYTES && recorder.state === 'recording') {
          recorder.stop()
        }
      }
      recorder.onstop = () => {
        if (videoTrack) videoTrack.onended = null
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        pararCamera()
        if (abortadoRef.current) return // já caiu pro fallback (erro/câmera perdida) — ignora esse resultado
        if (blob.size === 0) {
          setErro('Vídeo muito curto, tente gravar de novo.')
          return
        }
        const extensao = (mimeType || 'video/webm').includes('mp4') ? 'mp4' : 'webm'
        const file = new File([blob], `video-${Date.now()}.${extensao}`, { type: mimeType || 'video/webm' })
        setJaGravouAntes(true)
        onGravado(file)
      }
      recorder.onerror = () => {
        pararCamera()
        acionarFallback()
      }

      // Câmera pode ser tomada pelo sistema no meio da gravação (ligação chegando,
      // outro app pedindo a câmera, permissão revogada) — sem isso, a gravação
      // fica num limbo até o cronômetro eventualmente resolver.
      if (videoTrack) {
        videoTrack.onended = () => {
          if (recorder.state === 'recording') recorder.stop()
          acionarFallback()
        }
      }

      recorderRef.current = recorder
      recorder.start(250) // timeslice curto: reduz o tamanho do "último pedaço" que pode passar do gatilho antes do stop() ser processado
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          const proximo = s + 1
          if (proximo >= duracaoMaxima && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
          return proximo
        })
      }, 1000)
    } catch {
      pararCamera()
      acionarFallback()
    }
  }

  function pararGravacao() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  // Câmera nativa do aparelho (fallback) não controla resolução/bitrate —
  // precisa comprimir depois, diferente da gravação pela câmera própria
  async function onArquivoFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    abortadoRef.current = false
    if (!file) return
    setErro('')
    setComprimindo(true)
    try {
      const arquivo = await comprimirVideo(file)
      setJaGravouAntes(true)
      onGravado(arquivo)
    } catch {
      setJaGravouAntes(true)
      onGravado(file)
    } finally {
      setComprimindo(false)
    }
  }

  const fallbackInput = (
    <input ref={fallbackRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onArquivoFallback} />
  )

  if (comprimindo) {
    const placeholderClasses = variant === 'dark'
      ? 'border-dashed border-white/20 bg-white/5 text-white/50'
      : 'border-dashed border-zinc-300 text-muted-foreground'
    return (
      <div className="space-y-1.5">
        <div className={`w-full ${triggerHeightClassName} border-2 rounded-xl flex flex-col items-center justify-center gap-2 ${placeholderClasses}`}>
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm font-medium">Comprimindo vídeo...</span>
        </div>
        {fallbackInput}
      </div>
    )
  }

  if (cameraAtiva) {
    const restante = Math.max(0, calcularDuracaoMaxima(bitrateParaDispositivo()) - segundos)
    return (
      <div className="space-y-2">
        <div className="bg-black rounded-xl overflow-hidden relative h-56">
          <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
          {gravando && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              <Circle className="w-2 h-2 fill-white animate-pulse" /> {restante}s restantes
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={pararCamera} disabled={gravando}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          {!gravando ? (
            <Button type="button" className="flex-1 h-11 gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={iniciarGravacao}>
              <Circle className="w-4 h-4 fill-white" /> Gravar
            </Button>
          ) : (
            <Button type="button" className="flex-1 h-11 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white" onClick={pararGravacao}>
              <Square className="w-4 h-4 fill-white" /> Parar
            </Button>
          )}
        </div>
        {fallbackInput}
      </div>
    )
  }

  const rotulo = jaGravouAntes ? labelRegravar : label

  if (variant === 'dark') {
    return (
      <div className="space-y-1.5 w-full">
        <Button
          onClick={iniciarCamera}
          className={
            jaGravouAntes
              ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20 min-h-[44px]'
              : 'bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]'
          }
        >
          <VideoIcon className="w-4 h-4 mr-2" /> {rotulo}
        </Button>
        {erro && <p className="text-xs text-red-400 text-center">{erro}</p>}
        {fallbackInput}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={iniciarCamera}
        className={`w-full ${triggerHeightClassName} border-2 border-dashed border-zinc-300 rounded-xl flex flex-col items-center justify-center gap-3 text-muted-foreground ${accentBorderClassName} transition-colors`}
      >
        <div className={`w-14 h-14 rounded-full ${accentIconBgClassName} flex items-center justify-center`}>
          <Icone className={`w-7 h-7 ${accentIconClassName}`} />
        </div>
        <span className="text-sm font-medium">{rotulo}</span>
      </button>
      {erro && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
      )}
      {fallbackInput}
    </div>
  )
}
