// Config compartilhada de gravação por câmera própria (getUserMedia + MediaRecorder),
// usada pelo componente GravadorVideo (vistorias reais) e pela tela de teste-camera.
// Mantém as duas em sincronia — o que for validado num teste vale pro outro.

export const RESOLUCAO_VISTORIA = { width: 854, height: 480 } // 480p

// Safari/iOS historicamente não respeita bem o videoBitsPerSecond pedido — em teste
// real gravou ~40% acima do bitrate solicitado (700kbps reais pedindo 500kbps). Por
// isso pedimos um alvo mais baixo lá, compensando esse excesso, pra manter o tamanho
// final na mesma faixa do Android sem precisar mexer no gatilho de segurança.
export const BITRATE_VISTORIA_PADRAO = 500_000 // 500kbps
export const BITRATE_VISTORIA_IOS = 350_000 // 350kbps

// Mesma margem de segurança do comprimir-video.ts, abaixo dos ~4.5MB da Vercel
export const TAMANHO_MAXIMO_BYTES = 4.3 * 1024 * 1024

export function calcularDuracaoMaxima(bitsPerSecond: number): number {
  return Math.floor((TAMANHO_MAXIMO_BYTES * 8) / bitsPerSecond)
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function bitrateParaDispositivo(): number {
  return isIOS() ? BITRATE_VISTORIA_IOS : BITRATE_VISTORIA_PADRAO
}

export function escolherMimeTypeVideo(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidatos = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const tipo of candidatos) {
    if (MediaRecorder.isTypeSupported(tipo)) return tipo
  }
  return ''
}
