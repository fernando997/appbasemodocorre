'use client'

import { TruckIcon, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type RecolhaItem = {
  _id?: string
  motivo?: string
  status?: string
  placa?: string
  [key: string]: unknown
}

type Veiculo = {
  _id: string
  placa: string
  [key: string]: unknown
}

type Props = {
  dados?: unknown
  veiculos?: Veiculo[]
}

export function PrevisaoRecolhas({ dados, veiculos = [] }: Props) {
  const resp = (dados as { response?: { recolha?: RecolhaItem[] } })?.response
  const todas: RecolhaItem[] = resp?.recolha ?? []

  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v._id, v.placa]))

  const autorizadas = todas.filter((r) => r.status !== 'FINALIZADO')
  const recolhidas = todas.filter((r) => r.status === 'FINALIZADO')

  return (
    <Card className="pt-0">
      <div className="bg-[#1B2043] px-4 pt-4 pb-3 flex items-center gap-2">
        <TruckIcon className="w-4 h-4 text-[#8E92B3] shrink-0" />
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          Previsão de Recolhas
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#262B59] text-[#8E92B3] border border-[#2A2F5B] text-xs font-bold tabular-nums">
            {todas.length}
          </span>
        </h3>
      </div>
      <CardContent className="pt-0">
        <Tabs defaultValue="autorizadas">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="autorizadas" className="flex-1 gap-1.5">
              Em Andamento
              {autorizadas.length > 0 && (
                <Badge className="bg-[#1B2043] text-[#8E92B3] border-[#2A2F5B] text-xs px-1.5 py-0">
                  {autorizadas.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recolhidas" className="flex-1 gap-1.5">
              Finalizadas
              {recolhidas.length > 0 && (
                <Badge className="bg-[#1B2043] text-[#8E92B3] border-[#2A2F5B] text-xs px-1.5 py-0">
                  {recolhidas.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="autorizadas">
            {autorizadas.length > 0 ? (
              <div>
                {autorizadas.map((r, i) => (
                  <div
                    key={r._id ?? i}
                    className="flex items-center justify-between py-2.5 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                      <div>
                        <p className="text-sm font-mono font-medium">{veiculoMap[r.placa ?? ''] ?? r.placa ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">{String(r.motivo ?? '-')}</p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      Em andamento
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {dados == null ? 'Carregando...' : 'Nenhuma recolha em andamento'}
              </p>
            )}
          </TabsContent>

          <TabsContent value="recolhidas">
            {recolhidas.length > 0 ? (
              <div>
                {recolhidas.map((r, i) => (
                  <div
                    key={r._id ?? i}
                    className="flex items-center justify-between py-2.5 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-mono font-medium">{veiculoMap[r.placa ?? ''] ?? r.placa ?? '-'}</p>
                      <p className="text-xs text-muted-foreground">{String(r.motivo ?? '-')}</p>
                    </div>
                    <Badge className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-xs shrink-0">
                      Finalizada
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {dados == null ? 'Carregando...' : 'Nenhuma recolha finalizada'}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
