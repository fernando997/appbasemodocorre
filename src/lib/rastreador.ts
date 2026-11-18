// Regra única de posição dos rastreadores, usada pela API (/api/rastreador)
// e por todas as telas que testam o rastreador (vistorias, liberação, agendados).
//
// Uma posição só vale se tiver data/hora e essa data tiver no máximo 4 horas.
// Mais antiga que isso (ou sem data) é "desatualizada": aparece em cinza e não
// deixa o fluxo avançar. Quem decide é a API, com o relógio do servidor — as
// telas só leem o campo `desatualizada`.

export const LIMITE_POSICAO_MS = 4 * 60 * 60 * 1000 // 4h

export const MSG_POSICAO_DESATUALIZADA = 'Desatualizado — verificar rastreamento'

export type LocalizacaoRastreador = {
  lat: number | null
  long: number | null
  plataforma: string | null
  // Data/hora da posição (ISO com fuso). null quando a plataforma não informa.
  dataHora?: string | null
  // true quando a posição tem mais de 4h ou não tem data
  desatualizada?: boolean
}

type LocParcial = Pick<LocalizacaoRastreador, 'lat' | 'long' | 'desatualizada'> | null | undefined

// Devolveu latitude e longitude (não diz nada sobre a idade da posição)
export function temPosicao(loc: LocParcial): boolean {
  return loc?.lat != null && loc?.long != null
}

// Tem posição, mas antiga demais para valer
export function posicaoDesatualizada(loc: LocParcial): boolean {
  return temPosicao(loc) && loc?.desatualizada === true
}

// Tem posição e ela é recente — é isso que libera vistoria, liberação e teste
export function posicaoValida(loc: LocParcial): boolean {
  return temPosicao(loc) && loc?.desatualizada !== true
}
