import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SEED_FILES } from '../src/seedCsvs.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('worker seed bundle', () => {
  it('lists every English seed CSV and no others', () => {
    const files = readdirSync(join(root, 'data'))
      .filter((name) => name.endsWith('-en-seed.csv'))
      .sort()
    expect(SEED_FILES.map((pair) => pair[0])).toEqual(files)
    const src = readFileSync(join(root, 'worker/src/seedCsvs.js'), 'utf8')
    for (const name of files) expect(src).toContain(name)
  })
})
