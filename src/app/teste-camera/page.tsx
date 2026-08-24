'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Square, Download, RotateCcw, Video as VideoIcon, ImageIcon, Upload } from 'lucide-react'
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

// Mesma margem de segurança do comprimir-video.ts, abaixo dos ~4.5MB da Vercel
const TAMANHO_MAXIMO_BYTES = 4.3 * 1024 * 1024

function calcularDuracaoMaxima(bitsPerSecond: number): number {
  return Math.floor((TAMANHO_MAXIMO_BYTES * 8) / bitsPerSecond)
}

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
  const [modo, setModo] = useState<'video' | 'foto' | 'selfie' | 'placa'>('video')
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
  const tamanhoAcumuladoRef = useRef(0)
  const segundosRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const placaBoxRef = useRef<HTMLDivElement>(null)
  const placaUploadRef = useRef<HTMLInputElement>(null)
  const [isMobile, setIsMobile] = useState(true)

  // Tamanho fixo (em px) da janela-guia da placa — precisa bater com as
  // classes w-44/aspect-[8/7] usadas no JSX pra recortar certo na captura
  const PLACA_GUIDE_W = 176
  const PLACA_GUIDE_H = Math.round((PLACA_GUIDE_W * 7) / 8)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('mc_user') ?? '{}')
      const nome = String(user?.Nome ?? user?.nome ?? '').trim().toUpperCase()
      setAutorizado(nome === 'RAFAEL VULCANO')
    } catch {
      setAutorizado(false)
    }
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
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
      const frontal = modo === 'foto' || modo === 'selfie'
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: frontal
          ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }
          : modo === 'placa'
            ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
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

  function onUploadPlaca(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      setFotoResultado({ url, tamanho: file.size })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (modo === 'placa') {
      // Video usa object-cover dentro do container — precisa recalcular o
      // recorte da janela-guia em coordenadas do video de origem
      const box = placaBoxRef.current
      if (!box) return
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
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
    } else {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      if (modo === 'foto' || modo === 'selfie') {
        // Câmera frontal: espelha a captura pra bater com o preview (efeito selfie)
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

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
    const duracaoMaxima = calcularDuracaoMaxima(bitrate.value)
    try {
      const recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: bitrate.value,
      })
      chunksRef.current = []
      tamanhoAcumuladoRef.current = 0
      recorder.ondataavailable = (e) => {
        if (e.data.size <= 0) return
        chunksRef.current.push(e.data)
        tamanhoAcumuladoRef.current += e.data.size
        // Rede de segurança: o bitrate pedido é só uma sugestão pro encoder, que pode
        // estourar (cena com movimento). Se o tamanho real já bateu o limite, para na
        // hora, sem esperar o cronômetro acabar.
        if (tamanhoAcumuladoRef.current >= TAMANHO_MAXIMO_BYTES && recorder.state === 'recording') {
          recorder.stop()
        }
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        setResultado({ url, tamanho: blob.size, duracao: segundosRef.current, mimeType: mimeType || 'video/webm' })
        setGravando(false)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      }
      recorder.onerror = () => setErro('Erro ao gravar vídeo.')

      recorderRef.current = recorder
      recorder.start(1000) // timeslice de 1s pra conseguir medir o tamanho real durante a gravação
      setGravando(true)
      setSegundos(0)
      segundosRef.current = 0
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          const proximo = s + 1
          segundosRef.current = proximo
          if (proximo >= duracaoMaxima && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
          return proximo
        })
      }, 1000)
    } catch (err) {
      setErro(`Erro ao iniciar gravação: ${String(err)}`)
    }
  }

  function pararGravacao() {
    recorderRef.current?.stop()
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
            {/* Toggle Vídeo/Foto/Selfie/Placa */}
            <div className="grid grid-cols-4 gap-2">
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
              <button
                onClick={() => { setModo('selfie'); setResultado(null) }}
                className={`py-2.5 rounded-lg text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-all ${
                  modo === 'selfie'
                    ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md'
                    : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                }`}
              >
                <Camera className="w-4 h-4" /> Selfie
              </button>
              <button
                onClick={() => { setModo('placa'); setResultado(null) }}
                className={`py-2.5 rounded-lg text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-all ${
                  modo === 'placa'
                    ? 'bg-[#1B2043] text-white border-[#1B2043] shadow-md'
                    : 'bg-background text-muted-foreground border-input hover:border-[#1B2043]/40'
                }`}
              >
                <Square className="w-4 h-4" /> Placa
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              {modo === 'video'
                ? 'Testa gravação com resolução/bitrate limitados desde o começo, em vez de comprimir depois.'
                : modo === 'foto'
                  ? 'Testa captura de foto (câmera frontal) com moldura de rosto, qualidade JPEG 75%.'
                  : modo === 'selfie'
                    ? 'Prévia exata do card da etapa de selfie da vistoria de entrega, ainda sem aplicar lá.'
                    : 'Câmera traseira com moldura retangular guia pra foto de placa, prototipo pra substituir a câmera nativa do celular.'}
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

                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                  Com esse bitrate, o limite de gravação é de <strong>{calcularDuracaoMaxima(bitrate.value)}s</strong> pra não passar de 4.3MB.
                </div>
              </div>
            )}
          </>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 shrink-0">{erro}</div>
        )}

        {modo === 'selfie' && (
          <div
            className="rounded-2xl p-[1px]"
            style={{ background: 'linear-gradient(135deg, #6C63FF60, transparent 50%, #6C63FF30)' }}
          >
            <div className="bg-[#0D1229] rounded-2xl p-6 flex flex-col items-center gap-4">
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center"
                  style={{ backgroundColor: '#6C63FF20', boxShadow: '0 0 30px #6C63FF25' }}
                >
                  <Camera className="w-10 h-10" style={{ color: '#6C63FF' }} />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-white">Tire uma selfie</h2>
                <p className="text-sm text-white/60 mt-1">Precisamos de uma foto sua para identificação.</p>
              </div>

              {fotoResultado ? (
                <div
                  className="relative w-56 aspect-[3/4] rounded-full overflow-hidden bg-black"
                  style={{ border: '3px solid #6C63FF', boxShadow: '0 0 25px rgba(108,99,255,0.3)' }}
                >
                  <img src={fotoResultado.url} alt="Selfie capturada" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div
                  className="relative w-56 aspect-[3/4] rounded-full overflow-hidden bg-black"
                  style={cameraAtiva ? { border: '3px solid #6C63FF', boxShadow: '0 0 25px rgba(108,99,255,0.3)' } : undefined}
                >
                  <video ref={previewRef} muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  {!cameraAtiva && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/50 text-xs text-center px-4">
                      Câmera desligada
                    </div>
                  )}
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />

              {fotoResultado ? (
                <Button
                  onClick={() => { setFotoResultado(null); iniciarCamera() }}
                  className="bg-white/10 border border-white/20 text-white hover:bg-white/20 min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" /> Tirar novamente
                </Button>
              ) : cameraAtiva ? (
                <Button
                  onClick={capturarFoto}
                  className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" /> Tirar foto
                </Button>
              ) : (
                <Button
                  onClick={iniciarCamera}
                  className="bg-[#22C55E] hover:bg-[#16A34A] shadow-[0_4px_15px_rgba(34,197,94,0.4)] text-white min-h-[44px]"
                >
                  <Camera className="w-4 h-4 mr-2" /> Ligar Camera
                </Button>
              )}
            </div>
          </div>
        )}

        {modo === 'placa' && (
          <div className="bg-white border rounded-xl p-6 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center">
              <Square className="w-10 h-10 text-blue-600" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">Tire uma foto da placa</h2>
              <p className="text-sm text-muted-foreground mt-1">Encaixe a placa dentro da moldura.</p>
            </div>

              {fotoResultado ? (
                <div className="relative w-full rounded-xl overflow-hidden bg-black border-2 border-blue-500">
                  <img src={fotoResultado.url} alt="Placa capturada" className="w-full h-auto" />
                </div>
              ) : (
                <div ref={placaBoxRef} className="relative w-full h-64 rounded-xl overflow-hidden bg-black">
                  <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
                  {cameraAtiva && (
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
                  )}
                  {!cameraAtiva && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/50 text-xs text-center px-4">
                      Câmera desligada
                    </div>
                  )}
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
              <input ref={placaUploadRef} type="file" accept="image/*" className="hidden" onChange={onUploadPlaca} />

              {fotoResultado ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setFotoResultado(null); iniciarCamera() }}
                    className="min-h-[44px]"
                  >
                    <Camera className="w-4 h-4 mr-2" /> Tirar novamente
                  </Button>
                  {!isMobile && (
                    <Button
                      variant="outline"
                      onClick={() => { setFotoResultado(null); placaUploadRef.current?.click() }}
                      className="min-h-[44px]"
                    >
                      <Upload className="w-4 h-4 mr-2" /> Enviar outra
                    </Button>
                  )}
                </div>
              ) : cameraAtiva ? (
                <Button onClick={capturarFoto} className="min-h-[44px]">
                  <Camera className="w-4 h-4 mr-2" /> Tirar foto
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={iniciarCamera} className="min-h-[44px]">
                    <Camera className="w-4 h-4 mr-2" /> Ligar Camera
                  </Button>
                  {!isMobile && (
                    <Button
                      variant="outline"
                      onClick={() => placaUploadRef.current?.click()}
                      className="min-h-[44px]"
                    >
                      <Upload className="w-4 h-4 mr-2" /> Enviar foto
                    </Button>
                  )}
                </div>
              )}
          </div>
        )}

        {modo !== 'selfie' && modo !== 'placa' && (
        <>
        {/* Preview */}
        <div className={`bg-black rounded-xl overflow-hidden relative shrink-0 ${modoCaptura ? 'h-[42vh]' : 'h-64'} ${modo === 'foto' ? 'flex items-center justify-center' : ''}`}>
          {modo === 'foto' ? (
            <div
              className="relative w-56 aspect-[3/4] rounded-full overflow-hidden bg-black"
              style={cameraAtiva ? { border: '3px solid #6C63FF', boxShadow: '0 0 25px rgba(108,99,255,0.3)' } : undefined}
            >
              <video
                ref={previewRef}
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
          ) : (
            <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
          )}
          <canvas ref={canvasRef} className="hidden" />
          {!cameraAtiva && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/70 text-sm">
              Câmera desligada
            </div>
          )}
          {gravando && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
              <Circle className="w-2 h-2 fill-white animate-pulse" />
              {Math.max(0, calcularDuracaoMaxima(bitrate.value) - segundos)}s restantes
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
        </>
        )}
      </div>
    </>
  )
}
