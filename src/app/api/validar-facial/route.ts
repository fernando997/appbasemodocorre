import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const selfie = formData.get('selfie') as File | null
  const cnhImagem = formData.get('cnh_imagem') as File | null

  if (!selfie || !cnhImagem) {
    return NextResponse.json({ error: 'selfie e cnh_imagem são obrigatórios' }, { status: 400 })
  }

  const body = new FormData()
  body.append('selfie', selfie)
  body.append('cnh_pdf', '')
  body.append('cnh_imagem', cnhImagem)

  const res = await fetch('http://168.231.89.190:8000/validar-facial', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'x-api-key': 'Isg3j7cKe73gD7tMB0RuPhFIJwF8do6LCxGnB7qDeRce1pBl1i',
    },
    body,
  })

  const data = await res.json()
  return NextResponse.json(data)
}
