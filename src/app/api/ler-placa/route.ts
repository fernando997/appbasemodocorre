import { NextRequest, NextResponse } from 'next/server'
import { OPENAI_KEY, FIPE_KEY, FIPE_URL } from '@/lib/config'

// Padrão Mercosul: LLL NLNN (posições 0-2 letras, 3 número, 4 letra, 5-6 números).
// Corrige caracteres trocados pela IA conforme a posição exigida.
const DIGITO_PARA_LETRA: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B' }
const LETRA_PARA_DIGITO: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', E: '3', A: '4', S: '5', G: '6', T: '7', B: '8' }

function corrigirPlacaMercosul(placa: string): string {
  if (placa.length !== 7) return placa
  const deveSerLetra = [true, true, true, false, true, false, false]
  return placa.split('').map((ch, i) => {
    if (deveSerLetra[i] && /[0-9]/.test(ch)) return DIGITO_PARA_LETRA[ch] ?? ch
    if (!deveSerLetra[i] && /[A-Z]/.test(ch)) return LETRA_PARA_DIGITO[ch] ?? ch
    return ch
  }).join('')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // chamada direta com placa já conhecida — pula a IA
    if (body.placa) {
      const placa = (body.placa as string).toUpperCase().replace(/[^A-Z0-9]/g, '')
      const fipeRes = await fetch(`${FIPE_URL}/${placa}?key=${FIPE_KEY}`)
      const dadosMoto = await fipeRes.json()
      return NextResponse.json({ placa, dadosMoto })
    }

    const { image } = body

    // 1. GPT-4o-mini lê a placa na imagem
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${image}` },
            },
            {
              type: 'text',
              text: `Esta é uma foto de uma placa de MOTO brasileira no padrão Mercosul.

O formato é OBRIGATORIAMENTE: LLL NLNN (7 caracteres)
- Posição 1: LETRA (A-Z)
- Posição 2: LETRA (A-Z)
- Posição 3: LETRA (A-Z)
- Posição 4: NÚMERO (0-9)
- Posição 5: LETRA (A-Z)
- Posição 6: NÚMERO (0-9)
- Posição 7: NÚMERO (0-9)
Exemplo: ABC1D23. Em placas de moto os caracteres ficam em DUAS linhas: as 3 letras em cima e os 4 caracteres restantes (número, letra, número, número) embaixo.

A placa SEMPRE tem exatamente 7 caracteres — nunca 6, nunca 8. É comum haver letras ou números iguais ou parecidos em posições vizinhas (ex: "OO9", "00", "AA", "22") — cada posição é um caractere separado e independente, mesmo que pareçam se repetir ou se fundir visualmente. NUNCA junte dois caracteres vizinhos parecidos em um só nem pule um caractere porque "parece igual ao anterior" — conte as 7 posições visíveis na placa antes de responder.

Antes de responder, analise CADA um dos 7 caracteres individualmente, um de cada vez, descrevendo o traço/formato exato que você enxerga (retas, curvas, laços fechados, ganchos) e só then decida qual caractere é — não pule direto pro palpite mais comum. Preste atenção especial em pares fáceis de confundir (aparecem juntos porque têm traços parecidos, mas o formato exige um tipo específico em cada posição):
- 0/O/Q/D — nas posições de letra é O/Q/D, nas de número é 0
- 1/I/L — nas posições de letra é I ou L, nas de número é 1
- 8/B — posição de letra é B, posição de número é 8
- 5/S — posição de letra é S, posição de número é 5
- 2/Z — posição de letra é Z, posição de número é 2
- 6/G — posição de letra é G, posição de número é 6
- 7/T — posição de letra é T, posição de número é 7
- I/J (duas letras) — J tem gancho/curva embaixo, I é reto
- C/G (duas letras) — G tem barra horizontal no meio, C não
- U/V (duas letras) — U tem fundo arredondado, V é anguloso
- 2/9 (dois números) — 9 tem laço fechado em cima com perna reta descendo, 2 tem curva em cima e base plana, sem laço fechado
- 3/8 (dois números) — 8 tem dois laços fechados, 3 é aberto à esquerda
- 6/9 (dois números) — mesma forma invertida: 6 tem o laço embaixo, 9 tem o laço em cima

Antes de escrever a linha PLACA, confira cada uma das 7 posições contra o padrão obrigatório LLLNLNN (posições 1,2,3,5 = LETRA / posições 4,6,7 = NÚMERO). Se algum caractere que você identificou não bater com o tipo exigido pela posição (ex: colocou uma letra numa posição de número), troque pelo caractere equivalente do tipo certo antes de responder — nunca entregue um caractere do tipo errado pra posição.

Responda EXATAMENTE neste formato, uma linha para cada uma das três partes:
ANALISE: (uma frase curta por caractere, ex: "pos1=U reta e curva no fundo, pos2=G tem barra no meio, ...") — precisa ter exatamente 7 descrições, uma por posição, mesmo que dois caracteres vizinhos pareçam iguais
TOTAL: (quantidade de caracteres que você identificou — tem que ser 7; se contou diferente de 7, revise antes de responder)
PLACA: (os 7 caracteres finais no formato LLLNLNN, sem espaços/traços/pontuação, já conferidos contra o padrão)`,
            },
          ],
        }],
        max_tokens: 400,
        temperature: 0,
      }),
    })

    const aiData = await aiRes.json()

    if (!aiRes.ok) {
      return NextResponse.json({ erro: `OpenAI: ${aiData.error?.message ?? aiRes.status}` }, { status: 500 })
    }

    const respostaBruta: string = aiData.choices?.[0]?.message?.content?.trim() ?? ''
    const linhaPlaca = respostaBruta.split('\n').find(l => /PLACA\s*:/i.test(l)) ?? respostaBruta
    const placaBruta = linhaPlaca.split(/PLACA\s*:/i).pop()?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') ?? ''
    const placa = corrigirPlacaMercosul(placaBruta)

    if (!placa) {
      return NextResponse.json({ placa: '', dadosMoto: null })
    }

    // 2. FIPE API — consulta por placa
    const fipeRes = await fetch(`${FIPE_URL}/${placa}?key=${FIPE_KEY}`)
    const dadosMoto = await fipeRes.json()

    return NextResponse.json({ placa, dadosMoto })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
