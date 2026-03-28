import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'frontend', 'dist')
const publicDir = path.join(projectRoot, 'public')

if (!fs.existsSync(distDir)) {
  throw new Error(`Frontend build output not found: ${distDir}`)
}

fs.rmSync(publicDir, { recursive: true, force: true })
fs.mkdirSync(publicDir, { recursive: true })
fs.cpSync(distDir, publicDir, { recursive: true })

console.log(`Copied ${distDir} -> ${publicDir}`)
