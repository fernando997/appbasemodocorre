// Recomprime um vídeo no navegador via ffmpeg.wasm (decodifica/recodifica direto,
// sem precisar tocar o vídeo em tempo real) — necessário porque o Vercel limita o corpo
// das Serverless Functions a ~4.5MB, e vídeo gravado direto da câmera do celular
// costuma passar disso fácil.
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

type Opcoes = { maxWidth?: number; videoBitsPerSecond?: number }

// Core (~30MB) é baixado uma vez e reaproveitado entre chamadas/vídeos
let ffmpegPromise: Promise<FFmpeg> | null = null

function carregarFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: '/ffmpeg/ffmpeg-core.js',
        wasmURL: '/ffmpeg/ffmpeg-core.wasm',
      })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

export async function comprimirVideo(file: File, opcoes: Opcoes = {}): Promise<File> {
  const { maxWidth = 360, videoBitsPerSecond = 250_000 } = opcoes
  const ffmpeg = await carregarFfmpeg()

  const extEntrada = file.name.match(/\.\w+$/)?.[0] ?? '.mp4'
  const nomeEntrada = `entrada${extEntrada}`
  const nomeSaida = 'saida.mp4'

  await ffmpeg.writeFile(nomeEntrada, await fetchFile(file))
  try {
    await ffmpeg.exec([
      '-i', nomeEntrada,
      '-vf', `scale='min(${maxWidth},iw)':-2`,
      '-b:v', `${Math.round(videoBitsPerSecond / 1000)}k`,
      '-an',
      nomeSaida,
    ])
    const data = await ffmpeg.readFile(nomeSaida)
    const novoNome = file.name.replace(/\.\w+$/, '') + '.mp4'
    return new File([data as BlobPart], novoNome, { type: 'video/mp4' })
  } finally {
    await ffmpeg.deleteFile(nomeEntrada).catch(() => {})
    await ffmpeg.deleteFile(nomeSaida).catch(() => {})
  }
}
