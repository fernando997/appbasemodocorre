'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bike } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
  status_veiculo_desc: string
  [key: string]: unknown
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

export default function FrotaStatusPage() {
  const { status } = useParams<{ status: string }>()
  const statusNome = decodeURIComponent(status)
  const router = useRouter()
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [locadoraMap, setLocadoraMap] = useState<Record<string, string>>({})

  useEffect(() => {
    try {
      const todos: Veiculo[] = JSON.parse(localStorage.getItem('mc_veiculos') ?? '[]')
      const filtrados = todos.filter((v) => v.status_veiculo_desc === statusNome)
      setVeiculos(filtrados)

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

  const porModelo = contarPor(veiculos, 'modelo')

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

      <div className="p-4 sm:p-6 space-y-6 max-w-screen-lg mx-auto">

        {/* Estatísticas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{veiculos.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Modelos diferentes</p>
              <p className="text-2xl font-bold">{porModelo.length}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Modelo mais comum</p>
              <p className="text-lg font-bold truncate">{porModelo[0]?.[0] ?? '-'}</p>
              <p className="text-xs text-muted-foreground">{porModelo[0]?.[1] ?? 0} unidades</p>
            </CardContent>
          </Card>
        </div>


        {/* Lista de motos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Motos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="grid grid-cols-[7rem_1fr] sm:grid-cols-[7rem_10rem_1fr_8rem] px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide gap-3">
                <span>Placa</span>
                <span>Chassi</span>
                <span className="hidden sm:block">Locadora</span>
                <span className="hidden sm:block">Modelo</span>
              </div>
              {veiculos.map((v) => (
                <div key={v.placa} className="grid grid-cols-[7rem_1fr] sm:grid-cols-[7rem_10rem_1fr_8rem] items-center px-4 py-3 gap-3">
                  <Badge variant="outline" className="font-mono justify-center">{v.placa}</Badge>
                  <p className="text-xs text-muted-foreground font-mono">{v.chassi ?? '-'}</p>
                  <p className="hidden sm:block text-xs text-muted-foreground">{locadoraMap[v.locadora] ?? '-'}</p>
                  <p className="hidden sm:block text-sm text-muted-foreground truncate">{v.modelo}</p>
                </div>
              ))}
              {veiculos.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma moto encontrada.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
