import { NextRequest, NextResponse } from 'next/server'

const MODOTRACK_ORDERS_URL = 'https://app.modotrack.com.br/api/v1/installer-orders/external/orders'

// POST /api/modotrack-criar-os-manutencao
// Chamado pelo Bubble depois que a solicitação de "MANUTENÇÃO DE RASTREADOR"
// (registrar-solicitacao-base) é aprovada — cria a ordem de serviço de
// manutenção na ModoTrack (service_type: MAINTENANCE).
// Sempre responde HTTP 200 — o campo "ok" (true/false) que diz se deu certo,
// senão o Bubble trata qualquer status != 200 como falha de chamada e não
// consegue ler o motivo do erro normalmente
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  // Sempre inclui "placa" na resposta (mesmo vazia), pra ficar visível no
  // retorno do Bubble o que de fato chegou nessa chamada — ajuda a
  // diagnosticar se o problema é no envio (placa vazia aqui) ou depois
  const placa = String(body?.placa ?? '').trim().toUpperCase()

  const chaveRecebida = req.headers.get('X-API-Key')
  if (!chaveRecebida || chaveRecebida !== process.env.APP_API_KEY) {
    return NextResponse.json({ ok: false, motivo: 'API Key inválida', placa })
  }

  if (!placa) {
    return NextResponse.json({ ok: false, motivo: 'placa não informada', placa })
  }

  try {
    const res = await fetch(MODOTRACK_ORDERS_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': process.env.MODOTRACK_INSTALLER_KEY!,
      },
      // Sem external_id — deixa a ModoTrack gerar um número único (evita 409
      // se essa placa já tiver uma OS com external_id repetido, ex: a de
      // instalação que usa a placa como external_id)
      body: JSON.stringify({
        service_type: 'MAINTENANCE',
        plate: placa,
        blocker_type_id: null,
        requires_blocker: true,
        defer_blocker_selection: true,
        requires_primary: true,
        requires_backup: true,
        requires_citytag: true,
        source_system: 'MODO CORRE',
        notes: 'VISTORIA DE DISPONIBILIDADE NEGADA - Manutenção solicitada pelo app da base no momento da vistoria de DISPONÍBILIDADE',
      }),
    })
    const texto = await res.text()
    let data: unknown = null
    try { data = JSON.parse(texto) } catch { data = null }

    if (!res.ok) {
      const detail = (data as { detail?: unknown } | null)?.detail
      const motivo = typeof detail === 'object' && detail
        ? String((detail as Record<string, unknown>).message ?? JSON.stringify(detail))
        : String(detail ?? `HTTP ${res.status}`)
      return NextResponse.json({ ok: false, motivo, status: res.status, placa })
    }

    const ordem = data as { id?: number; external_id?: string; status?: string } | null
    return NextResponse.json({
      ok: true,
      placa,
      orderId: ordem?.id ?? 0,
      externalId: ordem?.external_id ?? '',
      status: ordem?.status ?? '',
    })
  } catch (err) {
    return NextResponse.json({ ok: false, motivo: String(err), placa })
  }
}
