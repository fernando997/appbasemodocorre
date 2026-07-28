import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type PendenciaItem = {
  _id?: string
  'descrição'?: string
  tipo?: string
  status?: string
  veiculo?: string
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

export function Pendencias({ dados, veiculos = [] }: Props) {
  const resp = (dados as { response?: { pendencias?: PendenciaItem[] } })?.response
  const todas: PendenciaItem[] = resp?.pendencias ?? []
  const ativas = todas.filter((p) => p.status === 'ATIVO')

  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v._id, v.placa]))

  return (
    <Card className="pt-0">
      <div className="bg-[#1B2043] px-4 pt-4 pb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-[#8E92B3] shrink-0" />
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          Pendências
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#262B59] text-[#8E92B3] border border-[#2A2F5B] text-xs font-bold tabular-nums">
            {ativas.length}
          </span>
        </h3>
      </div>
      <CardContent className="pt-0">
        {ativas.length > 0 ? (
          <div className="space-y-0">
            {ativas.map((p, i) => (
              <div key={p._id ?? i} className="flex items-start justify-between py-2.5 border-b last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono font-medium">{veiculoMap[p.veiculo ?? ''] ?? p.veiculo ?? '-'}</p>
                  <p className="text-xs text-muted-foreground truncate">{String(p['descrição'] ?? '-')}</p>
                  {p.tipo && (
                    <p className="text-xs text-muted-foreground/70">{String(p.tipo)}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-yellow-600 border-yellow-300 text-xs shrink-0 mt-0.5">
                  Pendente
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {dados == null ? 'Carregando...' : 'Nenhuma pendência ativa'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
