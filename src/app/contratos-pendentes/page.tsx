'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileSignature, RefreshCw, Loader2, CalendarClock, User, Hash, Truck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'
import { VERSAO_BUBBLE, setContagemContratosPendentes } from '@/lib/use-contratos-pendentes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, versionTest: VERSAO_BUBBLE }),
  })
  return res.json()
}

type Contrato = {
  _id: string
  'Numero ctr'?: number
  inicio?: string
  placa?: string
  cliente?: string
  tipo_de_entrega?: string
}

type Veiculo = { _id: string; placa?: string; modelo?: string; cor?: string }
type Cliente = { _id: string; nome_completo?: string; celular?: string }

function fmtDataHora(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ContratosPendentesPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [veiculos, setVeiculos] = useState<Record<string, Veiculo>>({})
  const [clientes, setClientes] = useState<Record<string, Cliente>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const data = await chamarBubble('base-contratos-pendentes', { unidade: JSON.stringify(getUnidadesAtivas()) })
      const r = data?.response ?? {}
      const listaV: Veiculo[] = r.veiculos ?? []
      const listaC: Cliente[] = r.clientes ?? []
      const lista: Contrato[] = r.contratos ?? []
      setContratos(lista)
      setContagemContratosPendentes(lista.length)
      setVeiculos(Object.fromEntries(listaV.map((v) => [v._id, v])))
      setClientes(Object.fromEntries(listaC.map((c) => [c._id, c])))
    } catch {
      setErro('Não foi possível carregar os contratos pendentes.')
      setContratos([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    buscar()
  }, [buscar])

  return (
    <div className="min-h-full">
      <PageHeader
        title="Contratos Pendentes"
        description="Contratos assinados aguardando entrega da moto"
        icon={<FileSignature className="w-5 h-5 text-white" />}
        actions={
          <button
            onClick={buscar}
            disabled={carregando}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-[#1B2043] text-white hover:bg-[#262B59] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        }
      />

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-[#6C63FF]" />
            <p className="text-sm">Buscando contratos...</p>
          </div>
        ) : erro ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">{erro}</div>
        ) : contratos.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-[#D5D8EA] py-16 text-center">
            <FileSignature className="w-10 h-10 mx-auto text-[#C5C8E4]" />
            <p className="mt-3 font-semibold">Nenhum contrato pendente</p>
            <p className="text-sm text-muted-foreground mt-1">Quando um contrato for assinado ele aparece aqui.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-semibold text-foreground">{contratos.length}</span> {contratos.length === 1 ? 'moto para preparar' : 'motos para preparar'}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {contratos.map((c, i) => {
                const v = c.placa ? veiculos[c.placa] : undefined
                const cl = c.cliente ? clientes[c.cliente] : undefined
                return (
                  <div
                    key={c._id}
                    className="min-w-0 rounded-2xl bg-white border border-[#E2E4F0] p-4 sm:p-5 shadow-[0_2px_10px_rgba(27,32,67,0.06)] animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xl sm:text-2xl font-bold font-mono tracking-wider">{v?.placa ?? '-'}</p>
                        <p className="text-sm text-muted-foreground truncate">{[v?.modelo, v?.cor].filter(Boolean).join(' · ') || '-'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1">PENDENTE</span>
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-[#6C63FF] shrink-0" />
                        <span className="truncate">{cl?.nome_completo ?? '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-[#6C63FF] shrink-0" />
                        <span>Contrato <span className="font-mono font-medium">{c['Numero ctr'] ?? '-'}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-[#6C63FF] shrink-0" />
                        <span>Início {fmtDataHora(c.inicio)}</span>
                      </div>
                      {c.tipo_de_entrega && (
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#6C63FF] shrink-0" />
                          <span>{c.tipo_de_entrega}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
