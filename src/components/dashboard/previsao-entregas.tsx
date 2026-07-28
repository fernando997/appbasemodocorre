'use client'

import { CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntregaItem } from '@/components/liberacao/entrega-item'
import { entregasData } from '@/lib/mock-data'

export function PrevisaoEntregas() {
  const confirmadas = entregasData.filter((e) => e.tipo === 'confirmada')
  const agendadas = entregasData.filter((e) => e.tipo === 'agendada')

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-green-600" />
          <CardTitle className="text-base">Previsão de Entregas</CardTitle>
        </div>
        <div className="flex gap-2 mt-1">
          <Badge className="bg-green-500/10 text-green-600 border-green-200">
            {confirmadas.length} confirmadas
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {agendadas.length} agendadas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {confirmadas.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
              Confirmadas
            </p>
            {confirmadas.map((e) => (
              <EntregaItem key={e.id} entrega={e} />
            ))}
          </div>
        )}
        {agendadas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 mt-2">
              Agendadas
            </p>
            {agendadas.map((e) => (
              <EntregaItem key={e.id} entrega={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
