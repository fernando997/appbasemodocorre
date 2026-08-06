'use client'

import { useEffect, useState } from 'react'
import { Bike, ClipboardCheck, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

// Proxy server-side — esconde apikey/BUBBLE_PRIVATE_KEY do navegador
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body, format: 'json' }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`)
  return JSON.parse(text)
}

type Registro = Record<string, unknown>

const TAMANHO_LOTE = 50

// Acha o item de status cujo array `status` (de status_veiculo ids) contém o status_veiculo da moto
function acharStatus(statusList: Registro[], statusVeiculoId: unknown): Registro | undefined {
  return statusList.find((s) => Array.isArray(s.status) && s.status.includes(statusVeiculoId))
}

export default function CheckinBasePage() {
  const [motos, setMotos] = useState<Registro[]>([])
  const [statusList, setStatusList] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function buscarMotos() {
      setCarregando(true)
      setErro(null)
      try {
        const unidades = getUnidadesAtivas()
        const vistos = new Set<string>()
        const todas: Registro[] = []
        let statusAcumulado: Registro[] = []
        let minimo = 1

        while (true) {
          const maximo = minimo + TAMANHO_LOTE - 1
          const data = await chamarBubble('check-in-base', { unidades, minimo, maximo })
          const resp = data.response ?? data
          const lote: Registro[] = Array.isArray(resp)
            ? resp
            : (Object.values(resp).find((v) => Array.isArray(v)) as Registro[] | undefined) ?? []

          if (Array.isArray(resp?.status) && resp.status.length > 0) {
            statusAcumulado = resp.status
          }

          if (lote.length === 0) break
          for (const m of lote) {
            const id = m._id as string
            if (id && !vistos.has(id)) {
              vistos.add(id)
              todas.push(m)
            }
          }
          minimo += TAMANHO_LOTE
        }

        setMotos(todas)
        setStatusList(statusAcumulado)
      } catch {
        setErro('Não foi possível carregar as motos para check-in.')
      } finally {
        setCarregando(false)
      }
    }

    buscarMotos()
  }, [])

  return (
    <>
      <PageHeader
        title="Check-in na Base"
        description="Motos aguardando check-in"
        icon={<ClipboardCheck className="w-5 h-5 text-white" />}
      />
      <div className="max-w-[100rem] mx-auto px-4 sm:px-6 py-6">
        {carregando ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : erro ? (
          <div className="flex items-center justify-center h-64 text-red-500 text-sm">{erro}</div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="bg-[#1B2043] px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                Motos
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#262B59] text-[#8E92B3] border border-[#2A2F5B] text-xs font-bold tabular-nums">
                  {motos.length}
                </span>
              </h3>
            </div>

            {motos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma moto encontrada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Placa</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Modelo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status Veículo</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Dentro/Fora da Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motos.map((m, i) => {
                      const status = acharStatus(statusList, m.status_veiculo)
                      const descricaoStatus = status?.['descrição'] ?? status?.['descricao'] ?? '-'
                      return (
                        <tr key={String(m._id ?? i)} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-mono font-medium">
                              <Bike className="w-3.5 h-3.5 text-[#6C63FF]" />
                              {String(m.placa ?? '-')}
                            </div>
                          </td>
                          <td className="px-4 py-3">{String(m.modelo ?? '-')}</td>
                          <td className="px-4 py-3">{String(m.status_veiculo_desc ?? '-')}</td>
                          <td className="px-4 py-3">{String(descricaoStatus)}</td>
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
