import { NextRequest, NextResponse } from 'next/server'

const MODOTRACK_BASE = 'https://app.modotrack.com.br/api/v1'

// Delay entre cadastrar o veículo e gerar a ordem de serviço — a ModoTrack
// precisa de um tempo pra processar o cadastro antes de aceitar a ordem
// referenciando essa placa (ver REQUEST PARA CADASTRAR VEICULOS... na raiz)
const DELAY_PROCESSAMENTO_MS = 10000

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Chave separada da MODOTRACK_KEY (essa é só pra rastreamento/posição) —
// o módulo installer-orders (cadastro de veículo + ordem de serviço) usa
// uma chave própria, com permissão de escrita
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarModotrack(caminho: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${MODOTRACK_BASE}${caminho}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': process.env.MODOTRACK_INSTALLER_KEY!,
      ...(init?.headers ?? {}),
    },
  })
  const texto = await res.text()
  let data: unknown = null
  try { data = JSON.parse(texto) } catch { data = texto }
  return { ok: res.ok, status: res.status, data }
}

// Mapeamento fixo cidade → client_id na ModoTrack — confirmado manualmente em
// GET /clients (tem nomes duplicados/ambíguos por lá, tipo "Unidade Cuiabá"
// id=2 vs "MODO CORRE CUIABÁ-MT" id=8, e "Várzea Grande" só existe como "VG"
// — por isso não dá pra confiar em match automático por nome)
const CLIENT_ID_POR_CIDADE: Record<string, number> = {
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

// Tipos de falha no cadastro do veículo — cada um tem um tratamento diferente
// no frontend (ver confirmarRecebimento em recebimento/page.tsx):
//  - placa_duplicada: a moto já existe na ModoTrack → deixa continuar o
//    recebimento sem gerar ordem de serviço nova
//  - chassi_duplicado: chassi já usado em outro veículo → bloqueia de vez,
//    manda contatar o suporte (formato do erro NÃO confirmado ainda — chute
//    baseado no padrão de VEHICLE_PLATE_EXISTS, ver comentário abaixo)
//  - dados_faltando: campo obrigatório ausente/inválido → mostra quais
//  - outro: qualquer outra coisa → bloqueia igual ao comportamento antigo
type TipoFalhaVeiculo = 'placa_duplicada' | 'chassi_duplicado' | 'dados_faltando' | 'outro'

function categorizarErroVeiculo(data: unknown): { tipo: TipoFalhaVeiculo; motivo: string; campos: string[] } {
  const detail = (data as { detail?: unknown })?.detail
  const codigo = typeof detail === 'object' && detail ? String((detail as Record<string, unknown>).code ?? '') : ''
  const mensagem = typeof detail === 'object' && detail
    ? String((detail as Record<string, unknown>).message ?? '')
    : String(detail ?? '')
  const campos = typeof detail === 'object' && detail && Array.isArray((detail as Record<string, unknown>).fields)
    ? ((detail as Record<string, unknown>).fields as unknown[]).map(String)
    : []

  if (codigo === 'VEHICLE_PLATE_EXISTS') {
    return { tipo: 'placa_duplicada', motivo: mensagem || 'Placa já cadastrada na ModoTrack.', campos }
  }
  // NÃO CONFIRMADO: nunca vimos esse erro de verdade (precisaria duplicar um
  // chassi pra testar) — chute pelo padrão do código acima
  if (codigo === 'VEHICLE_CHASSIS_EXISTS' || (codigo.includes('CHASSIS') && codigo.includes('EXISTS'))) {
    return { tipo: 'chassi_duplicado', motivo: mensagem || 'Chassi já cadastrado em outro veículo na ModoTrack.', campos }
  }
  if (codigo === 'VEHICLE_INVALID_FIELDS' || campos.length > 0) {
    return { tipo: 'dados_faltando', motivo: mensagem || 'Dados obrigatórios ausentes.', campos }
  }
  return { tipo: 'outro', motivo: mensagem || `HTTP ${(data as { status?: number })?.status ?? '?'}`, campos }
}

// POST /api/modotrack-cadastrar
// Chamado pelo confirmarRecebimento (tela de Recebimento) depois que a moto é
// recebida no Bubble. Cadastra o veículo na ModoTrack e gera a ordem de
// serviço de instalação, com um delay entre as duas chamadas.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const unidadeNome = String(body?.unidadeNome ?? '').trim()
    const placa = String(body?.placa ?? '').trim().toUpperCase()
    const marca = String(body?.marca ?? '').trim()
    const modelo = String(body?.modelo ?? '').trim()
    const ano = Number(body?.ano ?? 0) || 0
    const cor = String(body?.cor ?? '').trim()
    const chassi = String(body?.chassi ?? '').trim()
    const renavam = String(body?.renavam ?? '').trim()

    if (!unidadeNome || !placa) {
      return NextResponse.json({ ok: false, tipo: 'outro' as TipoFalhaVeiculo, motivo: 'unidadeNome e placa são obrigatórios', campos: [] }, { status: 400 })
    }

    const clientId = await acharClientId(unidadeNome)
    if (clientId == null) {
      return NextResponse.json({ ok: false, tipo: 'outro' as TipoFalhaVeiculo, motivo: `unidade "${unidadeNome}" não encontrada na ModoTrack`, campos: [] }, { status: 404 })
    }

    const veiculoRes = await chamarModotrack('/installer-orders/external/vehicles/upsert', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        plate: placa,
        name: placa,
        type: 'MOTO',
        brand: marca,
        model: modelo,
        year: ano,
        color: cor,
        chassis: chassi,
        renavam,
      }),
    })

    // Se o cadastro do veículo já falhou, não faz sentido esperar 10s e
    // tentar gerar a ordem de serviço — vai falhar também (a ModoTrack não
    // acha o veículo), exceto no caso "placa_duplicada" (o veículo já existe,
    // só não geramos uma ordem de serviço nova por ele aqui)
    if (!veiculoRes.ok) {
      const { tipo, motivo, campos } = categorizarErroVeiculo(veiculoRes.data)
      return NextResponse.json({
        ok: false,
        tipo,
        motivo,
        campos,
        clientId,
        veiculo: { ok: veiculoRes.ok, status: veiculoRes.status, data: veiculoRes.data },
      }, { status: 502 })
    }

    await sleep(DELAY_PROCESSAMENTO_MS)

    const ordemRes = await chamarModotrack('/installer-orders/external/orders', {
      method: 'POST',
      body: JSON.stringify({
        external_id: placa,
        service_type: 'INSTALLATION',
        client_id: clientId,
        plate: placa,
        blocker_type_id: null,
        requires_blocker: true,
        defer_blocker_selection: true,
        requires_primary: true,
        requires_backup: true,
        requires_citytag: true,
        source_system: 'MODO CORRE',
      }),
    })

    if (!ordemRes.ok) {
      const { motivo } = categorizarErroVeiculo(ordemRes.data)
      return NextResponse.json({
        ok: false,
        tipo: 'outro' as TipoFalhaVeiculo,
        motivo: `Veículo cadastrado, mas falha ao gerar ordem de serviço: ${motivo}`,
        campos: [],
        clientId,
        veiculo: { ok: veiculoRes.ok, status: veiculoRes.status, data: veiculoRes.data },
        ordem: { ok: ordemRes.ok, status: ordemRes.status, data: ordemRes.data },
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      clientId,
      veiculo: { ok: veiculoRes.ok, status: veiculoRes.status, data: veiculoRes.data },
      ordem: { ok: ordemRes.ok, status: ordemRes.status, data: ordemRes.data },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, tipo: 'outro' as TipoFalhaVeiculo, motivo: String(err), campos: [] }, { status: 500 })
  }
}
