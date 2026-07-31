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
        from: '08000650101',
        body: {
          parameters: {
            CLIENTE: String(cliente ?? ''),
            LINK: String(link),
          },
          templateId: '88b8479c-9652-4373-ab91-afef0ffd4ccc',
        },
        to: String(celular),
        botId: '2292981a-b6be-4782-98ea-e0a205e53bfe',
        options: {
          enableBot: true,
          forceStartSession: true,
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
