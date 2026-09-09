'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bike, Layers, Clock, ClipboardList, Trophy, List as ListIcon, LayoutGrid, Building2, Fingerprint, Filter, ChevronDown, X, MapPin } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamarBubble(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/bubble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, body }),
  })
  return res.json()
}

type Veiculo = {
  placa: string
  modelo: string
  cor: string
  chassi: string
  locadora: string
  Unidade?: string
  status_veiculo_desc: string
  status_veiculo_date?: number
  [key: string]: unknown
}

// status_veiculo_date vem em ms (timestamp Bubble) — quantos dias já se passaram
// desde que a moto entrou no status atual
function diasNoStatus(dataMs: number | undefined): number | null {
  if (dataMs == null) return null
  const dias = Math.floor((Date.now() - dataMs) / (1000 * 60 * 60 * 24))
  return dias >= 0 ? dias : null
}

// Quanto mais tempo parada no status, mais quente a cor — chama atenção
// pra quem está há mais tempo sem resolver
function corDias(dias: number): { badge: string; glow: string; forte: string } {
  if (dias <= 3)  return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', glow: 'rgba(16,185,129,0.28)', forte: 'rgba(16,185,129,0.85)' }
  if (dias <= 7)  return { badge: 'bg-amber-50 text-amber-700 border-amber-200',       glow: 'rgba(245,158,11,0.28)', forte: 'rgba(245,158,11,0.85)' }
  if (dias <= 15) return { badge: 'bg-orange-50 text-orange-700 border-orange-200',    glow: 'rgba(249,115,22,0.3)',  forte: 'rgba(249,115,22,0.85)' }
  return             { badge: 'bg-red-50 text-red-700 border-red-200',            glow: 'rgba(239,68,68,0.32)',  forte: 'rgba(239,68,68,0.85)' }
}

type Locadora = {
  _id: string
  Nome?: string
  nome?: string
  Name?: string
}

function contarPor(veiculos: Veiculo[], campo: keyof Veiculo) {
  const mapa: Record<string, number> = {}
  for (const v of veiculos) {
    const val = String(v[campo] ?? '-')
    mapa[val] = (mapa[val] ?? 0) + 1
  }
  return Object.entries(mapa).sort((a, b) => b[1] - a[1])
}

// Cartão com borda em degradê azul-marinho e leve efeito de vidro — usado nas
// estatísticas e no painel da lista, com animação de entrada em cascata
function GlassPanel({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div
      className="rounded-2xl p-[1px]"
      style={{
        background: 'linear-gradient(135deg, rgba(27,32,67,0.22), rgba(108,99,255,0.08) 45%, transparent 75%)',
        animation: `cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      }}
    >
      <div className={`bg-white/80 backdrop-blur-md rounded-2xl border border-[#1B2043]/8 shadow-[0_8px_28px_rgba(27,32,67,0.08)] ${className}`}>
        {children}
      </div>
    </div>
  )
}

function StatCard({ icon, iconBg, iconColor, label, value, sub, delay }: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: React.ReactNode
  sub?: string
  delay: number
}) {
  return (
    <GlassPanel delay={delay} className="p-4 h-full">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-[#1B2043]/50 uppercase tracking-wide truncate font-medium">{label}</p>
          <p className="text-xl font-bold text-[#1B2043] leading-tight truncate">{value}</p>
          {sub && <p className="text-xs text-black truncate">{sub}</p>}
        </div>
      </div>
    </GlassPanel>
  )
}

type Modo = 'tabela' | 'cards'

export default function FrotaStatusPage() {
  const { status } = useParams<{ status: string }>()
  const statusNome = decodeURIComponent(status)
  const router = useRouter()
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [locadoraMap, setLocadoraMap] = useState<Record<string, string>>({})
  const [unidadeMap, setUnidadeMap] = useState<Record<string, string>>({})
  const [modo, setModo] = useState<Modo>('tabela')

  // Filtros
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [fPlaca, setFPlaca] = useState('')
  const [fLocadora, setFLocadora] = useState('')
  const [fUnidade, setFUnidade] = useState('')
  const [fDiasMin, setFDiasMin] = useState('')
  const [fDiasMax, setFDiasMax] = useState('')

  useEffect(() => {
    try {
      const todos: Veiculo[] = JSON.parse(localStorage.getItem('mc_veiculos') ?? '[]')
      const filtrados = todos.filter((v) => v.status_veiculo_desc === statusNome)
      setVeiculos(filtrados)

      // Nome das unidades — vem do que já está salvo no login (mc_unidades),
      // sem precisar de outra chamada só pra isso
      try {
        const unidades = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]') as { _id: string; 'Nome Unidade': string }[]
        setUnidadeMap(Object.fromEntries(unidades.map((u) => [u._id, u['Nome Unidade']])))
      } catch {}

      const ids = [...new Set(filtrados.map((v) => v.locadora).filter(Boolean))]
      if (ids.length === 0) return

      chamarBubble('chamar-locadoras', { locadoras: JSON.stringify(ids) })
        .then((data) => {
          const lista: Locadora[] = data?.response?.locadoras ?? []
          const map: Record<string, string> = {}
          for (const l of lista) {
            map[l._id] = l.Nome ?? l.nome ?? l.Name ?? '-'
          }
          setLocadoraMap(map)
        })
        .catch(() => {})
    } catch {
      setVeiculos([])
    }
  }, [statusNome])

  // Opções dos selects — só as locadoras/unidades que realmente aparecem nessa lista
  const locadorasDisponiveis = [...new Set(veiculos.map((v) => locadoraMap[v.locadora]).filter(Boolean))].sort()
  const unidadesDisponiveis = [...new Set(veiculos.map((v) => unidadeMap[v.Unidade ?? '']).filter(Boolean))].sort()
  const filtrosAtivos = [fPlaca, fLocadora, fUnidade, fDiasMin, fDiasMax].filter(Boolean).length

  const veiculosFiltrados = veiculos.filter((v) => {
    if (fPlaca && !v.placa?.toLowerCase().includes(fPlaca.toLowerCase())) return false
    if (fLocadora && !(locadoraMap[v.locadora] ?? '').toLowerCase().includes(fLocadora.toLowerCase())) return false
    if (fUnidade && unidadeMap[v.Unidade ?? ''] !== fUnidade) return false
    const dias = diasNoStatus(v.status_veiculo_date)
    if (fDiasMin && (dias == null || dias < Number(fDiasMin))) return false
    if (fDiasMax && (dias == null || dias > Number(fDiasMax))) return false
    return true
  })

  const porModelo = contarPor(veiculosFiltrados, 'modelo')
  const diasValidos = veiculosFiltrados.map((v) => diasNoStatus(v.status_veiculo_date)).filter((d): d is number => d != null)
  const mediaDias = diasValidos.length > 0 ? Math.round(diasValidos.reduce((a, b) => a + b, 0) / diasValidos.length) : null

  return (
    <>
      <PageHeader
        title={statusNome}
        description={`${veiculos.length} moto${veiculos.length !== 1 ? 's' : ''}`}
        icon={<Bike className="w-5 h-5 text-white" />}
        actions={
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-white via-[#F4F5FB] to-white">
        <div className="p-4 sm:p-6 space-y-6 max-w-screen-xl mx-auto">

          {/* Estatísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              delay={0}
              icon={<Bike className="w-5 h-5" />}
              iconBg="bg-[#1B2043]/10"
              iconColor="text-[#1B2043]"
              label="Total"
              value={veiculosFiltrados.length}
            />
            <StatCard
              delay={60}
              icon={<Clock className="w-5 h-5" />}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
              label="Média de dias"
              value={mediaDias ?? '-'}
            />
            <StatCard
              delay={120}
              icon={<Layers className="w-5 h-5" />}
              iconBg="bg-sky-100"
              iconColor="text-sky-600"
              label="Modelos"
              value={porModelo.length}
            />
            <StatCard
              delay={180}
              icon={<Trophy className="w-5 h-5" />}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Mais comum"
              value={porModelo[0]?.[0] ?? '-'}
              sub={`${porModelo[0]?.[1] ?? 0} unidades`}
            />
          </div>

          {/* Lista de motos */}
          <GlassPanel delay={240} className="overflow-hidden">
            <div className="bg-[#1B2043] px-5 py-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-white/70" />
              <span className="text-sm font-semibold text-white">Motos</span>
              <span className="ml-2 text-xs font-medium text-white/70 bg-white/15 rounded-full px-2.5 py-0.5">
                {veiculosFiltrados.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setFiltrosAbertos((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtrosAbertos ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70 hover:text-white/90'}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtros
                  {filtrosAtivos > 0 && (
                    <span className="bg-white text-[#1B2043] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {filtrosAtivos}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtrosAbertos ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
                  <button
                    onClick={() => setModo('tabela')}
                    className={`p-1.5 rounded-md transition-colors ${modo === 'tabela' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                    title="Ver como tabela"
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setModo('cards')}
                    className={`p-1.5 rounded-md transition-colors ${modo === 'cards' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                    title="Ver como cards"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {filtrosAbertos && (
              <div className="px-5 py-4 bg-[#1B2043]/[0.03] border-b border-[#1B2043]/8">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black">Placa</label>
                    <div className="relative">
                      <input
                        value={fPlaca}
                        onChange={(e) => setFPlaca(e.target.value.toUpperCase())}
                        placeholder="Buscar..."
                        className="w-full px-3 py-2 text-sm font-mono uppercase border rounded-md bg-white pr-7"
                      />
                      {fPlaca && (
                        <button onClick={() => setFPlaca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Locadora
                    </label>
                    <div className="relative">
                      <input
                        value={fLocadora}
                        onChange={(e) => setFLocadora(e.target.value)}
                        placeholder="Buscar..."
                        list="locadoras-lista"
                        className="w-full px-3 py-2 text-sm border rounded-md bg-white pr-7"
                      />
                      <datalist id="locadoras-lista">
                        {locadorasDisponiveis.map((l) => (
                          <option key={l} value={l} />
                        ))}
                      </datalist>
                      {fLocadora && (
                        <button onClick={() => setFLocadora('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-black flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Unidade
                    </label>
                    <select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} className="w-full px-2 py-2 text-sm border rounded-md bg-white">
                      <option value="">Todas</option>
                      {unidadesDisponiveis.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1 lg:col-span-2">
                    <label className="text-xs font-medium text-black">Dias no status</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={fDiasMin}
                        onChange={(e) => setFDiasMin(e.target.value)}
                        placeholder="De"
                        className="w-full px-2 py-2 text-sm border rounded-md bg-white"
                      />
                      <span className="text-xs text-black/40 shrink-0">até</span>
                      <input
                        type="number"
                        min="0"
                        value={fDiasMax}
                        onChange={(e) => setFDiasMax(e.target.value)}
                        placeholder="Até"
                        className="w-full px-2 py-2 text-sm border rounded-md bg-white"
                      />
                    </div>
                  </div>
                </div>
                {filtrosAtivos > 0 && (
                  <button
                    onClick={() => { setFPlaca(''); setFLocadora(''); setFUnidade(''); setFDiasMin(''); setFDiasMax('') }}
                    className="mt-3 flex items-center gap-1 text-xs text-black/60 hover:text-black transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Limpar filtros
                  </button>
                )}
              </div>
            )}

            <div className={modo === 'tabela' ? '' : 'p-4'}>
              {modo === 'tabela' ? (
                <div className="divide-y divide-[#1B2043]/6">
                  <div className="hidden md:grid grid-cols-[7rem_10rem_1fr_8rem_5rem] px-5 py-2.5 bg-[#1B2043]/[0.04] text-[11px] font-semibold text-[#1B2043]/60 uppercase tracking-wide gap-3">
                    <span>Placa</span>
                    <span>Chassi</span>
                    <span>Locadora</span>
                    <span>Modelo</span>
                    <span className="text-right">Dias</span>
                  </div>
                  {veiculosFiltrados.map((v, i) => {
                    const dias = diasNoStatus(v.status_veiculo_date)
                    const cor = dias != null ? corDias(dias) : null
                    return (
                      <div
                        key={v.placa}
                        className="relative grid grid-cols-[1fr_4.5rem] md:grid-cols-[7rem_10rem_1fr_8rem_5rem] items-center px-5 py-3.5 gap-3 hover:bg-[#1B2043]/[0.03] transition-colors"
                        style={{ animation: `cardEnter 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 25, 350)}ms both` }}
                      >
                        <span className="font-mono text-sm font-semibold text-black w-fit sm:justify-self-start bg-[#1B2043]/6 px-2 py-1 rounded-md">{v.placa}</span>
                        <p className="hidden md:block text-xs text-black font-mono">{v.chassi ?? '-'}</p>
                        <p className="hidden md:block text-xs text-black truncate">{locadoraMap[v.locadora] ?? '-'}</p>
                        <p className="hidden md:block text-sm text-black truncate">{v.modelo}</p>
                        <div className="flex justify-end">
                          {dias != null && cor ? (
                            <span
                              className={`text-xs font-semibold tabular-nums px-2.5 py-1 rounded-full border ${cor.badge}`}
                              style={{ boxShadow: `0 0 10px ${cor.glow}` }}
                            >
                              {dias}d
                            </span>
                          ) : (
                            <span className="text-sm text-black">-</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {veiculosFiltrados.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#1B2043]/8 flex items-center justify-center">
                        <Bike className="w-6 h-6 text-[#1B2043]/40" />
                      </div>
                      <p className="text-sm text-black">Nenhuma moto encontrada.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {veiculosFiltrados.map((v, i) => {
                    const dias = diasNoStatus(v.status_veiculo_date)
                    const cor = dias != null ? corDias(dias) : null
                    // Borda em degradê via background-clip (dois fundos: um sólido por trás do
                    // conteúdo, outro em degradê só na borda) — não depende de altura em %
                    // dentro da grade, então não falha conforme o tamanho do conteúdo do card
                    const gradienteBorda = cor
                      ? `linear-gradient(135deg, ${cor.forte}, rgba(27,32,67,0.12) 55%, transparent 85%)`
                      : 'linear-gradient(135deg, rgba(27,32,67,0.18), transparent 70%)'
                    return (
                      <div
                        key={v.placa}
                        className="group relative rounded-2xl p-4 border border-transparent transition-shadow duration-200 hover:shadow-[0_10px_30px_rgba(27,32,67,0.12)]"
                        style={{
                          backgroundImage: `linear-gradient(white, white), ${gradienteBorda}`,
                          backgroundOrigin: 'border-box',
                          backgroundClip: 'padding-box, border-box',
                          animation: `cardEnter 0.45s cubic-bezier(0.16,1,0.3,1) ${Math.min(i * 30, 400)}ms both`,
                        }}
                      >
                        {/* Selo de dias no canto — grande, com brilho */}
                        {dias != null && cor && (
                          <div
                            className={`absolute -top-2 -right-2 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 bg-white ${cor.badge}`}
                            style={{ boxShadow: `0 0 16px ${cor.glow}` }}
                          >
                            <span className="text-base font-extrabold leading-none tabular-nums">{dias}</span>
                            <span className="text-[9px] font-semibold uppercase tracking-wide leading-none mt-0.5">dias</span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 pr-10">
                          <div className="w-11 h-11 rounded-xl bg-[#1B2043]/8 flex items-center justify-center shrink-0">
                            <Bike className="w-5 h-5 text-[#1B2043]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-black tracking-wide">{v.placa}</p>
                            <p className="text-sm font-semibold text-[#1B2043] truncate">{v.modelo}</p>
                          </div>
                        </div>

                        <div className="mt-3.5 pt-3.5 border-t border-[#1B2043]/8 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-black">
                            <Fingerprint className="w-3.5 h-3.5 text-[#1B2043]/40 shrink-0" />
                            <span className="font-mono truncate">{v.chassi ?? '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-black">
                            <Building2 className="w-3.5 h-3.5 text-[#1B2043]/40 shrink-0" />
                            <span className="truncate">{locadoraMap[v.locadora] ?? '-'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {veiculosFiltrados.length === 0 && (
                    <div className="col-span-full flex flex-col items-center gap-2 px-4 py-14 text-center">
                      <div className="w-12 h-12 rounded-full bg-[#1B2043]/8 flex items-center justify-center">
                        <Bike className="w-6 h-6 text-[#1B2043]/40" />
                      </div>
                      <p className="text-sm text-black">Nenhuma moto encontrada.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>

      <style jsx>{`
        @keyframes cardEnter {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
