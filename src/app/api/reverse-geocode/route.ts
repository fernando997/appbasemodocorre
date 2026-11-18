import { NextRequest, NextResponse } from 'next/server'

// Monta o endereço em duas linhas curtas a partir do `address` do Nominatim:
//   linha1: rua e número          linha2: bairro — cidade/UF
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resumirEndereco(data: any): { linha1: string | null; linha2: string | null } {
  const a = data?.address
  if (!a) return { linha1: null, linha2: null }

  const rua = a.road ?? a.pedestrian ?? a.footway ?? data?.name ?? null
  const linha1 = rua ? (a.house_number ? `${rua}, ${a.house_number}` : String(rua)) : null

  const bairro = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null
  const cidade = a.city ?? a.town ?? a.village ?? a.municipality ?? null
  const uf = typeof a['ISO3166-2-lvl4'] === 'string' ? a['ISO3166-2-lvl4'].split('-')[1] : null
  const cidadeUf = cidade ? (uf ? `${cidade}/${uf}` : String(cidade)) : null
  const linha2 = [bairro, cidadeUf].filter(Boolean).join(' — ') || null

  return { linha1, linha2 }
}

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

    return NextResponse.json({ endereco: data?.display_name ?? null, ...resumirEndereco(data) })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
