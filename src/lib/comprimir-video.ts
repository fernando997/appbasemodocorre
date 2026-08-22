// Recomprime um vídeo no navegador (redesenha os frames num canvas menor e regrava
// com MediaRecorder) — necessário porque o Vercel limita o corpo das Serverless
// Functions a ~4.5MB, e vídeo gravado direto da câmera do celular costuma passar
// disso fácil. O bitrate passado ao MediaRecorder é só uma sugestão pro navegador,
// não uma garantia — o encoder pode picar acima dele, e alguns navegadores nem
// respeitam bem esse valor ao gravar um canvas (é pior que gravar a câmera direto).
// Por isso: depois de gravar, sempre checamos o tamanho real do blob. Se estourar,
// primeiro tentamos de novo com bitrate menor; se isso não for suficiente, reduzimos
// também a resolução — que limita o tamanho de um jeito mais confiável, já que não
// depende do encoder "obedecer" o bitrate pedido.
type Opcoes = { maxWidth?: number; videoBitsPerSecond?: number }

const TAMANHO_ALVO_BYTES = 3.5 * 1024 * 1024 // alvo do cálculo de bitrate
const TAMANHO_MAXIMO_BYTES = 4.3 * 1024 * 1024 // margem de segurança abaixo dos ~4.5MB da Vercel
const BITRATE_MINIMO = 150_000
const BITRATE_MAXIMO = 4_000_000
const DURACAO_PADRAO_S = 30 // fallback se não der pra descobrir a duração real
const TENTATIVAS_POR_RESOLUCAO = 3 // reduzindo só o bitrate, antes de cair de resolução
const LARGURAS_FALLBACK = [480, 360, 240, 160] // usadas só se a largura inicial ainda estourar

// Safari/iOS não sabe gravar WebM (nenhuma versão) — só MP4/H.264. Se a lista
// não tiver nenhum formato suportado, MediaRecorder() lança erro na hora de
// criar o gravador, ainda antes de qualquer tentativa de compressão.
const CANDIDATOS_MIME = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=h264', 'video/mp4']

function escolherMimeType(): string {
  const suportado = CANDIDATOS_MIME.find(t => MediaRecorder.isTypeSupported(t))
  if (!suportado) throw new Error('Nenhum formato de vídeo suportado neste navegador')
  return suportado
}

export async function comprimirVideo(file: File, opcoes: Opcoes = {}): Promise<File> {
  const larguraInicial = opcoes.maxWidth ?? 640
  const mimeType = escolherMimeType()
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

    const duracao = await obterDuracao(videoEl)

    // Só usa larguras menores que a inicial, na ordem certa
    const larguras = [larguraInicial, ...LARGURAS_FALLBACK.filter(w => w < larguraInicial)]

    let blob: Blob | null = null
    resolucoes: for (const largura of larguras) {
      const { canvas, ctx } = criarCanvas(videoEl, largura)
      let videoBitsPerSecond = opcoes.videoBitsPerSecond ?? calcularBitrate(duracao)

      for (let tentativa = 0; tentativa < TENTATIVAS_POR_RESOLUCAO; tentativa++) {
        blob = await gravar(videoEl, canvas, ctx, videoBitsPerSecond, mimeType)
        if (blob.size <= TAMANHO_MAXIMO_BYTES) break resolucoes
        // Bitrate real saiu maior que o previsto — reduz proporcionalmente ao excesso e tenta de novo
        videoBitsPerSecond = Math.max(BITRATE_MINIMO, Math.round(videoBitsPerSecond * (TAMANHO_ALVO_BYTES / blob.size)))
      }
    }

    const extensao = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    const tipoArquivo = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'
    const novoNome = file.name.replace(/\.\w+$/, '') + '.' + extensao
    return new File([blob!], novoNome, { type: tipoArquivo })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function criarCanvas(videoEl: HTMLVideoElement, maxWidth: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(videoEl.videoWidth * scale) || maxWidth
  canvas.height = Math.round(videoEl.videoHeight * scale) || maxWidth
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')
  return { canvas, ctx }
}

function calcularBitrate(duracaoS: number): number {
  const bitrateCalculado = Math.round((TAMANHO_ALVO_BYTES * 8) / duracaoS)
  return Math.min(BITRATE_MAXIMO, Math.max(BITRATE_MINIMO, bitrateCalculado))
}

// Em vídeos gravados pelo celular, videoEl.duration às vezes vem Infinity/NaN até
// se buscar o fim do arquivo (bug conhecido do Chrome com certos containers). Sem
// esse ajuste, o cálculo de bitrate usava o fallback fixo mesmo pra vídeos bem mais
// longos, gerando arquivos muito maiores que o alvo.
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

function gravar(videoEl: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, videoBitsPerSecond: number, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
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
