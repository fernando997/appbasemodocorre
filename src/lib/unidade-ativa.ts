export function getUnidadesAtivas(): string[] {
  try {
    const ativa = localStorage.getItem('mc_unidade_ativa')
    if (ativa) return JSON.parse(ativa)
    const todas = JSON.parse(localStorage.getItem('mc_unidades') ?? '[]')
    return todas.map((u: { _id: string }) => u._id)
  } catch {
    return []
  }
}

export function setUnidadeAtiva(ids: string[]) {
  localStorage.setItem('mc_unidade_ativa', JSON.stringify(ids))
  localStorage.removeItem('mc_veiculos')
}
