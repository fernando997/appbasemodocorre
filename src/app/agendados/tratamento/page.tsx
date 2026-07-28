'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bike,
  CheckCircle2,
  ClipboardList,
  Clock,
  Inbox,
  Loader2,
  Lock,
  MoreVertical,
  Radio,
  Repeat,
  RotateCcw,
  Tag,
  Truck,
  Unlock,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BUBBLE_BASE, BUBBLE_KEY } from '@/lib/config'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'
import { format } from 'date-fns'

type Registro = Record<string, unknown>

// Regras de negócio de mensagens-liberacao.txt: texto da ação a executar por status atual
const ACAO_POR_STATUS: Record<string, string> = {
  'ENTREGA PREVISTA': 'EFETUAR TESTE DE RASTREAMENTO',
  'AGUARDANDO LIBERAÇÃO': 'EFETUAR LIBERAÇÃO DO VEÍCULO',
  'ENTREGA AUTORIZADA': 'CONFIRMAR A ENTREGA NO SISTEMA',
}

// Classes literais (Tailwind precisa ver a string completa pra gerar o CSS)
const CORES_BADGE = [
  'bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/25',
  'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25',
  'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25',
  'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25',
  'bg-[#0EA5E9]/10 text-[#0EA5E9] border-[#0EA5E9]/25',
  'bg-[#EC4899]/10 text-[#EC4899] border-[#EC4899]/25',
  'bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/25',
  'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/25',
  'bg-[#F97316]/10 text-[#F97316] border-[#F97316]/25',
  'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/25',
]

// Escolhe sempre a mesma cor pro mesmo texto (status/ação), sem precisar cadastrar cor por cor
function classeBadgePorTexto(texto: string): string {
  let hash = 0
  for (let i = 0; i < texto.length; i++) {
    hash = texto.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CORES_BADGE[Math.abs(hash) % CORES_BADGE.length]
}

// Ícone por palavra-chave do texto de status/ação
function iconePorTexto(texto: string): LucideIcon {
  const t = texto.toUpperCase()
  if (t.includes('RASTREAMENTO')) return Radio
  if (t.includes('LIBERA')) return Lock
  if (t.includes('AUTORIZADA')) return Unlock
  if (t.includes('ENTREGUE') || t.includes('CONFIRMAR')) return CheckCircle2
  if (t.includes('ENTREGA PREVISTA')) return Clock
  if (t.includes('DEVOLU')) return RotateCcw
  if (t.includes('MANUTEN')) return Wrench
  if (t.includes('SUBSTITU')) return Repeat
  if (t.includes('OFICINA')) return Truck
  if (t.includes('RECEBID')) return Inbox
  return Tag
}

type StatusSinal = { respondeu: boolean; horas_sem_comunicacao?: number }
type ResultadoSinal = { principal: StatusSinal; backup: StatusSinal }

// Mock — ainda não existe endpoint real de rastreador no projeto
async function emitirSinal(): Promise<ResultadoSinal> {
  await new Promise((r) => setTimeout(r, 1200))
  return {
    principal: { respondeu: true, horas_sem_comunicacao: 0 },
    backup: { respondeu: false, horas_sem_comunicacao: 14 },
  }
}

// Mock — ainda não existe endpoint real de confirmação de entrega
async function confirmarEntregaMock(): Promise<void> {
  await new Promise((r) => setTimeout(r, 800))
}

function ConfirmarEntregaDialog({ placa }: { placa: string }) {
  const [aberto, setAberto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)

  async function confirmar() {
    setConfirmando(true)
    await confirmarEntregaMock()
    setConfirmado(true)
    setConfirmando(false)
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => {
        setAberto(open)
        if (!open) setConfirmado(false)
      }}
    >
      <DialogTrigger render={<Button className="w-full" />}>
        Confirmar Entrega
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Entrega</DialogTitle>
        </DialogHeader>
        {confirmado ? (
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium bg-green-50 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4" />
            Entrega confirmada com sucesso.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Confirma que a moto <span className="font-mono font-medium text-foreground">{placa}</span> foi entregue ao cliente?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAberto(false)} disabled={confirmando}>Cancelar</Button>
              <Button onClick={confirmar} disabled={confirmando} className="bg-green-600 hover:bg-green-700">
                {confirmando ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</>
                ) : 'Sim, foi entregue'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConteudoAcaoPopup({
  descricaoStatus,
  cliente,
  acaoFixa,
  placa,
  agendado,
}: {
  descricaoStatus: string
  cliente?: Registro
  acaoFixa?: string
  placa: string
  agendado: Registro
}) {
  const router = useRouter()
  const [acionando, setAcionando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoSinal | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function acionar() {
    setAcionando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await emitirSinal()
      setResultado(res)
    } catch {
      setErro('Não foi possível acionar o rastreador. Tente novamente.')
    } finally {
      setAcionando(false)
    }
  }

  if (descricaoStatus === 'DEVOLUÇÃO PREVISTA') {
    return (
      <p className="text-sm">
        Locatário: <span className="font-medium">{String(cliente?.nome_completo ?? '-')}</span>
      </p>
    )
  }

  if (descricaoStatus === 'ENTREGA PREVISTA') {
    return (
      <div className="space-y-3">
        <p className="font-medium text-sm">{acaoFixa}</p>
        {erro && <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1.5">{erro}</p>}
        {resultado && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-zinc-100 px-3 py-2">
              <p className="text-xs font-medium text-zinc-600">Resposta do rastreador</p>
            </div>
            {(['principal', 'backup'] as const).map((tipo) => {
              const s = resultado[tipo]
              return (
                <div key={tipo} className={`flex items-center justify-between px-3 py-2.5 border-t ${s.respondeu ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className="text-sm font-medium capitalize">{tipo}</span>
                  <div className="flex items-center gap-1.5">
                    {s.respondeu ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-semibold text-green-700">Respondeu</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-semibold text-red-600">
                          Sem sinal há {s.horas_sem_comunicacao}h
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <Button onClick={acionar} disabled={acionando} className="w-full">
          {acionando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Acionando...</>
          ) : 'Emitir Sinal'}
        </Button>
      </div>
    )
  }

  if (descricaoStatus === 'AGUARDANDO LIBERAÇÃO') {
    const cpf = String(cliente?.cpf ?? '')
    return (
      <div className="space-y-3">
        <p className="font-medium text-sm">{acaoFixa}</p>
        <Button
          className="w-full"
          onClick={() => {
            localStorage.setItem('mc_agendado_liberacao', JSON.stringify(agendado))
            router.push(`/liberacao-cpf?placa=${encodeURIComponent(placa)}&cpf=${encodeURIComponent(cpf)}`)
          }}
        >
          Ir para liberação
        </Button>
      </div>
    )
  }

  if (descricaoStatus === 'ENTREGA AUTORIZADA') {
    return (
      <div className="space-y-3">
        <p className="font-medium text-sm">{acaoFixa}</p>
        <ConfirmarEntregaDialog placa={placa} />
      </div>
    )
  }

  if (acaoFixa) {
    return <p className="font-medium text-sm">{acaoFixa}</p>
  }

  return <p className="text-muted-foreground text-sm">Nenhuma ação pendente para este status.</p>
}

type Agendado = {
  _id: string
  unidade: string
  'status-atual'?: string
  'ação'?: string
  frota?: string
  contrato: string
  'data-hora': number
  locatario: string
  veiculo: string
}


export default function TratamentoPage() {
  const [agendados, setAgendados] = useState<Agendado[]>([])
  const [veiculoMap, setVeiculoMap] = useState<Record<string, Registro>>({})
  const [unidadeMap, setUnidadeMap] = useState<Record<string, Registro>>({})
  const [frotaMap, setFrotaMap] = useState<Record<string, Registro>>({})
  const [clienteMap, setClienteMap] = useState<Record<string, Registro>>({})
  const [statusMap, setStatusMap] = useState<Record<string, Registro>>({})
  const [acoesMap, setAcoesMap] = useState<Record<string, Registro>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function consultarAgendadas() {
    setCarregando(true)
    setErro(null)
    const unidades = getUnidadesAtivas()
    const endpoint = `${BUBBLE_BASE}/saida-entrada`
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: BUBBLE_KEY, unidades }),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = JSON.parse(text)
      const response = data.response ?? data
      const veiculos: Registro[] = response.veiculos ?? []
      const unidadesResp: Registro[] = response.unidade ?? []
      const frotaResp: Registro[] = response.frota ?? []
      const clientes: Registro[] = response.cliente ?? []
      const statusResp: Registro[] = response.status ?? []
      const acoesResp: Registro[] = response['ações'] ?? []
      setVeiculoMap(Object.fromEntries(veiculos.map((v) => [v._id as string, v])))
      setUnidadeMap(Object.fromEntries(unidadesResp.map((u) => [u._id as string, u])))
      setFrotaMap(Object.fromEntries(frotaResp.map((f) => [f._id as string, f])))
      setClienteMap(Object.fromEntries(clientes.map((c) => [c._id as string, c])))
      setStatusMap(Object.fromEntries(statusResp.map((s) => [s._id as string, s])))
      setAcoesMap(Object.fromEntries(acoesResp.map((a) => [a._id as string, a])))
      setAgendados(response.agendados ?? [])
    } catch {
      setErro('Não foi possível carregar as motos agendadas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { consultarAgendadas() }, [])

  const fila = [...agendados].sort(
    (a, b) => (a['data-hora'] ?? 0) - (b['data-hora'] ?? 0)
  )

  return (
    <>
      <PageHeader
        title="Tratamento"
        description="Agendados"
        icon={<ClipboardList className="w-5 h-5 text-white" />}
      />
      <div className="max-w-[100rem] mx-auto px-4 sm:px-6 py-6">
        {carregando ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Carregando...
          </div>
        ) : erro ? (
          <div className="flex items-center justify-center h-64 text-red-500 text-sm">{erro}</div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="bg-[#1B2043] px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                Motos Agendadas
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#262B59] text-[#8E92B3] border border-[#2A2F5B] text-xs font-bold tabular-nums">
                  {fila.length}
                </span>
              </h3>
              <span className="text-xs text-[#8E92B3] font-medium">para tratamento</span>
            </div>

            {fila.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma moto agendada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[64rem]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Placa</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Unidade</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Frota</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Horário</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Ações</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs uppercase tracking-wide">Executar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.map((item, i) => {
                      const veiculo = veiculoMap[item.veiculo]
                      const unidade = unidadeMap[item.unidade]
                      const frota = item.frota ? frotaMap[item.frota] : null
                      const status = item['status-atual'] ? statusMap[item['status-atual']] : null
                      const acao = item['ação'] ? acoesMap[item['ação']] : null
                      const cliente = clienteMap[item.locatario]
                      const horario = item['data-hora'] ? format(new Date(item['data-hora']), 'dd/MM HH:mm') : '-'
                      const descricaoStatus = String(status?.['descrição'] ?? '')
                      const descricaoAcao = String(acao?.['descrição'] ?? '')
                      const acaoFixa = ACAO_POR_STATUS[descricaoStatus]
                      const IconeStatus = iconePorTexto(descricaoStatus)
                      const IconeAcao = iconePorTexto(descricaoAcao)
                      return (
                        <tr key={item._id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 font-mono font-medium text-sm">
                              <Bike className="w-3.5 h-3.5 text-[#6C63FF]" />
                              {String(veiculo?.placa ?? '-')}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm whitespace-nowrap">{String(unidade?.['Nome Unidade'] ?? '-')}</td>
                          <td className="px-5 py-3.5 text-sm whitespace-nowrap">{String(frota?.nome ?? '-')}</td>
                          <td className="px-5 py-3.5 text-sm whitespace-nowrap">{horario}</td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {status ? (
                              <Badge className={`${classeBadgePorTexto(descricaoStatus)} text-xs font-medium gap-1 whitespace-nowrap`}>
                                <IconeStatus className="w-3 h-3 shrink-0" />
                                {String(status['descrição'] ?? '-')}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {acao ? (
                              <Badge className={`${classeBadgePorTexto(descricaoAcao)} text-xs font-medium gap-1 whitespace-nowrap`}>
                                <IconeAcao className="w-3 h-3 shrink-0" />
                                {String(acao['descrição'] ?? '-')}
                              </Badge>
                            ) : (
                              <button className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Ações (em breve)">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <Dialog>
                              <DialogTrigger
                                render={
                                  <Button variant="ghost" size="icon-sm" title="Executar ação" />
                                }
                              >
                                <IconeAcao className="w-4 h-4" />
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>{String(veiculo?.placa ?? '-')} — {descricaoStatus || 'Sem status'}</DialogTitle>
                                </DialogHeader>
                                <ConteudoAcaoPopup
                                  descricaoStatus={descricaoStatus}
                                  cliente={cliente}
                                  acaoFixa={acaoFixa}
                                  placa={String(veiculo?.placa ?? '')}
                                  agendado={item}
                                />
                              </DialogContent>
                            </Dialog>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
