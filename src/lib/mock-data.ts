export type PlacaItem = {
  placa: string
  observacao: string
}

export type StatusFrota = {
  status: string
  quantidade: number
  atencao: boolean
  placas: PlacaItem[]
}

export type Entrega = {
  id: number
  placa: string
  locatario: string
  data: string
  horario: string
  tipo: 'agendada' | 'confirmada'
}

export type Recolha = {
  id: number
  placa: string
  locatario: string
  status: 'recolha-autorizada' | 'recolhida'
  data: string
}

export type Pendencia = {
  id: number
  placa: string
  descricao: string
  data: string
}

export const frotaStatusData: StatusFrota[] = [
  {
    status: 'LOCADO',
    quantidade: 45,
    atencao: false,
    placas: [
      { placa: 'ABC1D23', observacao: 'Contrato ativo' },
      { placa: 'DEF2E34', observacao: 'Contrato ativo' },
      { placa: 'GHI3F45', observacao: 'Contrato ativo' },
      { placa: 'JKL4G56', observacao: 'Contrato ativo' },
      { placa: 'MNO5H67', observacao: 'Contrato ativo' },
    ],
  },
  {
    status: 'DISPONÍVEL',
    quantidade: 12,
    atencao: false,
    placas: [
      { placa: 'PQR6I78', observacao: 'Aguardando locação' },
      { placa: 'STU7J89', observacao: 'Aguardando locação' },
      { placa: 'VWX8K90', observacao: 'Aguardando locação' },
    ],
  },
  {
    status: 'RESERVA',
    quantidade: 8,
    atencao: false,
    placas: [
      { placa: 'YZA9L01', observacao: 'Reservada para cliente' },
      { placa: 'BCD0M12', observacao: 'Reservada para cliente' },
    ],
  },
  {
    status: 'MANUTENÇÃO',
    quantidade: 5,
    atencao: true,
    placas: [
      { placa: 'EFG1N23', observacao: 'Troca de pneu traseiro' },
      { placa: 'HIJ2O34', observacao: 'Revisão de freios' },
      { placa: 'KLM3P45', observacao: 'Problema no motor' },
      { placa: 'NOP4Q56', observacao: 'Troca de óleo' },
      { placa: 'QRS5R67', observacao: 'Regulagem de câmbio' },
    ],
  },
  {
    status: 'SINISTRO',
    quantidade: 2,
    atencao: true,
    placas: [
      { placa: 'TUV6S78', observacao: 'Colisão frontal — aguardando seguradora' },
      { placa: 'WXY7T89', observacao: 'Roubo — B.O. registrado' },
    ],
  },
  {
    status: 'EM VISTORIA',
    quantidade: 3,
    atencao: true,
    placas: [
      { placa: 'ZAB8U90', observacao: 'Vistoria de devolução' },
      { placa: 'CDE9V01', observacao: 'Vistoria de entrada' },
      { placa: 'FGH0W12', observacao: 'Aguardando laudo' },
    ],
  },
  {
    status: 'IRREGULARES',
    quantidade: 1,
    atencao: true,
    placas: [
      { placa: 'IJK1X23', observacao: 'Documentação vencida' },
    ],
  },
]

export const entregasData: Entrega[] = [
  {
    id: 1,
    placa: 'ABC1D23',
    locatario: 'João Silva',
    data: '2026-04-22',
    horario: '14:00',
    tipo: 'confirmada',
  },
  {
    id: 2,
    placa: 'XYZ2E34',
    locatario: 'Maria Santos',
    data: '2026-04-22',
    horario: '15:30',
    tipo: 'confirmada',
  },
  {
    id: 3,
    placa: 'DEF3F45',
    locatario: 'Carlos Oliveira',
    data: '2026-04-23',
    horario: '09:00',
    tipo: 'agendada',
  },
  {
    id: 4,
    placa: 'GHI4G56',
    locatario: 'Ana Costa',
    data: '2026-04-23',
    horario: '10:30',
    tipo: 'agendada',
  },
  {
    id: 5,
    placa: 'JKL5H67',
    locatario: 'Paulo Mendes',
    data: '2026-04-24',
    horario: '11:00',
    tipo: 'agendada',
  },
]

export const recolhasData: Recolha[] = [
  {
    id: 1,
    placa: 'MNO5H67',
    locatario: 'Pedro Lima',
    status: 'recolha-autorizada',
    data: '2026-04-22',
  },
  {
    id: 2,
    placa: 'PQR6I78',
    locatario: 'Lucia Ferreira',
    status: 'recolha-autorizada',
    data: '2026-04-22',
  },
  {
    id: 3,
    placa: 'STU7J89',
    locatario: 'Roberto Souza',
    status: 'recolhida',
    data: '2026-04-22',
  },
  {
    id: 4,
    placa: 'VWX8K90',
    locatario: 'Fernanda Rocha',
    status: 'recolhida',
    data: '2026-04-22',
  },
]

export type MotoRastreador = {
  id: number
  placa: string
  motivo: string
  data: string
}

export const rastreadorData: MotoRastreador[] = [
  { id: 1, placa: 'EFG1N23', motivo: 'Sem comunicação há 3 dias', data: '2026-04-19' },
  { id: 2, placa: 'KLM3P45', motivo: 'Rastreador danificado', data: '2026-04-20' },
  { id: 3, placa: 'QRS5R67', motivo: 'Backup sem sinal', data: '2026-04-21' },
]

export const pendenciasData: Pendencia[] = [
  { id: 1, placa: 'EFG1N23', descricao: 'Documentação pendente', data: '2026-04-20' },
  { id: 2, placa: 'HIJ2O34', descricao: 'Vistoria não realizada', data: '2026-04-19' },
  { id: 3, placa: 'KLM3P45', descricao: 'Rastreador sem comunicação', data: '2026-04-21' },
  { id: 4, placa: 'NOP4Q56', descricao: 'Pendência financeira', data: '2026-04-18' },
  { id: 5, placa: 'QRS5R67', descricao: 'CNH vencida', data: '2026-04-17' },
]

export type MotoRecebimento = {
  id: number
  placa?: string
  modelo: string
  chassi: string
  cor: string
  fornecedor: string
  locadora: string
  unidade: string
  data_compra: string
  data_prevista: string
  nota_url: string
  status: 'transito' | 'recebida' | 'instalado'
  foto?: string
  data_recebimento?: string
  data_instalacao?: string
}

export const motosRecebimentoData: MotoRecebimento[] = [
  {
    id: 1,
    modelo: 'Honda CG 160',
    chassi: '9C2JC4110NR123456',
    cor: 'Vermelho',
    fornecedor: 'Honda Mogi',
    locadora: 'Modo Corre',
    unidade: 'Base Central',
    data_compra: '2026-04-23',
    data_prevista: '2026-04-29',
    nota_url: '/notas/nota-9C2JC4110NR123456.pdf',
    status: 'transito',
  },
  {
    id: 2,
    modelo: 'Yamaha Factor 150',
    chassi: '9C6KE0510NR234567',
    cor: 'Preto',
    fornecedor: 'Yamaha Sul',
    locadora: 'Modo Corre',
    unidade: 'Base Central',
    data_compra: '2026-04-20',
    data_prevista: '2026-04-25',
    nota_url: '/notas/nota-9C6KE0510NR234567.pdf',
    status: 'transito',
  },
  {
    id: 3,
    modelo: 'Honda Biz 125',
    chassi: '9C2JD3010NR345678',
    cor: 'Branco',
    fornecedor: 'Honda Centro',
    locadora: 'Modo Corre',
    unidade: 'Base Norte',
    data_compra: '2026-04-24',
    data_prevista: '2026-04-30',
    nota_url: '/notas/nota-9C2JD3010NR345678.pdf',
    status: 'transito',
  },
  {
    id: 4,
    placa: 'MNO3H52',
    modelo: 'Honda CG 160',
    chassi: '9C2JC4110NR789012',
    cor: 'Prata',
    fornecedor: 'Honda Mogi',
    locadora: 'Modo Corre',
    unidade: 'Base Central',
    data_compra: '2026-04-18',
    data_prevista: '2026-04-22',
    nota_url: '/notas/nota-9C2JC4110NR789012.pdf',
    status: 'recebida',
    data_recebimento: '2026-04-22',
  },
  {
    id: 5,
    placa: 'PQR4I63',
    modelo: 'Yamaha Factor 150',
    chassi: '9C6KE0510NR890123',
    cor: 'Azul',
    fornecedor: 'Yamaha Sul',
    locadora: 'Modo Corre',
    unidade: 'Base Norte',
    data_compra: '2026-04-19',
    data_prevista: '2026-04-23',
    nota_url: '/notas/nota-9C6KE0510NR890123.pdf',
    status: 'recebida',
    data_recebimento: '2026-04-24',
  },
  {
    id: 6,
    placa: 'STU5J74',
    modelo: 'Honda Biz 125',
    chassi: '9C2JD3010NR901234',
    cor: 'Vermelho',
    fornecedor: 'Honda Centro',
    locadora: 'Modo Corre',
    unidade: 'Base Central',
    data_compra: '2026-04-15',
    data_prevista: '2026-04-20',
    nota_url: '/notas/nota-9C2JD3010NR901234.pdf',
    status: 'instalado',
    data_recebimento: '2026-04-20',
    data_instalacao: '2026-04-25',
  },
]
