import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const isLoggedIn = request.cookies.get('mc_auth')?.value === '1'
  const { pathname } = request.nextUrl

  if (!isLoggedIn && pathname !== '/login' && !pathname.startsWith('/vistoria-entrega')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Exclui do proxy: assets do Next, favicon, rotas de API e arquivos estáticos
  // da pasta public (qualquer caminho com extensão, ex: .png, .svg)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
}
