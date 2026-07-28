'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Phone, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BUBBLE_BASE as API_BASE, BUBBLE_KEY as API_KEY } from '@/lib/config'

function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function LoginPage() {
  const router = useRouter()

  const [etapa, setEtapa] = useState<'telefone' | 'codigo'>('telefone')
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoGerado, setCodigoGerado] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleEnviarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (telefone.length < 10) return

    setCarregando(true)
    setErro(null)

    const gerado = gerarCodigo()

    try {
      const payload = { apikey: API_KEY, telefone: Number(telefone), codigo: gerado }

      const res = await fetch(`${API_BASE}/enviar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) throw new Error()

      setCodigoGerado(gerado)
      setEtapa('codigo')
    } catch {
      setErro('Não foi possível enviar o código. Verifique o número e tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleValidarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (codigo.length < 6) return

    if (codigo !== codigoGerado) {
      setErro('Código incorreto. Tente novamente.')
      return
    }

    setCarregando(true)
    setErro(null)

    try {
      const res = await fetch(`${API_BASE}/valida-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: API_KEY, telefone: Number(telefone), codigo }),
      })

      if (!res.ok) throw new Error()

      const data = await res.json()

      if (data.status !== 'success') throw new Error()

      const maxAge = 'max-age=86400'
      document.cookie = `mc_auth=1; path=/; SameSite=Lax; ${maxAge}`
      document.cookie = `mc_unit=${encodeURIComponent(JSON.stringify(data.response?.user?.Unidade ?? []))}; path=/; SameSite=Lax; ${maxAge}`
      document.cookie = `mc_nome=${encodeURIComponent(data.response?.nome ?? '')}; path=/; SameSite=Lax; ${maxAge}`
      document.cookie = `mc_perfil=${encodeURIComponent(data.response?.perfil ?? '')}; path=/; SameSite=Lax; ${maxAge}`

      localStorage.setItem('mc_user', JSON.stringify(data.response?.user ?? {}))
      localStorage.setItem('mc_unidades', JSON.stringify(data.response?.unidade ?? []))
      localStorage.removeItem('mc_veiculos')

      router.push('/home')
    } catch {
      setErro('Código inválido ou expirado. Tente novamente.')
      setCarregando(false)
    }
  }

  function voltarParaTelefone() {
    setEtapa('telefone')
    setCodigo('')
    setCodigoGerado('')
    setErro(null)
  }

  function formatarTelefone(valor: string): string {
    if (valor.length === 0) return ''
    if (valor.length <= 2) return `(${valor}`
    if (valor.length <= 7) return `(${valor.slice(0, 2)}) ${valor.slice(2)}`
    return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7, 11)}`
  }

  const inputClass = 'w-full pl-10 pr-4 py-3 text-sm border border-white/20 rounded-xl bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/50 focus:border-[#6C63FF]/60 disabled:opacity-50 transition-all'

  return (
    <div className="min-h-screen flex bg-gradient-to-r from-[#080C1F] via-[#1B2043] to-[#2E4080]">

      {/* Painel esquerdo — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-between py-12 px-10">
        <div />

        <div className="flex flex-col items-center gap-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/logo" alt="Modo Corre" className="h-60 w-auto object-contain" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white leading-snug">
              Controle da base<br />e gestão de veículos.
            </h1>
            <p className="text-[#8E92B3] text-sm leading-relaxed max-w-xs">
              Monitore sua frota, registre recebimentos e acompanhe a movimentação em tempo real.
            </p>
          </div>
        </div>

        <p className="text-[#4A5078] text-xs">© 2024 Modo Corre. Todos os direitos reservados.</p>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">

        {/* Logo mobile */}
        <div className="flex flex-col items-center mb-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/logo" alt="Modo Corre" className="h-48 w-auto object-contain" />
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-8 space-y-6">

            {etapa === 'telefone' && (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Entrar</h2>
                  <p className="text-sm text-white/60 mt-1.5">
                    Digite seu número de celular para receber o código
                  </p>
                </div>

                <form onSubmit={handleEnviarCodigo} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white/80" htmlFor="telefone">Celular</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        id="telefone"
                        type="tel"
                        inputMode="numeric"
                        value={formatarTelefone(telefone)}
                        onChange={(e) => setTelefone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="(15) 99999-9999"
                        disabled={carregando}
                        className={inputClass}
                      />
                    </div>
                    <p className="text-xs text-white/40">Digite DDD + número</p>
                  </div>

                  {erro && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      {erro}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={carregando || telefone.length < 10}
                    className="w-full"
                  >
                    {carregando
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                      : 'Enviar código'}
                  </Button>
                </form>
              </>
            )}

            {etapa === 'codigo' && (
              <>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Código enviado</h2>
                  <p className="text-sm text-white/60 mt-1.5">
                    Digite o código recebido no número{' '}
                    <span className="font-semibold text-white">{formatarTelefone(telefone)}</span>
                  </p>
                </div>

                <form onSubmit={handleValidarCodigo} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-white/80" htmlFor="codigo">Código de verificação</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        id="codigo"
                        type="text"
                        inputMode="numeric"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        disabled={carregando}
                        className={`${inputClass} tracking-[0.3em] font-mono text-center`}
                      />
                    </div>
                  </div>

                  {erro && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      {erro}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={carregando || codigo.length < 6}
                    className="w-full"
                  >
                    {carregando
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Verificando...</>
                      : 'Confirmar'}
                  </Button>

                  <button
                    type="button"
                    onClick={voltarParaTelefone}
                    disabled={carregando}
                    className="w-full text-sm text-white/50 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Usar outro número
                  </button>
                </form>
              </>
            )}

          </div>

          <p className="text-xs text-white/30 text-center mt-6">
            Problemas para acessar? Fale com o administrador.
          </p>
        </div>
      </div>
    </div>
  )
}
