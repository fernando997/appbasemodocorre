'use client'

import { useState } from 'react'
import { MapPin, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MSG_POSICAO_DESATUALIZADA,
  posicaoDesatualizada,
  temPosicao,
  type LocalizacaoRastreador,
} from '@/lib/rastreador'

export type { LocalizacaoRastreador }

export type EnderecoRastreador = {
  linha1: string | null // rua e número
  linha2: string | null // bairro — cidade/UF
  completo: string | null
}

function formatarDataHora(iso: string): string | null {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(data)
  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`
}

function tempoDecorrido(iso: string, agora: number): string | null {
  const ms = agora - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

export function LocalizacaoRastreadorItem({
  nome,
  loc,
  endereco,
}: {
  nome: string
  loc: LocalizacaoRastreador
  endereco?: EnderecoRastreador
}) {
  // Momento em que o resultado apareceu na tela — base do "há X"
  const [agora] = useState(() => Date.now())
  const temSinal = temPosicao(loc)
  const dataFormatada = loc.dataHora ? formatarDataHora(loc.dataHora) : null
  const decorrido = loc.dataHora ? tempoDecorrido(loc.dataHora, agora) : null
  // Quem decide se passou das 4h é a API (campo `desatualizada`)
  const antiga = posicaoDesatualizada(loc)
  // Verde só quando há posição e ela é recente
  const ok = temSinal && !antiga

  const coordenadas = temSinal ? `${loc.lat!.toFixed(5)}, ${loc.long!.toFixed(5)}` : null
  const linha1 = endereco?.linha1 ?? endereco?.completo ?? coordenadas
  const linha2 = endereco?.linha1 ? endereco.linha2 : null

  return (
    <div
      className={`rounded-xl border p-3 ${ok ? 'border-green-200 bg-green-50/50' : 'border-zinc-200 bg-zinc-50'}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-green-100' : 'bg-zinc-200'}`}>
          <MapPin className={`w-4 h-4 ${ok ? 'text-green-600' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium capitalize ${temSinal && antiga ? 'text-zinc-600' : ''}`}>{nome}</p>
          {temSinal ? (
            loc.plataforma && <p className="text-xs text-muted-foreground">{loc.plataforma}</p>
          ) : (
            <p className="text-xs text-zinc-400">Sem sinal</p>
          )}
        </div>
        {temSinal && (
          <a
            href={`https://www.google.com/maps?q=${loc.lat},${loc.long}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm" className={`gap-1.5 text-xs h-8 ${ok ? 'border-green-300 text-green-700 hover:bg-green-100' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100'}`}>
              <MapPin className="w-3.5 h-3.5" /> Ver mapa
            </Button>
          </a>
        )}
      </div>

      {temSinal && (
        <div className={`mt-2.5 pt-2.5 border-t space-y-1.5 ${ok ? 'border-green-200/70' : 'border-zinc-200'}`}>
          {antiga && (
            <p className="flex items-start gap-1.5 text-xs font-semibold text-zinc-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{MSG_POSICAO_DESATUALIZADA}</span>
            </p>
          )}
          <div>
            <p className={`text-sm font-medium leading-snug break-words ${antiga ? 'text-zinc-500' : ''}`}>{linha1}</p>
            {linha2 && <p className="text-xs text-muted-foreground leading-snug break-words">{linha2}</p>}
          </div>
          <p className={`flex items-start gap-1.5 text-xs ${antiga ? 'text-zinc-500' : 'text-muted-foreground'}`}>
            <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />
            {dataFormatada ? (
              <span>
                <span className="font-medium">{dataFormatada}</span>
                {decorrido && ` · ${decorrido}`}
              </span>
            ) : (
              <span>Data e hora não informadas</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
