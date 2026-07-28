'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { BUBBLE_BASE, BUBBLE_KEY } from '@/lib/config'

type Unidade = {
  _id: string
  'Nome Unidade': string
}

const TIPOS = ['ADMIN', 'USUARIO']

export default function CadastroPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [celular, setCelular] = useState('')
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('')
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const isAdmin = tipo === 'ADMIN'

  useEffect(() => {
    try {
      const raw: Unidade[] = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]')
      setUnidades(raw)
    } catch {}
  }, [])

  function toggleUnidade(id: string) {
    setUnidadesSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    )
  }

  function resetForm() {
    setNome('')
    setTipo('')
    setCelular('')
    setUnidadeSelecionada('')
    setUnidadesSelecionadas([])
  }

  const unidadesValidas = isAdmin ? unidadesSelecionadas.length > 0 : !!unidadeSelecionada

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome || !tipo || !celular || !unidadesValidas) return

    setCarregando(true)
    setErro(null)
    setSucesso(false)

    try {
      const form = new FormData()
      form.append('apikey', BUBBLE_KEY)
      form.append('nome', nome.toUpperCase())
      form.append('tipo', tipo.toUpperCase())
      form.append('celular', Number(celular).toString())
      form.append('unidade', JSON.stringify(isAdmin ? unidadesSelecionadas : [unidadeSelecionada]))

      const res = await fetch(`${BUBBLE_BASE}/cadastrar-user-base`, {
        method: 'POST',
        body: form,
      })

      const data = await res.json()

      if (!res.ok) throw new Error()
      if (data.status !== 'success') throw new Error(data.message ?? 'Erro ao cadastrar')

      setSucesso(true)
      resetForm()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar usuário. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Cadastro de Usuário"
        description="Adicionar novo usuário ao sistema"
        icon={<UserPlus className="w-5 h-5 text-white" />}
      />

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl shadow-sm p-6 space-y-5">

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nome">Nome</label>
            <input
              id="nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              disabled={carregando}
              className="w-full px-3 py-2.5 text-sm border rounded-md bg-white uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value)
                setUnidadeSelecionada('')
                setUnidadesSelecionadas([])
              }}
              disabled={carregando}
              className="w-full px-3 py-2.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50"
            >
              <option value="">Selecione o tipo</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="celular">Celular</label>
            <input
              id="celular"
              type="tel"
              inputMode="numeric"
              value={celular}
              onChange={(e) => setCelular(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="15999999999"
              disabled={carregando}
              className="w-full px-3 py-2.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50"
            />
            <p className="text-xs text-zinc-400">DDD + número (ex: 15999999999)</p>
          </div>

          {tipo && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Unidade{isAdmin && <span className="text-xs font-normal text-zinc-400 ml-1">(selecione uma ou mais)</span>}
              </label>

              {isAdmin ? (
                <div className="border rounded-md divide-y">
                  {unidades.map((u) => (
                    <label
                      key={u._id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        checked={unidadesSelecionadas.includes(u._id)}
                        onChange={() => toggleUnidade(u._id)}
                        disabled={carregando}
                        className="accent-green-600 w-4 h-4"
                      />
                      <span className="text-sm">{u['Nome Unidade']}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <select
                  value={unidadeSelecionada}
                  onChange={(e) => setUnidadeSelecionada(e.target.value)}
                  disabled={carregando}
                  className="w-full px-3 py-2.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50"
                >
                  <option value="">Selecione a unidade</option>
                  {unidades.map((u) => (
                    <option key={u._id} value={u._id}>{u['Nome Unidade']}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {erro}
            </p>
          )}

          {sucesso && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Usuário cadastrado com sucesso!
            </p>
          )}

          <Button
            type="submit"
            disabled={carregando || !nome || !tipo || !celular || !unidadesValidas}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5"
          >
            {carregando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</>
            ) : (
              'Cadastrar usuário'
            )}
          </Button>
        </form>
      </div>
    </>
  )
}
