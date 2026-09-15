import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'browser', 'client.js')
const dest = join(root, 'lib', 'client.js')
mkdirSync(join(root, 'lib'), { recursive: true })
copyFileSync(src, dest)
console.log('copied browser client → lib/client.js')
