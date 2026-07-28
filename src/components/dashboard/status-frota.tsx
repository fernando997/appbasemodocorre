'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STATUS_ATENCAO = ['MANUTENÇÃO', 'SINISTRO', 'EM VISTORIA', 'IRREGULARES', 'BLOQUEADO', 'INATIVO']

const COLOR_ATENCAO: Record<string, string> = {
  'MANUTENÇÃO':  '#eab308',
  'SINISTRO':    '#ef4444',
  'EM VISTORIA': '#f59e0b',
  'IRREGULARES': '#ef4444',
  'BLOQUEADO':   '#ef4444',
  'INATIVO':     '#71717a',
}

type StatusItem = {
  status: string
  quantidade: number
  atencao: boolean
  placas: { placa: string; modelo: string; cor: string }[]
}

type Veiculo = {
  placa: string
  modelo: string
  cor: string
  status_veiculo_desc: string
  [key: string]: unknown
}

function getColor(item: StatusItem) {
  if (!item.atencao) return '#16a34a'
  return COLOR_ATENCAO[item.status] ?? '#eab308'
}

function agruparPorStatus(veiculos: Veiculo[]): StatusItem[] {
  const mapa: Record<string, StatusItem> = {}
  for (const v of veiculos) {
    const status = v.status_veiculo_desc ?? 'SEM STATUS'
    if (!mapa[status]) {
      mapa[status] = { status, quantidade: 0, atencao: STATUS_ATENCAO.includes(status), placas: [] }
    }
    mapa[status].quantidade++
    mapa[status].placas.push({ placa: v.placa, modelo: v.modelo, cor: v.cor })
  }
  return Object.values(mapa).sort((a, b) => b.quantidade - a.quantidade)
}

export function StatusFrota({ veiculos }: { veiculos: Veiculo[] }) {
  const data = agruparPorStatus(veiculos)
  const total = veiculos.length
  const router = useRouter()

  return (
    <Card className="pt-0">
      <div className="bg-[#1B2043] px-4 pt-4 pb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          Status da Frota
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#262B59] text-[#8E92B3] border border-[#2A2F5B] text-xs font-bold tabular-nums">
            {total}
          </span>
        </h3>
        <span className="text-xs text-[#8E92B3] font-medium">motos</span>
      </div>
      <CardContent className="px-4 pb-4 space-y-2">
        {data.map((item) => {
          const cor = getColor(item)
          const pct = total > 0 ? (item.quantidade / total) * 100 : 0
          return (
            <button
              key={item.status}
              onClick={() => router.push(`/frota/${encodeURIComponent(item.status)}`)}
              className="w-full flex items-center gap-3 group px-2 py-1 rounded-lg border border-transparent hover:border-foreground/20 hover:bg-muted/60 transition-all duration-150"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 transition-transform duration-150 group-hover:scale-125"
                style={{ background: cor }}
              />
              <span className="text-sm text-left w-28 sm:w-40 shrink-0 truncate text-muted-foreground group-hover:text-foreground transition-colors duration-150">
                {item.status}
              </span>
              <div className="flex-1 h-6 bg-muted rounded overflow-hidden transition-all duration-200">
                <div
                  className="h-full rounded transition-all duration-200 group-hover:[filter:brightness(0.7)]"
                  style={{ width: `${pct}%`, background: cor }}
                />
              </div>
              <span className="text-sm font-semibold w-16 sm:w-20 text-right shrink-0 group-hover:text-foreground transition-colors duration-150">
                {item.quantidade} <span className="text-xs font-normal text-muted-foreground">({Math.round(pct)}%)</span>
              </span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
