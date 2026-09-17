import { NextRequest, NextResponse } from 'next/server'
import { appendFile } from 'fs/promises'
import path from 'path'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'

// TESTE TEMPORÁRIO: grava corpo recebido + resposta em debug.log, pra
// inspecionar o que chega de verdade do provedor — reverter depois do teste.
async function logDebug(dados: unknown) {
  try {
    const linha = `[${new Date().toISOString()}] ${JSON.stringify(dados)}\n`
    await appendFile(path.join(process.cwd(), 'debug.log'), linha)
  } catch {}
}

// Chamada server-to-server direta ao Bubble (sem passar pelo proxy /api/bubble,
// que é pra chamadas vindas do navegador) — mesmo padrão do api/rastreador/route.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubbleServer(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BUBBLE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apikey: BUBBLE_KEY, ...body }),
  })
  const texto = await res.text()
  try { return JSON.parse(texto) } catch { return null }
}

const STATUS_COMPRA_RECEBIDA = 'COMPRA RECEBIDA'

// POST /api/webhook-instalacao
// Recebe { placa, nome } — a moto e o nome de quem confirmou a instalação.
// Confere se a moto existe no Bubble, está com status COMPRA RECEBIDA e ainda
// está pendente na fila de instalação (registro em "instalação 1" sem
// confirmação em "instalação 3"). Só valida por enquanto — a ação a tomar
// depois da validação ainda não foi definida.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  await logDebug({ origem: 'webhook-instalacao', etapa: 'recebido', body })

  async function responder(resultado: Record<string, unknown>, status = 200) {
    await logDebug({ origem: 'webhook-instalacao', etapa: 'resposta', status, resultado })
    return NextResponse.json(resultado, { status })
  }

  try {
    const placa = String(body?.placa ?? '').trim().toUpperCase()
    const tecnico = String(body?.nome ?? '').trim()
    if (!placa) {
      return responder({ valido: false, motivo: 'placa não informada no payload' }, 400)
    }

    // 1) Moto existe no Bubble?
    const dataVeiculo = await chamarBubbleServer('consulta-veiculo-funcoes', { placa })
    const veiculo = dataVeiculo?.response?.veiculo
    if (!veiculo) {
      return responder({ valido: false, motivo: `moto com placa ${placa} não encontrada` }, 404)
    }

    // 2) Status atual precisa ser COMPRA RECEBIDA
    if (veiculo.status_veiculo_desc !== STATUS_COMPRA_RECEBIDA) {
      return responder({
        valido: false,
        motivo: `status atual é "${veiculo.status_veiculo_desc}", esperado "${STATUS_COMPRA_RECEBIDA}"`,
        veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
      })
    }

    // 3) Precisa estar pendente na fila de instalação (todas as unidades —
    // o webhook não sabe de antemão em qual unidade a moto está)
    const dataUnidades = await chamarBubbleServer('achar-unidade', {})
    const unidades: { _id: string }[] = dataUnidades?.response?.unidade ?? []
    const unidadeIds = unidades.map((u) => u._id)

    const dataFila = await chamarBubbleServer('instalacao-motos', { unidade: unidadeIds })
    const instalacao1: Record<string, unknown>[] = dataFila?.response?.['instalação 1'] ?? []
    const instalacao2: Record<string, unknown>[] = dataFila?.response?.['instalação 2'] ?? []

    const naFila2 = instalacao2.some((v) => v._id === veiculo._id)
    const registroFila1 = instalacao1.find((r) => r.veiculo === veiculo._id)

    if (!naFila2 || !registroFila1) {
      return responder({
        valido: false,
        motivo: 'moto não está pendente na fila de instalação (aba Novo)',
        veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
      })
    }

    return responder({
      valido: true,
      veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
      registroFila: { _id: registroFila1._id, data: registroFila1.data },
      tecnico,
    })
  } catch (err) {
    return responder({ valido: false, motivo: `erro ao validar: ${String(err)}` }, 500)
  }
}
