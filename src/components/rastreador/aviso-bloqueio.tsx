'use client'

import {
  MSG_POSICAO_DESATUALIZADA,
  posicaoDesatualizada,
  temPosicao,
  type LocalizacaoRastreador,
} from '@/lib/rastreador'
import { LocalizacaoRastreadorItem, type EnderecoRastreador } from './localizacao-item'

// Texto (e cartões) do bloqueio quando o teste do rastreador não passa.
// Diferencia "não devolveu posição" de "devolveu, mas com mais de 4h".
export function AvisoRastreadorBloqueado({
  localizacoes,
  enderecos,
  complemento,
}: {
  localizacoes: Record<string, LocalizacaoRastreador>
  enderecos?: Record<string, EnderecoRastreador>
  // Frase extra do fluxo, ex.: "Não é possível prosseguir com a vistoria."
  complemento?: string
}) {
  const obrigatorios = ['principal', 'backup'] as const
  const desatualizados = obrigatorios.filter((n) => posicaoDesatualizada(localizacoes[n]))
  const semPosicao = obrigatorios.filter((n) => !temPosicao(localizacoes[n]))
  const comPosicao = Object.entries(localizacoes).filter(([, loc]) => temPosicao(loc))

  const titulo = desatualizados.length > 0 ? MSG_POSICAO_DESATUALIZADA : 'Sem sinal'
  const partes: string[] = []
  if (desatualizados.length > 0) {
    partes.push(`A última posição do ${desatualizados.join(' e do ')} tem mais de 4 horas.`)
  }
  if (semPosicao.length > 0) {
    partes.push(
      semPosicao.length === obrigatorios.length
        ? 'Nenhum rastreador desta moto retornou localização.'
        : `O ${semPosicao[0]} não retornou localização.`
    )
  }
  if (complemento?.trim()) partes.push(complemento.trim())

  return (
    <>
      <div>
        <p className="text-sm font-bold text-red-800">{titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{partes.join(' ')}</p>
      </div>
      {comPosicao.length > 0 && (
        <div className="w-full space-y-2.5 text-left">
          {comPosicao.map(([nome, loc]) => (
            <LocalizacaoRastreadorItem key={nome} nome={nome} loc={loc} endereco={enderecos?.[nome]} />
          ))}
        </div>
      )}
    </>
  )
}
