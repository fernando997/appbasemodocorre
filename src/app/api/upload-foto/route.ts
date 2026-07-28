import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_FILEUPLOAD, BUBBLE_PRIVATE_KEY } from '@/lib/config'

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData()
    const file = incoming.get('foto') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo não enviado' }, { status: 400 })

    const form = new FormData()
    form.append('filedata', file, file.name)

    const res = await fetch(BUBBLE_FILEUPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
      body: form,
    })

    const text = await res.text()
    if (!res.ok) return NextResponse.json({ error: text }, { status: res.status })

    const path = JSON.parse(text) as string
    return NextResponse.json({ url: 'https:' + path })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
