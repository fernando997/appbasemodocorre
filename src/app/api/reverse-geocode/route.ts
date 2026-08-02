import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { lat, long } = await req.json()
    if (lat == null || long == null) {
      return NextResponse.json({ erro: 'lat e long são obrigatórios' }, { status: 400 })
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${long}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ModoCorre/1.0 (contato@modocorreapp.com.br)' },
    })
    const data = await res.json()

    return NextResponse.json({ endereco: data?.display_name ?? null })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
