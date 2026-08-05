// Recomprime um vídeo no navegador (redesenha os frames num canvas menor e regrava
// com MediaRecorder em bitrate baixo) — necessário porque o Vercel limita o corpo
// das Serverless Functions a ~4.5MB, e vídeo gravado direto da câmera do celular
// costuma passar disso fácil.
type Opcoes = { maxWidth?: number; videoBitsPerSecond?: number }

export async function comprimirVideo(file: File, opcoes: Opcoes = {}): Promise<File> {
  const { maxWidth = 480, videoBitsPerSecond = 500_000 } = opcoes

  return new Promise((resolve, reject) => {
    const videoEl = document.createElement('video')
    videoEl.muted = true
    videoEl.playsInline = true
    const url = URL.createObjectURL(file)
    videoEl.src = url

    videoEl.onloadedmetadata = () => {
      const scale = Math.min(1, maxWidth / videoEl.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(videoEl.videoWidth * scale) || maxWidth
      canvas.height = Math.round(videoEl.videoHeight * scale) || maxWidth
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas não suportado'))
        return
      }

      const stream = canvas.captureStream(30)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        URL.revokeObjectURL(url)
        const blob = new Blob(chunks, { type: 'video/webm' })
        const novoNome = file.name.replace(/\.\w+$/, '') + '.webm'
        resolve(new File([blob], novoNome, { type: 'video/webm' }))
      }
      recorder.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Erro ao comprimir vídeo'))
      }

      videoEl.onended = () => recorder.stop()
      videoEl.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Erro ao carregar vídeo'))
      }

      videoEl.play().then(() => {
        recorder.start()
        const desenhar = () => {
          if (videoEl.paused || videoEl.ended) return
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
          requestAnimationFrame(desenhar)
        }
        desenhar()
      }).catch((err) => {
        URL.revokeObjectURL(url)
        reject(err)
      })
    }

    videoEl.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Erro ao carregar vídeo'))
    }
  })
}
