import { NextRequest, NextResponse } from 'next/server'

const MODOTRACK_BASE = 'https://app.modotrack.com.br/api/v1'

// POST /api/modotrack-verificar-placa
// Usado pelo botão "Solicitar Manutenção no Rastreamento" (Vistoria de
// Disponibilidade), antes de abrir a solicitação no Bubble. Duas checagens:
//  1) a placa existe cadastrada na ModoTrack (fleet/position-snapshot)
//  2) já não existe uma ordem de serviço de manutenção aberta pra ela
//     (installer-orders/orders?status=OPEN&service_type=MAINTENANCE&plate=X)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const placa = String(body?.placa ?? '').trim().toUpperCase()
    if (!placa) {
      return NextResponse.json({ cadastrada: false, motivo: 'placa não informada' }, { status: 400 })
    }

    // 1) Placa cadastrada?
    const posRes = await fetch(`${MODOTRACK_BASE}/fleet/position-snapshot/${placa}`, {
      headers: {
        accept: 'application/json',
        'X-API-Key': process.env.MODOTRACK_KEY!,
      },
    })
    const posTexto = await posRes.text()
    let posData: unknown = null
    try { posData = JSON.parse(posTexto) } catch { posData = null }

    if (!posRes.ok) {
      const codigo = (posData as { code?: string } | null)?.code
      if (codigo === 'NOT_FOUND') {
        return NextResponse.json({ cadastrada: false })
      }
      return NextResponse.json({
        cadastrada: false,
        motivo: (posData as { detail?: string } | null)?.detail ?? `HTTP ${posRes.status}`,
      }, { status: 502 })
    }

    // 2) Já existe ordem de manutenção aberta? (confirmado funcionando com
    // MODOTRACK_INSTALLER_KEY) — se essa consulta falhar mesmo assim, não
    // bloqueia o fluxo, só não conseguimos confirmar (ordemAberta fica false)
    let ordemAberta = false
    try {
      const ordensUrl = `${MODOTRACK_BASE}/installer-orders/orders`
        + `?status=OPEN&plate=${encodeURIComponent(placa)}&oldest_first=false`
        + `&service_type=MAINTENANCE&offset=0&limit=300&summary_only=false&export=false`
      const ordensRes = await fetch(ordensUrl, {
        headers: {
          accept: 'application/json',
          'X-API-Key': process.env.MODOTRACK_INSTALLER_KEY!,
        },
      })
      if (ordensRes.ok) {
        const ordensData = await ordensRes.json().catch(() => null)
        const ordens = (ordensData as { orders?: unknown[] } | null)?.orders ?? []
        ordemAberta = ordens.length > 0
      }
    } catch {}

    return NextResponse.json({ cadastrada: true, ordemAberta, dados: posData })
  } catch (err) {
    return NextResponse.json({ cadastrada: false, motivo: String(err) }, { status: 500 })
  }
}
