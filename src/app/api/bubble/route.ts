import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'

// Proxy server-side para o Bubble — esconde o BUBBLE_PRIVATE_KEY (e a apikey)
// do navegador. O client manda { endpoint, body, format } e essa rota monta
// a chamada real, injetando apikey e o Authorization: Bearer aqui dentro.
// Monta a URL da versão de desenvolvimento do Bubble (version-test) — usada
// enquanto um workflow novo ainda não foi promovido pra live
function bubbleUrl(endpoint: string, versionTest?: boolean): string {
  if (!versionTest) return `${BUBBLE_BASE}/${endpoint}`
  const base = new URL(BUBBLE_BASE)
  base.pathname = `/version-test${base.pathname}`
  return `${base.toString().replace(/\/$/, '')}/${endpoint}`
}

export async function POST(req: NextRequest) {
  try {
    const { endpoint, body, format, versionTest } = await req.json()
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ erro: 'endpoint obrigatório' }, { status: 400 })
    }

    const bodyComApikey = { apikey: BUBBLE_KEY, ...(body ?? {}) }
    const url = bubbleUrl(endpoint, versionTest)
    let res: Response

    if (format === 'json') {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyComApikey),
      })
    } else {
      const form = new FormData()
      for (const [key, value] of Object.entries(bodyComApikey)) {
        if (value !== undefined && value !== null) form.append(key, String(value))
      }
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
        body: form,
      })
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
