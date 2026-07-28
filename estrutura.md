# Estrutura
Estrutura do Site – Sistema de Controle da Base Modo Corre
🎯 Objetivo do Sistema

Mostrar dados operacionais relacionados somente às motos que estão alocadas naquela unidade.

Ter uma tela na base que mostre o dashboard operacional da unidade.

🔐 Perfis de Acesso

O sistema terá dois perfis:

ADM
Vai ver tudo
Operador
Terá acesso apenas a:
Dashboard
Tela de liberação
Tela de recebimento de motos
🧭 Telas do Sistema
1️⃣ Tela de Liberação de Veículos
Incluir requisição para checar se o rastreador (backup ou principal) teve comunicação nas últimas 2 horas
Incluir a gravação de quem fez a liberação da moto
2️⃣ Tela de Recebimento de Motos
Tela para recebimento de motos
Controle de fila de instalação de rastreador
3️⃣ Dados Financeiros
Mostrar dados financeiros de faturamento da unidade
Considerar os 10%
4️⃣ Dashboard Operacional da Unidade
🔹 Status da frota
Mostrar a quantidade de frota ativa por status
Dar preferência para dashboard destacando status que não sejam:
LOCADO
DISPONÍVEL
RESERVA
Esses outros status são os que precisam de mais atenção
Ao clicar em um gráfico:
Abrir listagem de placas
Mostrar observações dos status de movimentação
🔹 Previsão de entregas
Quando um contrato for gerado e estiver aguardando entrega:
Mostrar como entrega agendada
Se o locatário pagar a cobrança de retirada:
Mostrar como entrega confirmada
Sempre mostrar:
Data e horário
Nome do locatário
Para motos confirmadas:
Ter botão TESTE DE LIBERAÇÃO
Faz todas as checagens da tela de liberação
Não libera a moto
Apenas valida e avisa se algo estiver fora da lógica
Ter botão LIBERAR MOTO
Executa a liberação real
Deve executar a mesma função da tela de liberação
Deve solicitar o CPF do cliente
🔹 Previsão de recolhas
Motos na aba recolha autorizada:
Mostrar com status “recolha autorizada”
Motos na aba recolhidas:
Mostrar com status “recolhida”
Regras:
Motos “recolhidas” aparecem somente no dia e depois somem
Motos “recolha autorizada” permanecem até mudança de status
🔹 Manutenção no rastreador
Na tela de gerenciamento de risco:
Criar botão “manutenção no rastreador”
Ao clicar:
Sistema indica que a moto está em processo de coleta para correção
🔹 Pendências
Mostrar placas da unidade que possuem pendências
Pendências são as registradas na tela de pendência em veículos
5️⃣ Relatórios
📄 Motos entregues
Mostrar apenas motos que foram registradas na tela de liberação
Regra:
Operador só recebe comissão se usar essa tela
📄 Motos recolhidas
Mostrar motos que passaram por vistoria de devolução
✅ Resumo fiel

O sistema é composto por:

Controle por unidade
Dashboard operacional
Telas de liberação e recebimento
Exibição de dados financeiros
Controle de entregas e recolhas com regras específicas
Relatórios baseados no uso correto das telas

---

# Detalhes Técnicos

## Configuração (`src/lib/config.ts`)
- `BUBBLE_BASE` — endpoint base dos workflows Bubble (`/wf`)
- `BUBBLE_KEY` — chave pública da API Bubble
- `BUBBLE_PRIVATE_KEY` — chave privada Bubble (Bearer token para uploads)
- `BUBBLE_FILEUPLOAD` — endpoint de upload de arquivo (`/version-test/fileupload`)
- `OPENAI_KEY` — chave OpenAI (usada em `/api/ler-placa`)
- `FIPE_KEY` / `FIPE_URL` — consulta de placa/FIPE

## Auth / Middleware
- Arquivo: `src/proxy.ts` (convenção Next.js 16, não `middleware.ts`)
- Redireciona para `/login` se cookie `mc_auth` não for `"1"`
- Cookies: `mc_auth`, `mc_unit` (JSON array de unidades), `mc_nome`, `mc_perfil`

## Tela de Recebimento (`src/app/recebimento/page.tsx`)

### Status das motos
| Constante | Valor |
|-----------|-------|
| `STATUS_TRANSITO` | `"COMPRA EM TRÂNSITO"` |
| `STATUS_RECEBIDA` | `"novo"` (valor que vem na key `instalação 1`) |
| `STATUS_INSTALADO` | `"RASTREADOR INSTALADO"` |

### Carregamento (`recebimento-de-motos`)
- **Endpoint:** `POST /wf/recebimento-de-motos`
- **Body:** `{ apikey, unidade: string[] }`
- **Response keys:**
  - `recebimento` — motos com `status_veiculo_desc: "COMPRA EM TRÂNSITO"` (aba Recebimento)
  - `instalação 1` — registros da tabela `lista-de-instalação` com `status: "NOVO"` (tem campo `veiculo` com ID do veículo)
  - `instalação 2` — dados dos veículos referenciados em `instalação 1` (mesmos campos que `recebimento`)
  - Ambos `instalação 1` e `instalação 2` chegam com duplicatas — o código deduplica `fila1` por `veiculo` e `fila2` por `_id`
  - Join: `fila1[i].veiculo === fila2[j]._id`

### Receber moto (`confirmarRecebimento`)
Fluxo em 2 passos:
1. **Upload da foto** → `POST /api/upload-foto` (API route interna)
   - Recebe `foto` (File)
   - Faz upload server-side para `BUBBLE_FILEUPLOAD` com `Authorization: Bearer BUBBLE_PRIVATE_KEY`
   - Bubble retorna URL como string JSON (ex: `"//cdn.bubble.io/f123.jpg"`)
   - Retorna `{ url: "https://cdn.bubble.io/f123.jpg" }`
2. **Workflow** → `POST /wf/receber-moto` com `Authorization: Bearer BUBBLE_PRIVATE_KEY`
   - Params (FormData): `apikey`, `moto` (ID), `placa`, `foto-entrega` (URL da foto)

### Confirmar instalação (`confirmarInstalacao`)
- Ainda usa timeout fake (pendente implementação da chamada real)

### Observação sobre dados
- Veículo com chassi `9C2KC2500TR132974` detectado com inconsistência: `status_veiculo_desc: "COMPRA RECEBIDA"` no veículo mas registro na `lista-de-instalação` já confirmado (não "NOVO") — por isso não aparece na fila

## API Routes internas
| Rota | Função |
|------|--------|
| `POST /api/debug` | Grava entradas no `debug.log` |
| `POST /api/ler-placa` | Lê placa via OCR (OpenAI) + consulta FIPE |
| `POST /api/upload-foto` | Upload de foto para o Bubble (server-side, evita CORS) |