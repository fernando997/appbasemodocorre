// Recomprime um vídeo no navegador (redesenha os frames num canvas menor e regrava
// com MediaRecorder) — necessário porque o Vercel limita o corpo das Serverless
// Functions a ~4.5MB, e vídeo gravado direto da câmera do celular costuma passar
// disso fácil. O bitrate é calculado a partir da duração do vídeo pra usar o máximo
// de qualidade possível sem estourar o limite. Como o bitrate passado ao MediaRecorder
// é uma média (o encoder pode picar acima dele em cenas com movimento), depois de
// gravar checamos o tamanho real do blob e, se ainda estourar, regravamos com um
// bitrate menor — em vez de confiar cegamente no cálculo prévio.
type Opcoes = { maxWidth?: number; videoBitsPerSecond?: number }

const TAMANHO_ALVO_BYTES = 3.5 * 1024 * 1024 // alvo do cálculo de bitrate
const TAMANHO_MAXIMO_BYTES = 4.3 * 1024 * 1024 // margem de segurança abaixo dos ~4.5MB da Vercel
const BITRATE_MINIMO = 150_000
const BITRATE_MAXIMO = 4_000_000
const DURACAO_PADRAO_S = 30 // fallback se não der pra descobrir a duração real
const MAX_TENTATIVAS = 3

export async function comprimirVideo(file: File, opcoes: Opcoes = {}): Promise<File> {
  const { maxWidth = 640 } = opcoes
  const url = URL.createObjectURL(file)
  const videoEl = document.createElement('video')
  videoEl.muted = true
  videoEl.playsInline = true
  videoEl.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve()
      videoEl.onerror = () => reject(new Error('Erro ao carregar vídeo'))
    })

    const scale = Math.min(1, maxWidth / videoEl.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(videoEl.videoWidth * scale) || maxWidth
    canvas.height = Math.round(videoEl.videoHeight * scale) || maxWidth
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas não suportado')

    const duracao = await obterDuracao(videoEl)
    let videoBitsPerSecond = opcoes.videoBitsPerSecond ?? calcularBitrate(duracao)

    let blob: Blob | null = null
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      blob = await gravar(videoEl, canvas, ctx, videoBitsPerSecond)
      if (blob.size <= TAMANHO_MAXIMO_BYTES) break
      // Bitrate real saiu maior que o previsto — reduz proporcionalmente ao excesso e tenta de novo
      videoBitsPerSecond = Math.max(BITRATE_MINIMO, Math.round(videoBitsPerSecond * (TAMANHO_ALVO_BYTES / blob.size)))
    }

    const novoNome = file.name.replace(/\.\w+$/, '') + '.webm'
    return new File([blob!], novoNome, { type: 'video/webm' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function calcularBitrate(duracaoS: number): number {
  const bitrateCalculado = Math.round((TAMANHO_ALVO_BYTES * 8) / duracaoS)
  return Math.min(BITRATE_MAXIMO, Math.max(BITRATE_MINIMO, bitrateCalculado))
}

// Em vídeos gravados pelo celular, videoEl.duration às vezes vem Infinity/NaN até
// se buscar o fim do arquivo (bug conhecido do Chrome com certos containers). Sem
// esse ajuste, o cálculo de bitrate usava o fallback fixo de 15s mesmo pra vídeos
// bem mais longos, gerando arquivos muito maiores que o alvo.
function obterDuracao(videoEl: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    return Promise.resolve(videoEl.duration)
  }

  return new Promise((resolve) => {
    const finalizar = (duracao: number) => {
      videoEl.removeEventListener('durationchange', onDurationChange)
      clearTimeout(timeoutId)
      videoEl.currentTime = 0
      resolve(duracao)
    }
    const onDurationChange = () => {
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) finalizar(videoEl.duration)
    }
    videoEl.addEventListener('durationchange', onDurationChange)
    videoEl.currentTime = Number.MAX_SAFE_INTEGER
    const timeoutId = setTimeout(() => finalizar(DURACAO_PADRAO_S), 1500)
  })
}

function gravar(videoEl: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, videoBitsPerSecond: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    recorder.onerror = () => reject(new Error('Erro ao comprimir vídeo'))

    videoEl.onended = () => recorder.stop()
    videoEl.onerror = () => reject(new Error('Erro ao carregar vídeo'))

    videoEl.currentTime = 0
    videoEl.play().then(() => {
      recorder.start()
      const desenhar = () => {
        if (videoEl.paused || videoEl.ended) return
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
        requestAnimationFrame(desenhar)
      }
      desenhar()
    }).catch(reject)
  })
}
