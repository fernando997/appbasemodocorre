import { NextRequest, NextResponse } from 'next/server'
import { OPENAI_KEY } from '@/lib/config'

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json()

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
              text: `Esta é uma foto do painel de uma moto, mostrando o hodômetro (KM rodado).

Encontre o valor do hodômetro (KM total, não o do tripômetro parcial "trip A/B" se houver os dois). Ignore velocímetro, rotação e outros mostradores.

Responda EXATAMENTE neste formato:
KM: (somente os dígitos do hodômetro, sem pontos, vírgulas ou unidade; se não conseguir ler com certeza, responda KM: )`,
            },
          ],
        }],
        max_tokens: 100,
        temperature: 0,
      }),
    })

    const aiData = await aiRes.json()

    if (!aiRes.ok) {
      return NextResponse.json({ erro: `OpenAI: ${aiData.error?.message ?? aiRes.status}` }, { status: 500 })
    }

    const respostaBruta: string = aiData.choices?.[0]?.message?.content?.trim() ?? ''
    const linhaKm = respostaBruta.split('\n').find((l: string) => /KM\s*:/i.test(l)) ?? respostaBruta
    const km = linhaKm.split(/KM\s*:/i).pop()?.trim().replace(/[^0-9]/g, '') ?? ''

    return NextResponse.json({ km })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
