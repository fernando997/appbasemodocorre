import { NextRequest, NextResponse } from 'next/server'
import { RASTREADOR_SUPABASE_URL, RASTREADOR_SUPABASE_KEY, RASTREADOR_SUPABASE_ANON_KEY } from '@/lib/config'

const MODOTRACK_URL = 'https://app.modotrack.com.br/api/v1/fleet/position-snapshot'

type Loc = { lat: number | null; long: number | null }
type Resultado = {
  plataforma: 'GETRAK' | 'MODOTRACK' | null
  localizacoes: Record<string, Loc>
}

const IDADE_MAXIMA_MS = 8 * 60 * 60 * 1000 // 8h

function temPosicao(loc: Loc | undefined | null): boolean {
  return loc?.lat != null && loc?.long != null
}

// GETRAK manda "data_at" por localização — descarta posição mais antiga que 8h
function estaFresca(dataAt: string | null | undefined): boolean {
  if (!dataAt) return false
  const ts = new Date(dataAt).getTime()
  return !Number.isNaN(ts) && Date.now() - ts <= IDADE_MAXIMA_MS
}

export async function POST(req: NextRequest) {
  try {
    const { placa } = await req.json()
    if (!placa) return NextResponse.json({ error: 'placa não enviada' }, { status: 400 })
    const placaFmt = String(placa).trim().toUpperCase()

    // 1ª plataforma: GETRAK (api_posicao_por_placa)
    try {
      const bodyGetrak = JSON.stringify({ api_key: RASTREADOR_SUPABASE_KEY, p_placa: placaFmt })
      console.log(`curl -X POST '${RASTREADOR_SUPABASE_URL}' -H 'Content-Type: application/json' -H 'apikey: ${RASTREADOR_SUPABASE_ANON_KEY}' -H 'Authorization: Bearer ${RASTREADOR_SUPABASE_ANON_KEY}' -d '${bodyGetrak}'`)
      const res0 = await fetch(RASTREADOR_SUPABASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: RASTREADOR_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${RASTREADOR_SUPABASE_ANON_KEY}`,
        },
        body: bodyGetrak,
      })
      const data0 = await res0.json().catch(() => null)

      if (res0.ok && data0?.success) {
        // Só considera a posição se a atualização (data_at) tiver no máximo 8h — senão trata como sem sinal
        const principalFresco = estaFresca(data0.principal?.data_at)
        const backupFresco = estaFresca(data0.bck?.data_at)
        const locs: Record<string, Loc> = {
          principal: principalFresco ? { lat: data0.principal?.lat ?? null, long: data0.principal?.long ?? null } : { lat: null, long: null },
          backup: backupFresco ? { lat: data0.bck?.lat ?? null, long: data0.bck?.long ?? null } : { lat: null, long: null },
        }
        if (Object.values(locs).some(temPosicao)) {
          const resultado: Resultado = { plataforma: 'GETRAK', localizacoes: locs }
          return NextResponse.json(resultado)
        }
      }
    } catch {
      // GETRAK fora do ar → tenta a 2ª plataforma
    }

    // 2ª plataforma: ModoTrack
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
        // Tudo null = a moto não existe na ModoTrack → sem sinal
        if (Object.values(locs).some(temPosicao)) {
          const resultado: Resultado = { plataforma: 'MODOTRACK', localizacoes: locs }
          return NextResponse.json(resultado)
        }
      }
    } catch {
      // ModoTrack fora do ar
    }

    // Nenhuma plataforma trouxe localização → bloqueia
    const resultado: Resultado = { plataforma: null, localizacoes: {} }
    return NextResponse.json(resultado)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
