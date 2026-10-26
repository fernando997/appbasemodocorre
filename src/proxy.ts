import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { COOKIE_SESSAO, verificarToken } from '@/lib/sessao'

// Rotas de API abertas sem sessão:
// - login/logo: usadas antes de logar
// - bubble: confere sozinha (sem sessão só aceita os endpoints públicos)
// - usadas pelas telas /vistoria-entrega*, que o cliente abre sem login
// - chamadas por sistemas de fora, que têm a própria checagem (APP_API_KEY)
//   ou ainda não têm (webhook-instalacao — chamado pela ModoTrack)
const API_PUBLICAS = [
  '/api/login',
  '/api/logout',
  '/api/logo',
  '/api/bubble',
  '/api/ler-placa',
  '/api/upload-foto',
  '/api/rastreador',
  '/api/validar-facial',
  '/api/modotrack-criar-os-manutencao',
  '/api/modotrack-transferir-unidade',
  '/api/webhook-instalacao',
]

function paginaPublica(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/vistoria-entrega')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessao = await verificarToken(request.cookies.get(COOKIE_SESSAO)?.value)

  if (pathname.startsWith('/api/')) {
    if (sessao || API_PUBLICAS.includes(pathname)) return NextResponse.next()
    return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
  }

  if (!sessao && !paginaPublica(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (sessao && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Exclui do proxy: assets do Next, favicon e arquivos estáticos da pasta
  // public (qualquer caminho com extensão, ex: .png, .svg). As rotas /api
  // passam pelo proxy para exigir sessão.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
