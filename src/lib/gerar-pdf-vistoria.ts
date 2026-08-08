import jsPDF from 'jspdf'

interface DadosVistoriaPDF {
  placa: string
  km: string
  contrato?: string
  cliente?: string
  vistoriadorNome?: string
  vistoriadorCpf?: string
  vistoriadorWhatsapp?: string
  fotos: { label: string; dataUrl: string | null }[]
  perguntas: { label: string; resposta: boolean | null }[]
  violacaoRastreamento: boolean | null
  observacao?: string
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

let logoCache: { dataUrl: string; ratio: number } | null = null

async function carregarLogoComprimida(): Promise<{ dataUrl: string; ratio: number }> {
  if (logoCache) return logoCache
  const img = await loadImage('/LOGO-PDF.png')
  // Reduz a logo (o arquivo original é 8000px) e achata a transparência
  // sobre fundo branco, senão o jsPDF embute o PNG sem compressão (~137MB)
  const maxW = 600
  const scale = Math.min(1, maxW / img.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  logoCache = { dataUrl: canvas.toDataURL('image/jpeg', 0.85), ratio: img.width / img.height }
  return logoCache
}

async function drawLogo(doc: jsPDF, centerX: number, y: number): Promise<number> {
  try {
    const logo = await carregarLogoComprimida()
    const logoH = 26
    const logoW = logo.ratio * logoH
    doc.addImage(logo.dataUrl, 'JPEG', centerX - logoW / 2, y, logoW, logoH)
    return y + logoH + 10
  } catch {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(27, 32, 67)
    doc.text('MODO CORRE', centerX, y + 15, { align: 'center' })
    doc.setTextColor(0, 0, 0)
    return y + 24
  }
}

async function compressImage(dataUrl: string, maxDim = 900, quality = 0.5): Promise<string> {
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.warn('[compressImage] sem contexto 2d, mantendo original', { tamanhoOriginalKB: Math.round(dataUrl.length / 1024) })
      return dataUrl
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const resultado = canvas.toDataURL('image/jpeg', quality)
    console.log('[compressImage]', {
      dimensoesOriginais: `${img.width}x${img.height}`,
      dimensoesFinais: `${canvas.width}x${canvas.height}`,
      tamanhoOriginalKB: Math.round(dataUrl.length / 1024),
      tamanhoFinalKB: Math.round(resultado.length / 1024),
    })
    return resultado
  } catch (err) {
    console.error('[compressImage] falhou, mantendo original', err, { tamanhoOriginalKB: Math.round(dataUrl.length / 1024) })
    return dataUrl
  }
}

async function comprimirFotos<T extends { dataUrl: string | null }>(fotos: T[]): Promise<T[]> {
  return Promise.all(fotos.map(async f => f.dataUrl ? { ...f, dataUrl: await compressImage(f.dataUrl) } : f))
}

async function obterEndereco(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return (data.display_name as string) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}

function drawField(doc: jsPDF, label: string, value: unknown, x: number, y: number, w: number, url?: string) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(String(label), x, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const txt = value ? String(value) : '-'
  const lines = doc.splitTextToSize(txt, w - 6)
  const lineH = 5
  const boxY = y + 3
  const boxH = Math.max(10, lines.length * lineH + 4)

  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.rect(x, boxY, w, boxH)

  if (url) {
    doc.setTextColor(37, 99, 235)
    doc.textWithLink(lines, x + 3, boxY + 7, { url })
  } else {
    doc.text(lines, x + 3, boxY + 7)
  }
  doc.setTextColor(0, 0, 0)

  return boxY + boxH + 6
}

function drawPhotoWithBorder(doc: jsPDF, title: string, dataUrl: string, x: number, y: number, maxW: number, maxH: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text(title, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })

  const boxY = y + 4
  const boxX = x
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.rect(boxX, boxY, maxW, maxH)

  try {
    const availW = maxW - 8
    const availH = maxH - 8
    const props = doc.getImageProperties(dataUrl)
    const scale = Math.min(availW / props.width, availH / props.height)
    const imgW = props.width * scale
    const imgH = props.height * scale
    const imgX = boxX + 4 + (availW - imgW) / 2
    const imgY = boxY + 4 + (availH - imgH) / 2

    doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH)
  } catch {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.text('Foto não disponível', boxX + maxW / 2, boxY + maxH / 2, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  return boxY + maxH + 8
}

function addPageNumber(doc: jsPDF, page: number, total: number) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(`Page ${page} of ${total}.`, pw - 15, ph - 8, { align: 'right' })
}

export async function gerarPdfVistoria(dados: DadosVistoriaPDF): Promise<Blob> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pw = doc.internal.pageSize.getWidth() // 210
  const ph = doc.internal.pageSize.getHeight() // 297
  const margin = 20
  const contentW = pw - margin * 2
  const halfW = (contentW - 6) / 2

  const now = new Date()
  const dataHora = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const fotosComprimidas = await comprimirFotos(dados.fotos)

  // ═══ PÁGINA 1: Cabeçalho + primeira foto ═══
  let y = 20
  y = await drawLogo(doc, pw / 2, y)

  // Título
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(0, 0, 0)
  doc.text('Relatório de Vistoria', pw / 2, y, { align: 'center' })
  y += 14

  // Campos em 2 colunas
  const leftX = margin
  const rightX = margin + halfW + 6

  // Linha 1: Contrato + Cliente
  const yBeforeContrato = y
  y = drawField(doc, 'Número do Contrato:', dados.contrato || '-', leftX, y, halfW)
  drawField(doc, 'Cliente:', dados.cliente || '-', rightX, yBeforeContrato, halfW)

  // Linha 2: Data e Hora (full width)
  y = drawField(doc, 'Data e Hora:', dataHora, leftX, y, contentW)

  // Linha 3: Placa + KM
  const yBeforePlaca = y
  y = drawField(doc, 'Placa:', dados.placa, leftX, y, halfW)
  drawField(doc, 'KM Atual:', `${dados.km} km`, rightX, yBeforePlaca, halfW)

  // Linha 4: Vistoriador Nome + CPF
  const yBeforeVist = y
  y = drawField(doc, 'Nome do Vistoriador:', dados.vistoriadorNome || '-', leftX, y, halfW)
  drawField(doc, 'CPF do Vistoriador:', dados.vistoriadorCpf || '-', rightX, yBeforeVist, halfW)

  // Linha 5: WhatsApp do Vistoriador (full width)
  y = drawField(doc, 'WhatsApp do Vistoriador:', dados.vistoriadorWhatsapp || '-', leftX, y, contentW)

  // Primeira foto na página 1
  const foto1 = fotosComprimidas[0]
  if (foto1?.dataUrl) {
    y += 4
    const fotoH = Math.min(120, ph - y - 20)
    y = drawPhotoWithBorder(doc, foto1.label.toUpperCase(), foto1.dataUrl, margin, y, contentW, fotoH)
  }

  // ═══ PÁGINAS SEGUINTES: 2 fotos por página ═══
  const remainingFotos = fotosComprimidas.slice(1).filter(f => f.dataUrl)
  let fotoIndex = 0

  while (fotoIndex < remainingFotos.length) {
    doc.addPage()
    let pageY = 15

    // Foto 1 da página
    const fotoA = remainingFotos[fotoIndex]
    if (fotoA?.dataUrl) {
      const fotoH = 120
      pageY = drawPhotoWithBorder(doc, fotoA.label.toUpperCase(), fotoA.dataUrl, margin, pageY, contentW, fotoH)
    }
    fotoIndex++

    // Foto 2 da página
    if (fotoIndex < remainingFotos.length) {
      pageY += 4
      const fotoB = remainingFotos[fotoIndex]
      if (fotoB?.dataUrl) {
        const fotoH = 120
        pageY = drawPhotoWithBorder(doc, fotoB.label.toUpperCase(), fotoB.dataUrl, margin, pageY, contentW, fotoH)
      }
      fotoIndex++
    }
  }

  // ═══ PÁGINA DE PERGUNTAS / RESPOSTAS ═══
  doc.addPage()
  let qy = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(27, 32, 67)
  doc.text('Respostas da Vistoria', pw / 2, qy, { align: 'center' })
  qy += 12

  // Tabela de perguntas
  const colLabelW = contentW - 30
  const colRespW = 30

  // Cabeçalho da tabela
  doc.setFillColor(27, 32, 67)
  doc.rect(margin, qy, contentW, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('Pergunta', margin + 3, qy + 6)
  doc.text('Resposta', margin + colLabelW + 3, qy + 6)
  qy += 9

  doc.setFontSize(9)
  dados.perguntas.forEach((p, i) => {
    if (p.resposta === null) return

    const isEven = i % 2 === 0
    if (isEven) {
      doc.setFillColor(245, 245, 245)
      doc.rect(margin, qy, contentW, 8, 'F')
    }

    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.2)
    doc.line(margin, qy + 8, margin + contentW, qy + 8)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    doc.text(p.label, margin + 3, qy + 5.5)

    const resp = p.resposta ? 'SIM' : 'NÃO'
    if (p.resposta) {
      doc.setTextColor(220, 38, 38) // red
    } else {
      doc.setTextColor(22, 163, 74) // green
    }
    doc.setFont('helvetica', 'bold')
    doc.text(resp, margin + colLabelW + 3, qy + 5.5)

    qy += 8
  })

  // Violação rastreamento
  qy += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(27, 32, 67)
  doc.text('Violação do Rastreamento:', margin, qy)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  if (dados.violacaoRastreamento) {
    doc.setTextColor(220, 38, 38)
    doc.text('SIM', margin + 60, qy)
  } else {
    doc.setTextColor(22, 163, 74)
    doc.text('NÃO', margin + 60, qy)
  }
  qy += 10

  // Observação
  if (dados.observacao?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(27, 32, 67)
    doc.text('Observações:', margin, qy)
    qy += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(50, 50, 50)
    const lines = doc.splitTextToSize(dados.observacao.trim(), contentW)
    doc.text(lines, margin, qy)
  }

  // Numerar todas as páginas
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addPageNumber(doc, i, totalPages)
  }

  const blob = doc.output('blob')
  console.log('[gerarPdfVistoria] tamanho final do PDF (MB):', (blob.size / 1024 / 1024).toFixed(2))
  return blob
}

// ═══════════════════════════════════════════════════════════
// Vistoria de Entrega (página pública)
// ═══════════════════════════════════════════════════════════

interface DadosVistoriaEntregaPDF {
  placa: string
  contrato: string
  km: string
  selfieDataUrl: string | null
  fotos: { label: string; dataUrl: string | null }[]
  geoLocation: { lat: number; lng: number } | null
  videoUrl?: string
}

export async function gerarPdfVistoriaEntrega(dados: DadosVistoriaEntregaPDF): Promise<Blob> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentW = pw - margin * 2
  const halfW = (contentW - 6) / 2

  const now = new Date()
  const dataHora = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const selfieComprimida = dados.selfieDataUrl ? await compressImage(dados.selfieDataUrl) : null
  const fotosComprimidas = await comprimirFotos(dados.fotos)

  // ═══ PÁGINA 1: Cabeçalho + Selfie ═══
  let y = 20
  y = await drawLogo(doc, pw / 2, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Relatório de Vistoria de Entrega', pw / 2, y, { align: 'center' })
  y += 14

  const leftX = margin
  const rightX = margin + halfW + 6

  // Contrato + Placa
  const yBeforeContrato = y
  y = drawField(doc, 'Contrato:', dados.contrato, leftX, y, halfW)
  drawField(doc, 'Placa:', dados.placa, rightX, yBeforeContrato, halfW)

  // KM + Data/Hora
  const yBeforeKm = y
  y = drawField(doc, 'KM:', `${dados.km} km`, leftX, y, halfW)
  drawField(doc, 'Data e Hora:', dataHora, rightX, yBeforeKm, halfW)

  // Localização
  const locText = dados.geoLocation
    ? await obterEndereco(dados.geoLocation.lat, dados.geoLocation.lng)
    : 'Não disponível'
  y = drawField(doc, 'Localização:', locText, leftX, y, contentW)

  // Selfie
  if (selfieComprimida) {
    y += 4
    const fotoH = Math.min(120, ph - y - 20)
    y = drawPhotoWithBorder(doc, 'SELFIE DO LOCATÁRIO', selfieComprimida, margin, y, contentW, fotoH)
  }

  // ═══ PÁGINAS SEGUINTES: 2 fotos por página ═══
  const fotosComDados = fotosComprimidas.filter(f => f.dataUrl)
  let fotoIndex = 0

  while (fotoIndex < fotosComDados.length) {
    doc.addPage()
    let pageY = 15

    const fotoA = fotosComDados[fotoIndex]
    if (fotoA?.dataUrl) {
      pageY = drawPhotoWithBorder(doc, fotoA.label.toUpperCase(), fotoA.dataUrl, margin, pageY, contentW, 120)
    }
    fotoIndex++

    if (fotoIndex < fotosComDados.length) {
      pageY += 4
      const fotoB = fotosComDados[fotoIndex]
      if (fotoB?.dataUrl) {
        drawPhotoWithBorder(doc, fotoB.label.toUpperCase(), fotoB.dataUrl, margin, pageY, contentW, 120)
      }
      fotoIndex++
    }
  }

  // Numerar todas as páginas
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addPageNumber(doc, i, totalPages)
  }

  const blob = doc.output('blob')
  console.log('[gerarPdfVistoriaEntrega] tamanho final do PDF (MB):', (blob.size / 1024 / 1024).toFixed(2))
  return blob
}
