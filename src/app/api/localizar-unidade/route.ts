import { NextRequest, NextResponse } from 'next/server'

const RAIO_METROS = 1000

type UnidadeInput = { id: string; nome: string; link: string }
type UnidadeResolvida = { id: string; nome: string; distanciaMetros: number }

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Domínios aceitos pro link — `unidades[].link` vem no body da requisição (o cliente
// só repassa o que pegou do Bubble, mas nada garante isso no servidor), então sem essa
// checagem o servidor faria fetch de qualquer URL que um cliente autenticado mandasse (SSRF)
const HOSTS_PERMITIDOS = ['maps.app.goo.gl', 'google.com', 'www.google.com', 'maps.google.com']

// Segue o redirect do link curto do Google Maps e extrai lat/lng da URL final.
// Prioriza !3d..!4d.. (coordenada exata do local) sobre @lat,lng (centro do mapa, menos preciso)
async function resolverCoordenadas(link: string): Promise<{ lat: number; lng: number } | null> {
  try {
    let hostname: string
    try {
      hostname = new URL(link).hostname
    } catch {
      return null
    }
    if (!HOSTS_PERMITIDOS.includes(hostname)) return null

    const res = await fetch(link, { redirect: 'follow' })
    const finalUrl = res.url
    const dataMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    if (dataMatch) return { lat: Number(dataMatch[1]), lng: Number(dataMatch[2]) }
    const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) }
    const qMatch = finalUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (qMatch) return { lat: Number(qMatch[1]), lng: Number(qMatch[2]) }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, unidades } = await req.json()
    if (lat == null || lng == null) {
      return NextResponse.json({ erro: 'lat e lng são obrigatórios' }, { status: 400 })
    }
    if (!Array.isArray(unidades) || unidades.length === 0) {
      return NextResponse.json({ erro: 'Nenhuma unidade recebida para comparação.' }, { status: 400 })
    }

    // Devolve TODAS as unidades dentro do raio, da mais perto pra mais longe —
    // duas unidades podem estar no mesmo endereço, e aí quem escolhe é o operador
    const dentroDoRaio: UnidadeResolvida[] = []

    for (const u of unidades as UnidadeInput[]) {
      if (!u.link) continue
      const coords = await resolverCoordenadas(u.link)
      if (!coords) continue
      const dist = distanciaMetros(Number(lat), Number(lng), coords.lat, coords.lng)
      if (dist <= RAIO_METROS) {
        dentroDoRaio.push({ id: u.id, nome: u.nome, distanciaMetros: dist })
      }
    }

    if (dentroDoRaio.length === 0) {
      return NextResponse.json(
        { erro: 'Nenhuma unidade encontrada num raio de 1km da sua localização atual.' },
        { status: 404 }
      )
    }

    dentroDoRaio.sort((a, b) => a.distanciaMetros - b.distanciaMetros)

    return NextResponse.json({ unidades: dentroDoRaio })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
