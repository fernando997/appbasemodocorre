'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, Loader2, Radio, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { type Entrega } from '@/lib/mock-data'

export type ResultadoTeste = {
  pode_liberar: boolean
  nome_cliente: string
  foto_cliente: string
  placa: string
  cpf: string
  numero_contrato: string
  motivo?: string
}

export async function executarTeste(placa: string): Promise<ResultadoTeste> {
  await new Promise((r) => setTimeout(r, 1000))
  return {
    pode_liberar: true,
    nome_cliente: 'João Silva',
    foto_cliente: '',
    placa,
    cpf: '123.456.789-00',
    numero_contrato: 'CTR-00123',
  }
}

export function DialogTeste({ entrega, onFechar }: { entrega: Entrega; onFechar: () => void }) {
  const [placa, setPlaca] = useState(entrega.placa)
  const [verificando, setVerificando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function verificar() {
    setVerificando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await executarTeste(placa)
      setResultado(res)
    } catch {
      setErro('Não foi possível verificar. Tente novamente.')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Teste de Liberação</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <label className="text-sm font-medium">Placa</label>
          <input
            type="text"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && verificar()}
            maxLength={8}
            className="w-full mt-1 px-3 py-2 text-sm font-mono uppercase border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-green-600/30"
          />
        </div>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        {resultado && (
          <div className="border rounded-lg p-3 space-y-3 bg-zinc-50">
            <div className="flex items-center gap-3">
              {resultado.foto_cliente ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resultado.foto_cliente}
                  alt={resultado.nome_cliente}
                  className="w-14 h-14 rounded-full object-cover border-2 border-white shadow shrink-0"
                />
              ) : (
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${resultado.pode_liberar ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {resultado.nome_cliente.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{resultado.nome_cliente}</p>
                <p className="text-xs font-mono text-muted-foreground">{resultado.placa}</p>
                <p className="text-xs text-muted-foreground">CPF: {resultado.cpf}</p>
                <p className="text-xs text-muted-foreground">Contrato: {resultado.numero_contrato}</p>
              </div>
              <div className="shrink-0">
                {resultado.pode_liberar ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )}
              </div>
            </div>
            <Badge
              className={
                resultado.pode_liberar
                  ? 'w-full justify-center bg-green-500/10 text-green-700 border-green-200'
                  : 'w-full justify-center bg-red-500/10 text-red-600 border-red-200'
              }
            >
              {resultado.pode_liberar ? 'Liberado' : 'Não liberado'}
            </Badge>
            {resultado.motivo && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                {resultado.motivo}
              </p>
            )}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>Fechar</Button>
        <Button onClick={verificar} disabled={verificando || !placa}>
          {verificando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando...</>
          ) : 'Verificar'}
        </Button>
      </DialogFooter>
    </>
  )
}

type StatusSinal = { respondeu: boolean; horas_sem_comunicacao?: number }
type ResultadoSinal = { principal: StatusSinal; backup: StatusSinal }

async function emitirSinal(): Promise<ResultadoSinal> {
  await new Promise((r) => setTimeout(r, 1200))
  return {
    principal: { respondeu: true, horas_sem_comunicacao: 0 },
    backup: { respondeu: false, horas_sem_comunicacao: 14 },
  }
}

export function DialogRastreador({ entrega, onFechar }: { entrega: Entrega; onFechar: () => void }) {
  const [acionando, setAcionando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoSinal | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function acionar() {
    setAcionando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await emitirSinal()
      setResultado(res)
    } catch {
      setErro('Não foi possível acionar o rastreador. Tente novamente.')
    } finally {
      setAcionando(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-600" />
          Sinal do Rastreador
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          Moto <span className="font-mono font-medium text-foreground">{entrega.placa}</span> — {entrega.locatario}
        </p>
        {erro && <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1.5">{erro}</p>}
        {resultado && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-zinc-100 px-3 py-2">
              <p className="text-xs font-medium text-zinc-600">Resposta do rastreador</p>
            </div>
            {(['principal', 'backup'] as const).map((tipo) => {
              const s = resultado[tipo]
              return (
                <div key={tipo} className={`flex items-center justify-between px-3 py-2.5 border-t ${s.respondeu ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className="text-sm font-medium capitalize">{tipo}</span>
                  <div className="flex items-center gap-1.5">
                    {s.respondeu ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-semibold text-green-700">Respondeu</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-semibold text-red-600">
                          Sem sinal há {s.horas_sem_comunicacao}h
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>Fechar</Button>
        <Button onClick={acionar} disabled={acionando}>
          {acionando ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Acionando...</>
          ) : 'Emitir Sinal'}
        </Button>
      </DialogFooter>
    </>
  )
}

export function DialogLiberar({ entrega, onFechar }: { entrega: Entrega; onFechar: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Liberar Moto</DialogTitle>
      </DialogHeader>
      <div className="space-y-2 py-2">
        <p className="text-sm text-muted-foreground">Confirma a liberação da moto para:</p>
        <p className="font-medium">{entrega.locatario}</p>
        <p className="font-mono text-sm">{entrega.placa}</p>
        <div className="pt-2">
          <label className="text-sm font-medium">CPF do cliente</label>
          <input
            type="text"
            placeholder="000.000.000-00"
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-green-600/30"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button className="bg-green-600 hover:bg-green-700">Confirmar Liberação</Button>
      </DialogFooter>
    </>
  )
}

export function EntregaItem({ entrega }: { entrega: Entrega }) {
  const [acao, setAcao] = useState<'teste' | 'liberar' | 'rastreador' | null>(null)
  const [, mes, dia] = entrega.data.split('-')
  const data = `${dia}/${mes}`

  return (
    <>
      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between py-3 px-3 border-b last:border-0 border-l-4 rounded-sm transition-colors hover:bg-zinc-50 ${entrega.tipo === 'confirmada' ? 'border-l-green-500' : 'border-l-zinc-300'}`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {entrega.tipo === 'confirmada' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <Clock className="w-4 h-4 text-zinc-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{entrega.locatario}</p>
            <p className="text-xs text-muted-foreground font-mono">{entrega.placa}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data} às {entrega.horario}</p>
          </div>
        </div>
        {entrega.tipo === 'confirmada' && (
          <div className="flex gap-2 mt-3 sm:mt-0 sm:gap-1 sm:shrink-0">
            <Button variant="outline" className="flex-1 h-10 text-sm sm:flex-none sm:h-7 sm:text-xs" onClick={() => setAcao('teste')}>
              Teste
            </Button>
            <Button variant="outline" className="h-10 px-4 sm:h-7 sm:px-2" title="Emitir sinal no rastreador" onClick={() => setAcao('rastreador')}>
              <Radio className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </Button>
            <Button className="flex-1 h-10 text-sm bg-green-600 hover:bg-green-700 sm:flex-none sm:h-7 sm:text-xs" onClick={() => setAcao('liberar')}>
              Liberar
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!acao} onOpenChange={() => setAcao(null)}>
        <DialogContent>
          {acao === 'teste' && <DialogTeste entrega={entrega} onFechar={() => setAcao(null)} />}
          {acao === 'rastreador' && <DialogRastreador entrega={entrega} onFechar={() => setAcao(null)} />}
          {acao === 'liberar' && <DialogLiberar entrega={entrega} onFechar={() => setAcao(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
