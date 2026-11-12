// Permissões do usuário da base (User-base), gravadas no mc_user pelo login.
// Mudou no Bubble? Só vale depois que a pessoa sair e entrar de novo.

export function podeSolicitarCompra(): boolean {
  try {
    return JSON.parse(localStorage.getItem('mc_user') ?? '{}')?.solicitar_compra === true
  } catch {
    return false
  }
}
