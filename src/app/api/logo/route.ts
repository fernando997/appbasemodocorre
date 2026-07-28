import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export function GET() {
  try {
    const cropped = readFileSync(join(process.cwd(), 'public', 'logo-cropped.png'))
    return new NextResponse(cropped, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    const file = readFileSync(join(process.cwd(), 'public', 'logo.png'))
    return new NextResponse(file, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    })
  }
}
