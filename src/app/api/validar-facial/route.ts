import { NextRequest, NextResponse } from 'next/server'
import { FACIAL_API_URL, FACIAL_API_KEY } from '@/lib/config'

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const selfie = formData.get('selfie') as File | null
  const cnhImagem = formData.get('cnh_imagem') as File | null

  if (!selfie || !cnhImagem) {
    return NextResponse.json({ error: 'selfie e cnh_imagem são obrigatórios' }, { status: 400 })
  }

  const body = new FormData()
  body.append('selfie', selfie, selfie.name || 'selfie.jpg')
  body.append('cnh_pdf', '')
  body.append('cnh_imagem', cnhImagem, cnhImagem.name || 'cnh.jpg')

  const res = await fetch(FACIAL_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'x-api-key': FACIAL_API_KEY,
    },
    body,
  })

  const data = await res.json()
  return NextResponse.json(data)
}
