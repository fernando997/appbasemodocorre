import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'
import { COOKIE_SESSAO, verificarToken } from '@/lib/sessao'

// Sem sessão: só o envio do código de login e os endpoints das telas
// /vistoria-entrega*, que o cliente abre sem login
const ENDPOINTS_PUBLICOS = new Set([
  'enviar-codigo',
  'vistoria-entrega',
  'vistoria-entrega-sub',
  'base_vistoria_entrega-base',
  'consulta-veiculo-funcoes',
  'NOVO-sub-incluir',
  'NOVO-sub-retirar',
])

// Com sessão: só os endpoints que o site usa (valida-codigo vai pelo /api/login)
const ENDPOINTS_PERMITIDOS = new Set([
  ...ENDPOINTS_PUBLICOS,
  'achar-moto-base', 'achar-unidade', 'base_vistoria_disponibilidade', 'base-chamar-status',
  'base-confirmar-recolha', 'base-consulta-parcelas', 'base-permanece-com-locatario',
  'chamar-locadoras', 'chamar-recolhas-pendencias', 'chamar-veiculos',
  'check-in-base', 'confirmar-instalação', 'instalacao-motos', 'liberacao_veiculo', 'liberar_moto',
  'NOVO-bateria-abertas', 'NOVO-bateria-assumir', 'NOVO-bateria-finalizar', 'receber-moto',
  'recebimento-de-motos', 'registrar-solicitacao-base', 'resumo-moto-base', 'saida-entrada',
  'status-de-movimentação', 'teste-rastreamento', 'vistoria_devolucao',
])

// Proxy server-side para o Bubble — esconde o BUBBLE_PRIVATE_KEY (e a apikey)
// do navegador. O client manda { endpoint, body, format } e essa rota monta
// a chamada real, injetando apikey e o Authorization: Bearer aqui dentro.
// Monta a URL da versão de desenvolvimento do Bubble (version-test) — usada
// enquanto um workflow novo ainda não foi promovido pra live
function bubbleUrl(endpoint: string, versionTest?: boolean): string {
  if (!versionTest) return `${BUBBLE_BASE}/${endpoint}`
  const base = new URL(BUBBLE_BASE)
  base.pathname = `/version-test${base.pathname}`
  return `${base.toString().replace(/\/$/, '')}/${endpoint}`
}

export async function POST(req: NextRequest) {
  try {
    const { endpoint, body, format, versionTest } = await req.json()
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ erro: 'endpoint obrigatório' }, { status: 400 })
    }

    const sessao = await verificarToken(req.cookies.get(COOKIE_SESSAO)?.value)
    const permitido = sessao ? ENDPOINTS_PERMITIDOS.has(endpoint) : ENDPOINTS_PUBLICOS.has(endpoint)
    if (!permitido) {
      return NextResponse.json({ erro: sessao ? 'endpoint não permitido' : 'não autenticado' }, { status: sessao ? 403 : 401 })
    }

    const bodyComApikey = { apikey: BUBBLE_KEY, ...(body ?? {}) }
    const url = bubbleUrl(endpoint, versionTest)
    let res: Response

    if (format === 'json') {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyComApikey),
      })
    } else {
      const form = new FormData()
      for (const [key, value] of Object.entries(bodyComApikey)) {
        if (value !== undefined && value !== null) form.append(key, String(value))
      }
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}` },
        body: form,
      })
    }

    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
