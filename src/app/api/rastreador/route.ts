import { NextRequest, NextResponse } from 'next/server'
import {
  BUBBLE_BASE,
  BUBBLE_KEY,
  BUBBLE_PRIVATE_KEY,
  RASTREADOR_SUPABASE_URL,
  RASTREADOR_SUPABASE_KEY,
  RASTREADOR_SUPABASE_ANON_KEY,
} from '@/lib/config'

const MODOTRACK_URL = 'https://app.modotrack.com.br/api/v1/fleet/position-snapshot'
const GETRAK_TOKEN_URL = 'https://api.getrak.com/newkoauth/oauth/token'
const GETRAK_LOCALIZACOES_URL = 'https://api.getrak.com/v0.1/localizacoes'

// RASTREADOR_SUPABASE_URL aponta pra um RPC específico — aqui precisamos de outros,
// então cortamos no /rpc/ pra ter a base
const SUPABASE_RPC_BASE = RASTREADOR_SUPABASE_URL.split('/rpc/')[0] + '/rpc'

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

// ---------------------------------------------------------------
// GETRAK - token OAuth (temporário, cacheado em memória)
// /localizacoes usa o fluxo oauth2Password
// ---------------------------------------------------------------
let tokenCache: { token: string; expiraEm: number } | null = null

async function obterTokenGetrak(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiraEm) return tokenCache.token

  try {
    const body = new URLSearchParams({
      grant_type: 'password',
      username: process.env.GETRAK_USER ?? '',
      password: process.env.GETRAK_PASS ?? '',
    })
    const res = await fetch(GETRAK_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${process.env.GETRAK_BASIC ?? ''}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    })
    const bruto = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    try { data = JSON.parse(bruto) } catch { data = null }

    if (!res.ok || !data?.access_token) {
      return null
    }

    // Renova 60s antes de expirar, pra não usar token na virada
    const validadeMs = Math.max(((Number(data.expires_in) || 300) - 60) * 1000, 30_000)
    tokenCache = { token: data.access_token, expiraEm: Date.now() + validadeMs }
    return data.access_token
  } catch {
    return null
  }
}

// ---------------------------------------------------------------
// Ids dos rastreadores (principal e backup)
// A placa não serve direto: os RPCs do Supabase são consultados pelo
// unique_id do veículo no Bubble, então buscamos ele primeiro
// ---------------------------------------------------------------
async function buscarIdVeiculoBubble(placaFmt: string): Promise<string | null> {
  try {
    const res = await fetch(`${BUBBLE_BASE}/consulta-veiculo-funcoes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apikey: BUBBLE_KEY, placa: placaFmt }),
    })
    const bruto = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    try { data = JSON.parse(bruto) } catch { data = null }

    const idVeiculo = data?.response?.veiculo?._id ?? null
    return idVeiculo ? String(idVeiculo) : null
  } catch {
    return null
  }
}

// Cada rastreador tem seu RPC, e o id da GETRAK vem num campo de nome próprio
const RPCS_RASTREADOR = {
  principal: { rpc: 'api_consultar_rastreamento_principal', campo: 'id_veiculo_principal' },
  backup: { rpc: 'api_consultar_rastreamento_bkc', campo: 'id_veiculo_bck' },
} as const

async function consultarRpcRastreador(
  rotulo: 'principal' | 'backup',
  idVeiculo: string
): Promise<string | undefined> {
  const { rpc, campo } = RPCS_RASTREADOR[rotulo]
  try {
    const res = await fetch(`${SUPABASE_RPC_BASE}/${rpc}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: RASTREADOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${RASTREADOR_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ api_key: RASTREADOR_SUPABASE_KEY, p_id_veiculo: idVeiculo }),
    })
    const bruto = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    try { data = JSON.parse(bruto) } catch { data = null }

    if (!res.ok) return undefined
    // O RPC pode devolver o registro solto ou dentro de um array
    const registro = Array.isArray(data) ? data[0] : data
    const id = registro?.[campo]
    return id != null && String(id).trim() !== '' ? String(id) : undefined
  } catch {
    return undefined
  }
}

async function buscarIdsRastreadores(placaFmt: string): Promise<{ principal?: string; backup?: string }> {
  const idVeiculo = await buscarIdVeiculoBubble(placaFmt)
  if (!idVeiculo) return {}

  const [principal, backup] = await Promise.all([
    consultarRpcRastreador('principal', idVeiculo),
    consultarRpcRastreador('backup', idVeiculo),
  ])
  return { principal, backup }
}

// ---------------------------------------------------------------
// GETRAK - última localização de um id
// ---------------------------------------------------------------

// datastatus vem como { date: "2024-09-12 00:00:00.000000", timezone: "America/Sao_Paulo" }.
// Sem o offset explícito o Node interpretaria no fuso do servidor, então anexamos -03:00.
function parseDataGetrak(datastatus: unknown): number | null {
  const date = (datastatus as { date?: string } | null)?.date
  if (!date) return null
  const iso = date.trim().replace(' ', 'T')
  const tz = String((datastatus as { timezone?: string })?.timezone ?? '')
  const comOffset = tz === 'America/Sao_Paulo' ? `${iso}-03:00` : iso
  const ts = new Date(comOffset).getTime()
  return Number.isNaN(ts) ? null : ts
}

async function buscarLocalizacaoGetrak(id: string, rotulo: string, token: string): Promise<Loc> {
  try {
    const url = `${GETRAK_LOCALIZACOES_URL}?id=${encodeURIComponent(id)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    const bruto = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    try { data = JSON.parse(bruto) } catch { data = null }

    if (!res.ok) return SEM_SINAL

    // `veiculos` pode vir como objeto único ou array
    const veiculos = data?.veiculos
    const veiculo = Array.isArray(veiculos) ? veiculos[0] : veiculos
    if (!veiculo) return SEM_SINAL

    const lat = veiculo.lat ?? null
    const long = veiculo.lon ?? veiculo.lng ?? null
    if (lat == null || long == null) return SEM_SINAL

    const ts = parseDataGetrak(veiculo.datastatus)
    const idade = ts != null ? Date.now() - ts : null
    const fresco = idade != null && idade <= IDADE_MAXIMA_MS

    return fresco ? { lat: Number(lat), long: Number(long), plataforma: 'GETRAK' } : SEM_SINAL
  } catch {
    return SEM_SINAL
  }
}

// Faz as 2 chamadas - uma pro principal, outra pro backup
async function buscarGetrak(placaFmt: string): Promise<{ principal: Loc; backup: Loc }> {
  const [token, ids] = await Promise.all([obterTokenGetrak(), buscarIdsRastreadores(placaFmt)])
  if (!token) return { principal: SEM_SINAL, backup: SEM_SINAL }

  const [principal, backup] = await Promise.all([
    ids.principal ? buscarLocalizacaoGetrak(ids.principal, 'principal', token) : Promise.resolve(SEM_SINAL),
    ids.backup ? buscarLocalizacaoGetrak(ids.backup, 'backup', token) : Promise.resolve(SEM_SINAL),
  ])
  return { principal, backup }
}

// ---------------------------------------------------------------
// Consulta ModoTrack - retorna principal/backup/tag (tag é só informativo)
// ---------------------------------------------------------------
async function buscarModotrack(placaFmt: string): Promise<{ principal: Loc; backup: Loc; tag: Loc }> {
  try {
    const res = await fetch(`${MODOTRACK_URL}/${placaFmt}`, {
      headers: {
        accept: 'application/json',
        'X-API-Key': process.env.MODOTRACK_KEY!,
      },
    })
    const bruto = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null
    try { data = JSON.parse(bruto) } catch { data = null }
    if (!res.ok) return { principal: SEM_SINAL, backup: SEM_SINAL, tag: SEM_SINAL }

    return {
      principal: data?.principal?.latitude != null && data?.principal?.longitude != null
        ? { lat: data.principal.latitude, long: data.principal.longitude, plataforma: 'MODOTRACK' }
        : SEM_SINAL,
      backup: data?.backup?.latitude != null && data?.backup?.longitude != null
        ? { lat: data.backup.latitude, long: data.backup.longitude, plataforma: 'MODOTRACK' }
        : SEM_SINAL,
      tag: data?.tag?.latitude != null && data?.tag?.longitude != null
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

    // Consulta as duas plataformas sempre - a moto pode ter, por exemplo,
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
