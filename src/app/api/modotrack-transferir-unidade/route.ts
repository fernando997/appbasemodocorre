import { NextRequest, NextResponse } from 'next/server'

const MODOTRACK_BASE = 'https://app.modotrack.com.br/api/v1'
const LIMITE_PAGINA = 100
// Trava de segurança pra não ficar paginando pra sempre se a API mudar
const MAX_PAGINAS = 50

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim()
}

// Mesmo mapeamento cidade → client_id de /api/modotrack-cadastrar — manter
// os dois iguais ao adicionar unidade nova
const CLIENT_ID_POR_CIDADE: Record<string, number> = {
  AMERICANA: 16,
  CAMPINAS: 7,
  CUIABA: 8,
  'RIO PRETO': 9,
  RONDONOPOLIS: 10,
  SOROCABA: 11,
  'VARZEA GRANDE': 12,
  VG: 12,
}

function acharClientId(nomeUnidade: string): number | null {
  const alvo = normalizar(nomeUnidade)
  const cidade = Object.keys(CLIENT_ID_POR_CIDADE).find((c) => alvo.includes(c))
  return cidade ? CLIENT_ID_POR_CIDADE[cidade] : null
}

function headersModotrack() {
  return {
    accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Key': process.env.MODOTRACK_INSTALLER_KEY!,
  }
}

function motivoErro(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown } | null)?.detail
  return typeof detail === 'object' && detail
    ? String((detail as Record<string, unknown>).message ?? JSON.stringify(detail))
    : String(detail ?? `HTTP ${status}`)
}

// A listagem ignora filtro por placa e não existe GET /vehicles/{id} —
// precisa percorrer as páginas até achar a placa
async function buscarVeiculoPorPlaca(placa: string): Promise<Record<string, unknown> | null> {
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const res = await fetch(`${MODOTRACK_BASE}/vehicles?page=${pagina}&limit=${LIMITE_PAGINA}`, {
      headers: headersModotrack(),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`falha ao listar veículos: ${motivoErro(data, res.status)}`)
    const lista = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    const veiculo = lista.find((v) => String(v.plate ?? '').toUpperCase() === placa)
    if (veiculo) return veiculo
    if (lista.length < LIMITE_PAGINA) return null
  }
  return null
}

// POST /api/modotrack-transferir-unidade
// Chamado pelo Bubble depois que a solicitação de "TRANSFERÊNCIA UNIDADE"
// (registrar-solicitacao-base) é aprovada — troca o cliente (unidade) do
// veículo na ModoTrack. O PUT /vehicles/{id} é a edição geral do cadastro,
// então reenvia o cadastro atual inteiro trocando só o client_id.
// Sempre responde HTTP 200 com "ok" (mesmo motivo de modotrack-criar-os-manutencao)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const placa = String(body?.placa ?? '').trim().toUpperCase()
  const unidadeNome = String(body?.unidadeNome ?? '').trim()

  // TEMPORÁRIO: resposta fixa só pra inicializar a chamada no API Connector
  // do Bubble sem executar nada — remover depois da inicialização
  const SO_INICIALIZAR = true
  if (SO_INICIALIZAR) {
    return NextResponse.json({ ok: true, motivo: '', placa, vehicleId: 0, clientIdAnterior: 0, clientId: 0 })
  }

  const chaveRecebida = req.headers.get('X-API-Key')
  if (!chaveRecebida || chaveRecebida !== process.env.APP_API_KEY) {
    return NextResponse.json({ ok: false, motivo: 'API Key inválida', placa })
  }

  if (!placa || !unidadeNome) {
    return NextResponse.json({ ok: false, motivo: 'placa e unidadeNome são obrigatórios', placa })
  }

  const clientId = acharClientId(unidadeNome)
  if (clientId == null) {
    return NextResponse.json({ ok: false, motivo: `unidade "${unidadeNome}" não mapeada na ModoTrack`, placa })
  }

  try {
    const veiculo = await buscarVeiculoPorPlaca(placa)
    if (!veiculo) {
      return NextResponse.json({ ok: false, motivo: 'placa não cadastrada na ModoTrack', placa })
    }

    if (Number(veiculo.client_id) === clientId) {
      return NextResponse.json({ ok: true, placa, clientId, motivo: 'veículo já está nessa unidade' })
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...cadastroAtual } = veiculo
    const res = await fetch(`${MODOTRACK_BASE}/vehicles/${id}`, {
      method: 'PUT',
      headers: headersModotrack(),
      body: JSON.stringify({ ...cadastroAtual, client_id: clientId }),
    })
    const texto = await res.text()
    let data: unknown = null
    try { data = JSON.parse(texto) } catch { data = null }

    if (!res.ok) {
      return NextResponse.json({ ok: false, motivo: motivoErro(data, res.status), status: res.status, placa })
    }

    return NextResponse.json({
      ok: true,
      placa,
      vehicleId: Number(id),
      clientIdAnterior: Number(veiculo.client_id),
      clientId,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, motivo: String(err), placa })
  }
}
