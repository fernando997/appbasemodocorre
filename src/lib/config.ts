// Usadas em componentes client — precisam de NEXT_PUBLIC_
export const BUBBLE_BASE        = process.env.NEXT_PUBLIC_BUBBLE_BASE!
export const BUBBLE_KEY         = process.env.NEXT_PUBLIC_BUBBLE_KEY!
export const BUBBLE_PRIVATE_KEY = process.env.NEXT_PUBLIC_BUBBLE_PRIVATE_KEY!

export const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const SUPABASE_AUTH_TOKEN = process.env.NEXT_PUBLIC_SUPABASE_AUTH_TOKEN!

// Usadas só em API routes (server) — sem NEXT_PUBLIC_
export const BUBBLE_FILEUPLOAD = process.env.BUBBLE_FILEUPLOAD!
export const OPENAI_KEY        = process.env.OPENAI_KEY!
export const FIPE_KEY          = process.env.FIPE_KEY!
export const FIPE_URL          = process.env.FIPE_URL ?? 'https://placas.fipeapi.com.br/placas'
