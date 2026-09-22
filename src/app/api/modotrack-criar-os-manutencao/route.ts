import { NextRequest, NextResponse } from 'next/server'

// POST /api/modotrack-criar-os-manutencao
// Chamado pelo Bubble depois que a solicitação de "MANUTENÇÃO DE RASTREADOR"
// (registrar-solicitacao-base) é aprovada — cria a ordem de serviço de
// manutenção na ModoTrack (service_type: MAINTENANCE).
//
// TODO: ainda NÃO faz a chamada de verdade pra ModoTrack — só devolve uma
// resposta fixa, pra o Bubble conseguir inicializar essa API externa no API
// Connector sem criar uma ordem de serviço real. Preencher com o POST real
// (installer-orders/external/orders) só depois que o Bubble já estiver
// configurado contra essa resposta de exemplo.
export async function POST(req: NextRequest) {
  const chaveRecebida = req.headers.get('X-API-Key')
  if (!chaveRecebida || chaveRecebida !== process.env.APP_API_KEY) {
    return NextResponse.json({ ok: false, motivo: 'API Key inválida' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const placa = String(body?.placa ?? '').trim().toUpperCase()

  return NextResponse.json({
    ok: true,
    mock: true,
    placa,
    orderId: 0,
    externalId: '',
  })
}
