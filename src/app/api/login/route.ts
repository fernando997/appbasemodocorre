import { NextRequest, NextResponse } from 'next/server'
import { BUBBLE_BASE, BUBBLE_KEY, BUBBLE_PRIVATE_KEY } from '@/lib/config'
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarToken } from '@/lib/sessao'

// Login: valida o código no Bubble (valida-codigo) e, se o Bubble devolver o
// user, grava o cookie de sessão assinado (HttpOnly). Devolve a mesma resposta
// do Bubble para a tela de login continuar montando mc_user / mc_unidades.
export async function POST(req: NextRequest) {
  try {
    const { telefone, codigo } = await req.json()
    if (!telefone || !codigo) {
      return NextResponse.json({ erro: 'telefone e código obrigatórios' }, { status: 400 })
    }

    const res = await fetch(`${BUBBLE_BASE}/valida-codigo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BUBBLE_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: BUBBLE_KEY, telefone: Number(telefone), codigo: Number(codigo) }),
    })
    const data = await res.json().catch(() => null)

    // Código errado/expirado: o Bubble responde success, mas sem o user
    const user = data?.response?.user
    if (!res.ok || data?.status !== 'success' || !user?._id) {
      return NextResponse.json({ erro: 'Código inválido ou expirado' }, { status: 401 })
    }

    const token = await criarToken({ uid: String(user._id), tipo: String(user.Tipo ?? '') })
    const resposta = NextResponse.json(data)
    resposta.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DURACAO_SESSAO_S,
    })
    return resposta
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
