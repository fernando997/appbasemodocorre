import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'

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

// confirmar-instalação espera form-data, não JSON — mesmo formato que a tela
// de Recebimento usa (RecebimentoPage.confirmarInstalacao, chamarBubble(..., 'form'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubbleServerForm(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const form = new FormData()
  form.append('apikey', BUBBLE_KEY)
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) form.append(key, String(value))
  }
  const res = await fetch(`${BUBBLE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
    body: form,
  })
  const texto = await res.text()
  try { return JSON.parse(texto) } catch { return null }
}

const STATUS_COMPRA_RECEBIDA = 'COMPRA RECEBIDA'
const STATUS_FILA_NOVO = 'NOVO'

// POST /api/webhook-instalacao
// Recebe { placa, nome } — a moto e o nome de quem confirmou a instalação.
// Confere se a moto existe no Bubble, está com status COMPRA RECEBIDA e está
// pendente na fila de instalação com status NOVO — e, se tudo bater, chama
// confirmar-instalação (mesmo workflow que o botão "Confirmar Instalação" da
// tela de Recebimento usa).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  function responder(resultado: Record<string, unknown>, status = 200) {
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
    // Placa inexistente vem como objeto vazio (sem _id), não como null
    if (!veiculo?._id) {
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
        motivo: 'moto não está na fila de instalação',
        veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
      })
    }

    // 4) O registro da fila precisa estar com status NOVO (campo "status" do
    // tipo lista-de-instalacao no Bubble)
    if (registroFila1.status !== STATUS_FILA_NOVO) {
      return responder({
        valido: false,
        motivo: `status da fila é "${registroFila1.status}", esperado "${STATUS_FILA_NOVO}"`,
        veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
        registroFila: { _id: registroFila1._id, status: registroFila1.status },
      })
    }

    // 5) Tudo certo — confirma a instalação no Bubble
    let confirmado = false
    let erroConfirmacao: string | undefined
    try {
      const dataConfirmacao = await chamarBubbleServerForm('confirmar-instalação', {
        'moto-instacao': registroFila1._id,
        user: tecnico,
      })
      confirmado = dataConfirmacao?.status === 'success' || dataConfirmacao != null
    } catch (err) {
      erroConfirmacao = String(err)
    }

    return responder({
      valido: true,
      confirmado,
      ...(erroConfirmacao ? { erroConfirmacao } : {}),
      veiculo: { _id: veiculo._id, placa, status_veiculo_desc: veiculo.status_veiculo_desc },
      registroFila: { _id: registroFila1._id, data: registroFila1.data, status: registroFila1.status },
      tecnico,
    })
  } catch (err) {
    return responder({ valido: false, motivo: `erro ao validar: ${String(err)}` }, 500)
  }
}
