'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Componente compartilhado pra fotografar placa com camera propria
// (getUserMedia + moldura-guia recortada) em vez do input nativo do
// celular. Em PC (sem camera traseira) mostra botao de upload junto.
//
// So renderiza a etapa "sem foto ainda" — quem usa fica responsavel por
// mostrar a foto capturada e o botao de remover, chamando onCapture com
// o dataURL (JPEG) assim que uma foto e tirada ou enviada.

const PLACA_GUIDE_W = 176
const PLACA_GUIDE_H = Math.round((PLACA_GUIDE_W * 7) / 8)

type Props = {
  onCapture: (dataUrl: string) => void
  label?: string
  sublabel?: string
  triggerHeightClassName?: string
  accentBorderClassName?: string
  accentIconBgClassName?: string
  accentIconClassName?: string
  // Pede a câmera assim que o componente monta, em vez de esperar clique
  // na caixa tracejada — útil quando quem chama já tem um botão próprio
  // pra abrir a câmera (ex: um botão compacto ao lado de outros campos)
  autoStart?: boolean
}

export function PlacaCameraPicker({
  onCapture,
  label = 'Fotografar placa',
  sublabel = 'Aponte a câmera para a placa',
  triggerHeightClassName = 'h-48',
  accentBorderClassName = 'hover:border-primary/50',
  accentIconBgClassName = 'bg-muted/50',
  accentIconClassName = '',
  autoStart = false,
}: Props) {
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const [erro, setErro] = useState('')
  const [isMobile, setIsMobile] = useState(true)

  const previewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    if (autoStart) iniciarCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // O <video> so existe no DOM depois que cameraAtiva vira true, entao
  // reatribui o stream assim que o elemento for montado
  useEffect(() => {
    if (cameraAtiva && previewRef.current && streamRef.current) {
      previewRef.current.srcObject = streamRef.current
      previewRef.current.play().catch(() => {})
    }
  }, [cameraAtiva])

  async function iniciarCamera() {
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraAtiva(true)
    } catch (err) {
      setErro(`Erro ao acessar a câmera: ${String(err)}`)
    }
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
  }

  function capturarFoto() {
    const video = previewRef.current
    const canvas = canvasRef.current
    const box = boxRef.current
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
    pararCamera()
    onCapture(canvas.toDataURL('image/jpeg', 0.85))
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onCapture(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (cameraAtiva) {
    return (
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div ref={boxRef} className="relative w-full h-64 rounded-xl overflow-hidden bg-black">
          <video ref={previewRef} muted playsInline className="w-full h-full object-cover" />
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
          <Button variant="outline" onClick={pararCamera} className="px-4">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button onClick={capturarFoto} className="flex-1">
            <Camera className="w-4 h-4 mr-2" /> Tirar foto
          </Button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={iniciarCamera}
        className={`w-full ${triggerHeightClassName} border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center gap-3 text-muted-foreground ${accentBorderClassName} transition-colors`}
      >
        <div className={`w-14 h-14 rounded-full ${accentIconBgClassName} flex items-center justify-center`}>
          <Camera className={`w-7 h-7 ${accentIconClassName}`} />
        </div>
        <div className="text-center">
          <span className="text-sm font-medium block">{label}</span>
          <span className="text-xs text-muted-foreground/70">{sublabel}</span>
        </div>
      </button>
      {!isMobile && (
        <Button variant="outline" onClick={() => uploadRef.current?.click()} className="w-full">
          <Upload className="w-4 h-4 mr-2" /> Enviar foto
        </Button>
      )}
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erro}</div>
      )}
    </div>
  )
}
