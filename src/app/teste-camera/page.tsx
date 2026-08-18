'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Square, Download, RotateCcw, Video as VideoIcon, ImageIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'

// Tela isolada só pra testar câmera própria (getUserMedia + MediaRecorder) com
// resolução/bitrate limitados NA GRAVAÇÃO, em vez de comprimir depois.
// Também testa captura de FOTO (getUserMedia + canvas) com moldura de rosto,
// prototipo pra etapa de selfie da vistoria de entrega.
// Não está ligada a nenhuma vistoria — é só um laboratório de teste.

const RESOLUCOES = [
  { label: '360p', width: 640, height: 360 },
  { label: '480p', width: 854, height: 480 },
  { label: '720p', width: 1280, height: 720 },
] as const

const BITRATES = [
  { label: '250 kbps', value: 250_000 },
  { label: '500 kbps', value: 500_000 },
  { label: '1 Mbps', value: 1_000_000 },
  { label: '2 Mbps', value: 2_000_000 },
] as const

function escolherMimeType(): string {
  const candidatos = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const tipo of candidatos) {
    if (MediaRecorder.isTypeSupported(tipo)) return tipo
  }
  return ''
}

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2)
}

export default function TesteCameraPage() {
  const [modo, setModo] = useState<'video' | 'foto'>('video')
  const [resolucao, setResolucao] = useState<(typeof RESOLUCOES)[number]>(RESOLUCOES[0])
  const [bitrate, setBitrate] = useState<(typeof BITRATES)[number]>(BITRATES[0])
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [ajusteReal, setAjusteReal] = useState<{ width?: number; height?: number } | null>(null)

  const [resultado, setResultado] = useState<{ url: string; tamanho: number; duracao: number; mimeType: string } | null>(null)
  const [fotoResultado, setFotoResultado] = useState<{ url: string; tamanho: number } | null>(null)

  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      const nome = String(user?.Nome ?? user?.nome ?? '').trim().toUpperCase()
      setAutorizado(nome === 'RAFAEL VULCANO')
    } catch {
      setAutorizado(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      pararCamera()
      if (resultado) URL.revokeObjectURL(resultado.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function iniciarCamera() {
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: modo === 'foto'
          ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }
          : { facingMode: 'environment', width: { ideal: resolucao.width }, height: { ideal: resolucao.height } },
      })
      streamRef.current = stream
      if (previewRef.current) {
        previewRef.current.srcObject = stream
        await previewRef.current.play().catch(() => {})
      }
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings()
      setAjusteReal({ width: settings?.width, height: settings?.height })
      setCameraAtiva(true)
    } catch (err) {
      setErro(`Erro ao acessar a câmera: ${String(err)}`)
    }
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
    setAjusteReal(null)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function capturarFoto() {
    const video = previewRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (modo === 'foto') {
      // Câmera frontal: espelha a captura pra bater com o preview (efeito selfie)
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.75)
    const tamanho = Math.round((url.length * 3) / 4) // base64 -> bytes aproximado
    setFotoResultado({ url, tamanho })
    pararCamera()
  }

  function iniciarGravacao() {
    if (!streamRef.current) return
    setErro('')
    if (resultado) { URL.revokeObjectURL(resultado.url); setResultado(null) }

    const mimeType = escolherMimeType()
    try {
      const recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: bitrate.value,
      })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        setResultado({ url, tamanho: blob.size, duracao: segundos, mimeType: mimeType || 'video/webm' })
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      }
      recorder.onerror = () => setErro('Erro ao gravar vídeo.')

      recorderRef.current = recorder
      recorder.start()
      setGravando(true)
      setSegundos(0)
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    } catch (err) {
      setErro(`Erro ao iniciar gravação: ${String(err)}`)
    }
  }

  function pararGravacao() {
    recorderRef.current?.stop()
    setGravando(false)
  }

  if (autorizado === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    )
  }

  if (!autorizado) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-sm">
          <p className="text-sm font-semibold text-red-800">Acesso restrito</p>
          <p className="text-xs text-red-700 mt-1">Essa tela de teste não está disponível para o seu usuário.</p>
        </div>
      </div>
    )
  }

  // Enquanto a câmera está ligada e ainda não tem resultado, esconde o resto
  // da tela e limita o preview a uma fração da tela — sobra espaço garantido
  // pros botões sem precisar calcular a altura exata do cabeçalho do app
  const modoCaptura = cameraAtiva && !resultado && !fotoResultado

  return (
    <>
      <PageHeader
        title="Teste — Câmera Própria"
        description="Laboratório isolado, não usado em nenhuma vistoria ainda"
        icon={<VideoIcon className="w-5 h-5 text-white" />}
      />
      <div className="px-4 sm:px-6 py-4 max-w-2xl mx-auto flex flex-col gap-4">

        {!cameraAtiva && (
          <>
            {/* Toggle Vídeo/Foto */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setModo('video'); setFotoResultado(null) }}
                className={`py-2.5 rounded-lg text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-all ${
                  modo === 'video'
                    ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md'
                    : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                }`}
              >
                <VideoIcon className="w-4 h-4" /> Vídeo
              </button>
              <button
                onClick={() => { setModo('foto'); setResultado(null) }}
                className={`py-2.5 rounded-lg text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-all ${
                  modo === 'foto'
                    ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md'
                    : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                }`}
              >
                <ImageIcon className="w-4 h-4" /> Foto
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              {modo === 'video'
                ? 'Testa gravação com resolução/bitrate limitados desde o começo, em vez de comprimir depois.'
                : 'Testa captura de foto (câmera frontal) com moldura de rosto, qualidade JPEG 75%.'}
              {' '}Nada aqui é enviado pra lugar nenhum.
            </div>

            {/* Configurações — só fazem sentido pro modo vídeo */}
            {modo === 'video' && (
              <div className="bg-white border rounded-xl p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Resolução pedida</label>
                  <div className="grid grid-cols-3 gap-2">
                    {RESOLUCOES.map((r) => (
                      <button
                        key={r.label}
                        onClick={() => setResolucao(r)}
                        className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                          resolucao.label === r.label
                            ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md scale-[1.03]'
                            : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Bitrate</label>
                  <div className="grid grid-cols-4 gap-2">
                    {BITRATES.map((b) => (
                      <button
                        key={b.label}
                        onClick={() => setBitrate(b)}
                        className={`py-2.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                          bitrate.label === b.label
                            ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md scale-[1.03]'
                            : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 shrink-0">{erro}</div>
        )}

        {/* Preview */}
        <div className={`bg-black rounded-xl overflow-hidden relative shrink-0 ${modoCaptura ? 'h-[42vh]' : 'h-64'}`}>
          <video ref={previewRef} muted playsInline className={`w-full h-full object-cover ${modo === 'foto' ? 'scale-x-[-1]' : ''}`} />
          <canvas ref={canvasRef} className="hidden" />
          {modo === 'foto' && cameraAtiva && !fotoResultado && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-[62%] aspect-[3/4] rounded-[50%] border-2 border-white/80"
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
              />
            </div>
          )}
          {!cameraAtiva && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/70 text-sm">
              Câmera desligada
            </div>
          )}
          {gravando && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
              <Circle className="w-2 h-2 fill-white animate-pulse" /> {segundos}s
            </div>
          )}
          {ajusteReal && (
            <div className="absolute top-3 right-3 bg-black/60 text-white/90 text-[11px] font-mono px-2 py-1 rounded-full">
              {ajusteReal.width}×{ajusteReal.height}
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="flex gap-2 shrink-0">
          {!cameraAtiva ? (
            <Button className="flex-1 gap-2 h-14 text-base font-bold shadow-md" onClick={iniciarCamera}>
              <Camera className="w-5 h-5" /> Ligar câmera
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="gap-2 h-14 px-4 border-2"
                onClick={pararCamera}
                disabled={gravando}
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
              {modo === 'foto' ? (
                <Button className="flex-1 gap-2 h-14 text-base font-bold shadow-md" onClick={capturarFoto}>
                  <Camera className="w-5 h-5" /> Tirar foto
                </Button>
              ) : !gravando ? (
                <Button className="flex-1 gap-2 h-14 text-base font-bold bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/30" onClick={iniciarGravacao}>
                  <Circle className="w-5 h-5 fill-white" /> Gravar
                </Button>
              ) : (
                <Button className="flex-1 gap-2 h-14 text-base font-bold bg-zinc-900 hover:bg-zinc-800 shadow-md" onClick={pararGravacao}>
                  <Square className="w-5 h-5 fill-white" /> Parar
                </Button>
              )}
            </>
          )}
        </div>

        {/* Resultado — foto */}
        {fotoResultado && (
          <div className="bg-white border rounded-xl p-4 space-y-3 shrink-0">
            <p className="text-sm font-semibold">Resultado da foto</p>
            <img src={fotoResultado.url} alt="Foto capturada" className="w-full rounded-lg border" />
            <div className="bg-muted/50 rounded-lg py-2 text-center">
              <p className="text-xs text-muted-foreground">Tamanho</p>
              <p className="text-sm font-bold">{fmtMB(fotoResultado.tamanho)} MB</p>
            </div>
            <div className="flex gap-2">
              <a href={fotoResultado.url} download="teste-foto.jpg" className="flex-1">
                <Button variant="outline" className="w-full gap-2">
                  <Download className="w-4 h-4" /> Baixar foto
                </Button>
              </a>
              <Button variant="outline" className="gap-2" onClick={() => { setFotoResultado(null); iniciarCamera() }}>
                Tirar de novo
              </Button>
            </div>
          </div>
        )}

        {/* Resultado — vídeo */}
        {resultado && (
          <div className="bg-white border rounded-xl p-4 space-y-3 shrink-0">
            <p className="text-sm font-semibold">Resultado da gravação</p>
            <video src={resultado.url} controls className="w-full rounded-lg border" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg py-2">
                <p className="text-xs text-muted-foreground">Tamanho</p>
                <p className="text-sm font-bold">{fmtMB(resultado.tamanho)} MB</p>
              </div>
              <div className="bg-muted/50 rounded-lg py-2">
                <p className="text-xs text-muted-foreground">Duração</p>
                <p className="text-sm font-bold">{resultado.duracao}s</p>
              </div>
              <div className="bg-muted/50 rounded-lg py-2">
                <p className="text-xs text-muted-foreground">Formato</p>
                <p className="text-sm font-bold">{resultado.mimeType.split(';')[0].split('/')[1]}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={resultado.url} download={`teste-camera.${resultado.mimeType.includes('mp4') ? 'mp4' : 'webm'}`} className="flex-1">
                <Button variant="outline" className="w-full gap-2">
                  <Download className="w-4 h-4" /> Baixar vídeo
                </Button>
              </a>
              <Button variant="outline" className="gap-2" onClick={() => { URL.revokeObjectURL(resultado.url); setResultado(null) }}>
                Gravar de novo
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
