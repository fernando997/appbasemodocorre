'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'

// Contagem de contratos pendentes pro selo do menu. Um único estado
// compartilhado: o menu lateral e o do celular usam o mesmo número e a mesma
// busca. A tela /contratos-pendentes atualiza o número com setContagemContratosPendentes.

// Versão do Bubble chamada (false = live)
export const VERSAO_BUBBLE = false
const INTERVALO_MS = 2 * 60 * 1000

let contagem = 0
let buscando = false
let usuarios = 0
let timer: ReturnType<typeof setInterval> | null = null
const ouvintes = new Set<() => void>()

export function setContagemContratosPendentes(valor: number) {
  if (valor === contagem) return
  contagem = valor
  ouvintes.forEach((f) => f())
}

async function buscarContagem() {
  if (buscando) return
  buscando = true
  try {
    const res = await fetch('/api/bubble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'base-contratos-pendentes',
        body: { unidade: JSON.stringify(getUnidadesAtivas()) },
        versionTest: VERSAO_BUBBLE,
      }),
    })
    const data = await res.json()
    const lista = data?.response?.contratos
    if (Array.isArray(lista)) setContagemContratosPendentes(lista.length)
  } catch {
    // mantém o último número
  } finally {
    buscando = false
  }
}

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

export function useContratosPendentes() {
  useEffect(() => {
    usuarios += 1
    if (usuarios === 1) {
      buscarContagem()
      timer = setInterval(buscarContagem, INTERVALO_MS)
    }
    return () => {
      usuarios -= 1
      if (usuarios === 0 && timer) { clearInterval(timer); timer = null }
    }
  }, [])

  return useSyncExternalStore(assinar, () => contagem, () => 0)
}
