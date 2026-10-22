import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_AUTH_TOKEN } from '@/lib/config'

// Proxy server-side pro Supabase de pedidos — esconde as chaves do navegador.
// acao 'consultar' → consultar-pedido { numero }
// acao 'receber'   → receber-veiculo { pedido_numero, chassi }
export async function POST(req: NextRequest) {
  try {
    const { acao, ...body } = await req.json()

    let res: Response
    if (acao === 'consultar') {
      res = await fetch(`${SUPABASE_URL}/consultar-pedido`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ numero: body.numero }),
      })
    } else if (acao === 'receber') {
      res = await fetch(`${SUPABASE_URL}/receber-veiculo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'x-api-key': BUBBLE_KEY,
        },
        body: JSON.stringify({ pedido_numero: body.pedido_numero, chassi: body.chassi }),
      })
    } else {
      return NextResponse.json({ erro: 'acao inválida' }, { status: 400 })
    }

    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
