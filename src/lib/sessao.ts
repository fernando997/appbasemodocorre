// Sessão do app da base: cookie HttpOnly com um token assinado (HMAC-SHA256)
// pela SESSION_SECRET. Usa Web Crypto para funcionar no proxy.ts e nas rotas.
// Só roda no servidor — nunca importar em componente 'use client'.

export const COOKIE_SESSAO = 'mc_sessao'
export const DURACAO_SESSAO_S = 60 * 60 * 24 // 24h, igual aos cookies antigos

export type Sessao = {
  uid: string   // _id do User-base
  tipo: string  // ADMIN / USUARIO
  exp: number   // epoch ms
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4)
  const s = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

async function chave(): Promise<CryptoKey> {
  const segredo = process.env.SESSION_SECRET
  if (!segredo) throw new Error('SESSION_SECRET não configurada')
  return crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function criarToken(dados: Omit<Sessao, 'exp'>): Promise<string> {
  const sessao: Sessao = { ...dados, exp: Date.now() + DURACAO_SESSAO_S * 1000 }
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(sessao)))
  const assinatura = await crypto.subtle.sign('HMAC', await chave(), new TextEncoder().encode(corpo))
  return `${corpo}.${base64url(new Uint8Array(assinatura))}`
}

// Devolve a sessão se o token for válido e não tiver expirado; senão null
export async function verificarToken(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null
  try {
    const [corpo, assinatura] = token.split('.')
    if (!corpo || !assinatura) return null
    const valido = await crypto.subtle.verify('HMAC', await chave(), deBase64url(assinatura), new TextEncoder().encode(corpo))
    if (!valido) return null
    const sessao = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as Sessao
    if (!sessao.uid || typeof sessao.exp !== 'number' || sessao.exp < Date.now()) return null
    return sessao
  } catch {
    return null
  }
}
