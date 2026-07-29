import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'

const MODOTRACK_URL = 'https://app.modotrack.com.br/api/v1/fleet/position-snapshot'

type Loc = { lat: number | null; long: number | null }
type Resultado = {
  plataforma: 'MODOTRACK' | 'BUBBLE' | null
  localizacoes: Record<string, Loc>
}

function temPosicao(loc: Loc | undefined | null): boolean {
  return loc?.lat != null && loc?.long != null
}

export async function POST(req: NextRequest) {
  try {
    const { placa } = await req.json()
    if (!placa) return NextResponse.json({ error: 'placa não enviada' }, { status: 400 })
    const placaFmt = String(placa).trim().toUpperCase()

    // 1ª plataforma: ModoTrack
    try {
      const res = await fetch(`${MODOTRACK_URL}/${placaFmt}`, {
        headers: {
          accept: 'application/json',
          'X-API-Key': process.env.MODOTRACK_KEY!,
        },
      })
      if (res.ok) {
        const data = await res.json()
        const locs: Record<string, Loc> = {
          principal: { lat: data.principal?.latitude ?? null, long: data.principal?.longitude ?? null },
          backup: { lat: data.backup?.latitude ?? null, long: data.backup?.longitude ?? null },
          tag: { lat: data.tag?.latitude ?? null, long: data.tag?.longitude ?? null },
        }
        // Tudo null = a moto não existe na ModoTrack → cai pra 2ª plataforma
        if (Object.values(locs).some(temPosicao)) {
          const resultado: Resultado = { plataforma: 'MODOTRACK', localizacoes: locs }
          return NextResponse.json(resultado)
        }
      }
    } catch {
      // ModoTrack fora do ar → tenta a 2ª plataforma
    }

    // 2ª plataforma: Bubble teste-rastreadores
    const form = new FormData()
    form.append('apikey', BUBBLE_KEY)
    form.append('placa', placaFmt)
    const res2 = await fetch(`${BUBBLE_BASE}/teste-rastreadores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
      body: form,
    })
    if (res2.ok) {
      const data2 = await res2.json()
      const resp = data2.response ?? {}
      // A key pode vir com espaço no final ("localizacao ")
      const rawKey = Object.keys(resp).find(k => k.trim() === 'localizacao')
      if (rawKey && resp[rawKey]) {
        try {
          const parsed = JSON.parse(resp[rawKey])
          const locs: Record<string, Loc> = {
            principal: { lat: parsed.principal?.lat ?? null, long: parsed.principal?.long ?? null },
            backup: { lat: parsed.bck?.lat ?? null, long: parsed.bck?.long ?? null },
          }
          if (Object.values(locs).some(temPosicao)) {
            const resultado: Resultado = { plataforma: 'BUBBLE', localizacoes: locs }
            return NextResponse.json(resultado)
          }
        } catch {
          // JSON malformado → trata como sem localização
        }
      }
    }

    // Nenhuma plataforma trouxe localização → bloqueia
    const resultado: Resultado = { plataforma: null, localizacoes: {} }
    return NextResponse.json(resultado)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
