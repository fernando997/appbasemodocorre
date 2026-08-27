import { NextRequest, NextResponse } from 'next/server'
import { RASTREADOR_SUPABASE_URL, RASTREADOR_SUPABASE_KEY, RASTREADOR_SUPABASE_ANON_KEY } from '@/lib/config'

const MODOTRACK_URL = 'https://app.modotrack.com.br/api/v1/fleet/position-snapshot'

type Plataforma = 'GETRAK' | 'MODOTRACK'
type Loc = { lat: number | null; long: number | null; plataforma: Plataforma | null }
type Resultado = {
  ok: boolean
  localizacoes: Record<string, Loc>
}

const SEM_SINAL: Loc = { lat: null, long: null, plataforma: null }
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

// Consulta GETRAK (api_posicao_por_placa) — retorna principal/backup só se a posição estiver fresca (≤8h)
async function buscarGetrak(placaFmt: string): Promise<{ principal: Loc; backup: Loc }> {
  try {
    const bodyGetrak = JSON.stringify({ api_key: RASTREADOR_SUPABASE_KEY, p_placa: placaFmt })
    const res = await fetch(RASTREADOR_SUPABASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: RASTREADOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${RASTREADOR_SUPABASE_ANON_KEY}`,
      },
      body: bodyGetrak,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) return { principal: SEM_SINAL, backup: SEM_SINAL }

    const principalFresco = estaFresca(data.principal?.data_at)
    const backupFresco = estaFresca(data.bck?.data_at)
    return {
      principal: principalFresco && data.principal?.lat != null && data.principal?.long != null
        ? { lat: data.principal.lat, long: data.principal.long, plataforma: 'GETRAK' }
        : SEM_SINAL,
      backup: backupFresco && data.bck?.lat != null && data.bck?.long != null
        ? { lat: data.bck.lat, long: data.bck.long, plataforma: 'GETRAK' }
        : SEM_SINAL,
    }
  } catch {
    return { principal: SEM_SINAL, backup: SEM_SINAL }
  }
}

// Consulta ModoTrack — retorna principal/backup/tag (tag é só informativo)
async function buscarModotrack(placaFmt: string): Promise<{ principal: Loc; backup: Loc; tag: Loc }> {
  try {
    const res = await fetch(`${MODOTRACK_URL}/${placaFmt}`, {
      headers: {
        accept: 'application/json',
        'X-API-Key': process.env.MODOTRACK_KEY!,
      },
    })
    if (!res.ok) return { principal: SEM_SINAL, backup: SEM_SINAL, tag: SEM_SINAL }
    const data = await res.json()
    return {
      principal: data.principal?.latitude != null && data.principal?.longitude != null
        ? { lat: data.principal.latitude, long: data.principal.longitude, plataforma: 'MODOTRACK' }
        : SEM_SINAL,
      backup: data.backup?.latitude != null && data.backup?.longitude != null
        ? { lat: data.backup.latitude, long: data.backup.longitude, plataforma: 'MODOTRACK' }
        : SEM_SINAL,
      tag: data.tag?.latitude != null && data.tag?.longitude != null
        ? { lat: data.tag.latitude, long: data.tag.longitude, plataforma: 'MODOTRACK' }
        : SEM_SINAL,
    }
  } catch {
    return { principal: SEM_SINAL, backup: SEM_SINAL, tag: SEM_SINAL }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { placa } = await req.json()
    if (!placa) return NextResponse.json({ error: 'placa não enviada' }, { status: 400 })
    const placaFmt = String(placa).trim().toUpperCase()

    // Consulta as duas plataformas sempre — a moto pode ter, por exemplo,
    // o principal na GETRAK e o backup na MODOTRACK (ou vice-versa)
    const [getrak, modotrack] = await Promise.all([buscarGetrak(placaFmt), buscarModotrack(placaFmt)])

    const localizacoes: Record<string, Loc> = {
      principal: temPosicao(getrak.principal) ? getrak.principal : modotrack.principal,
      backup: temPosicao(getrak.backup) ? getrak.backup : modotrack.backup,
      tag: modotrack.tag,
    }

    const resultado: Resultado = {
      ok: temPosicao(localizacoes.principal) && temPosicao(localizacoes.backup),
      localizacoes,
    }
    return NextResponse.json(resultado)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
