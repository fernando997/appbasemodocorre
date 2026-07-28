# Qualquer Coisa

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Recharts
- React Hook Form + Zod
- TanStack Query + TanStack Table
- ESLint + Prettier
- dotenvx
- date-fns

## O que foi feito

### Dashboard (`/dashboard`)
- Status da Frota: gráfico de linha com dots coloridos por status (verde = normal, amarelo/vermelho = atenção). Clicar no dot ou nas legendas abre popup com placas e observações de cada moto
- Previsão de Entregas: lista de confirmadas (botão Teste e Liberar) e agendadas. Botão Teste abre popup com campo de placa, resultado com foto/nome/placa/CPF/contrato e badge liberado/não liberado
- Previsão de Recolhas: duas abas — Recolha Autorizada e Recolhidas (recolhidas somem após o dia)
- Manutenção no Rastreador: lista de motos em processo de coleta por problema no rastreador
- Pendências: lista de placas com pendências registradas

### Tela de Liberação (`/liberacao`)
- Busca por placa (digitada ou foto pela câmera) → simulação do retorno com: foto, nome, placa, CPF, contrato, status da entrada, checagem do rastreador principal e backup (últimas 2h)
- Botão Confirmar Liberação registra o operador logado e horário
- Lista de entregas confirmadas e agendadas com botões Teste e Liberar

### Layout
- Sidebar escura com navegação
- Mobile: hamburger menu com overlay deslizante
- Fonte: Montserrat
- Cor primária: verde

### Variáveis de ambiente necessárias
- `NEXT_PUBLIC_N8N_WEBHOOK_LIBERACAO` — webhook do n8n para consulta na tela de liberação
