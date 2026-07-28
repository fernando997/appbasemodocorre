'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Building2, FileText, Loader2, User } from 'lucide-react'
import { BUBBLE_BASE, BUBBLE_KEY } from '@/lib/config'
import { getUnidadesAtivas } from '@/lib/unidade-ativa'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Registro = Record<string, unknown>

type Agendado = {
  _id: string
  unidade: string
  status: string
  contrato: string
  'data-hora': number
  locatario: string
  veiculo: string
}

export default function LiberacaoPage() {
  const router = useRouter()
  const [agendados, setAgendados] = useState<Agendado[]>([])
  const [contratoMap, setContratoMap] = useState<Record<string, Registro>>({})
  const [veiculoMap, setVeiculoMap] = useState<Record<string, Registro>>({})
  const [unidadeMap, setUnidadeMap] = useState<Record<string, Registro>>({})
  const [clienteMap, setClienteMap] = useState<Record<string, Registro>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState<Date | null>(null)

  async function consultarAgendadas() {
    setErro(null)
    const unidades = getUnidadesAtivas()
    const endpoint = `${BUBBLE_BASE}/saida-entrada`
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: BUBBLE_KEY, unidades }),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = JSON.parse(text)
      const response = data.response ?? data
      const contratos: Registro[] = response.contratos ?? []
      const veiculos: Registro[] = response.veiculos ?? []
      const unidadesResp: Registro[] = response.unidade ?? []
      const clientes: Registro[] = response.cliente ?? []
      setContratoMap(Object.fromEntries(contratos.map((c) => [c._id as string, c])))
      setVeiculoMap(Object.fromEntries(veiculos.map((v) => [v._id as string, v])))
      setUnidadeMap(Object.fromEntries(unidadesResp.map((u) => [u._id as string, u])))
      setClienteMap(Object.fromEntries(clientes.map((c) => [c._id as string, c])))
      setAgendados(response.agendados ?? [])
    } catch {
      setErro('Não foi possível carregar as motos agendadas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    consultarAgendadas()
  }, [])

  useEffect(() => {
    setAgora(new Date())
    const relogio = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(relogio)
  }, [])

  const fila = [...agendados].sort(
    (a, b) => (a['data-hora'] ?? 0) - (b['data-hora'] ?? 0)
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080C1F] via-[#1B2043] to-[#2E4080] text-white flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-10 py-7 border-b border-white/10">
        <div className="flex items-center gap-5">
          <button onClick={() => router.push('/home')} className="hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Modo Corre" className="h-24 w-auto object-contain" />
          </button>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Fila de Retirada</h1>
            <p className="text-[#8E92B3] text-base mt-1">Motos agendadas, em ordem de horário</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-5xl font-bold tabular-nums tracking-tight">{agora ? format(agora, 'HH:mm:ss') : '--:--:--'}</p>
          <p className="text-[#8E92B3] text-base mt-1 capitalize">
            {agora ? format(agora, "EEEE, dd 'de' MMMM", { locale: ptBR }) : ''}
          </p>
        </div>
      </div>

      {/* Fila */}
      <div className="flex-1 overflow-y-auto px-10 py-10">
        {carregando ? (
          <div className="flex items-center justify-center h-full text-[#8E92B3] text-xl gap-3">
            <Loader2 className="w-7 h-7 animate-spin" />
            Carregando...
          </div>
        ) : erro ? (
          <div className="flex items-center justify-center h-full text-red-400 text-xl">{erro}</div>
        ) : fila.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#8E92B3] text-xl">
            Nenhuma moto agendada para retirada.
          </div>
        ) : (
          <div className="max-w-[110rem] mx-auto space-y-4">
            {fila.map((item, i) => {
              const veiculo = veiculoMap[item.veiculo]
              const contrato = contratoMap[item.contrato]
              const unidade = unidadeMap[item.unidade]
              const cliente = clienteMap[item.locatario]
              const horario = item['data-hora'] ? format(new Date(item['data-hora']), 'HH:mm') : '-'
              return (
                <div
                  key={item._id}
                  className="flex items-center gap-6 bg-white/5 border border-white/10 rounded-2xl px-8 py-6 backdrop-blur-sm hover:bg-white/10 transition-colors"
                >
                  <div className="w-14 h-14 rounded-full bg-[#6C63FF] flex items-center justify-center text-2xl font-bold shrink-0">
                    {i + 1}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-56">
                    <Bike className="w-8 h-8 text-[#6C63FF] shrink-0" />
                    <span className="font-mono font-bold text-3xl tracking-wide">{String(veiculo?.placa ?? '-')}</span>
                  </div>

                  <div className="flex-1 grid grid-cols-[2fr_1fr_1fr] gap-6 min-w-0">
                    <div className="min-w-0">
                      <p className="text-[#8E92B3] text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />Locatário
                      </p>
                      <p className="text-xl font-semibold truncate mt-1" title={String(cliente?.nome_completo ?? '-')}>{String(cliente?.nome_completo ?? '-')}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#8E92B3] text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />Unidade
                      </p>
                      <p className="text-xl font-semibold truncate mt-1">{String(unidade?.['Nome Unidade'] ?? '-')}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#8E92B3] text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />Contrato
                      </p>
                      <p className="text-xl font-semibold truncate mt-1">
                        {contrato?.['Numero ctr'] != null ? String(contrato['Numero ctr']) : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[#8E92B3] text-xs uppercase tracking-wide">Horário</p>
                    <p className="text-3xl font-bold tabular-nums mt-1">{horario}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
