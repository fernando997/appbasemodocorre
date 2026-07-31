import { NextRequest, NextResponse } from 'next/server'
import { HELENA_API_KEY } from '@/lib/config'

export async function POST(req: NextRequest) {
  try {
    const { cliente, celular, link } = await req.json()

    if (!celular || !link) {
      return NextResponse.json({ erro: 'celular e link são obrigatórios' }, { status: 400 })
    }

    const res = await fetch('https://api.helena.run/chat/v1/message/send', {
      method: 'POST',
      headers: {
        'Authorization': HELENA_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/*+json',
      },
      body: JSON.stringify({
        body: {
          parameters: {
            CLIENTE: String(cliente ?? ''),
            LINK: String(link),
          },
          templateId: '84431_vistoriasubbase',
        },
        from: '08000650101',
        to: String(celular),
        options: {
          forceStartSession: false,
          enableBot: false,
        },
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      return NextResponse.json({ erro: `Helena: ${res.status}`, detalhe: data }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
