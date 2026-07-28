import { NextRequest, NextResponse } from 'next/server'
import { appendFile } from 'fs/promises'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const linha = `[${new Date().toISOString()}] ${JSON.stringify(body)}\n`
    await appendFile(path.join(process.cwd(), 'debug.log'), linha)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 })
  }
}
