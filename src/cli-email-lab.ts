/**
 * Render every .html email in a folder (or the files given) across phone and
 * desktop widths and the inbox behaviours that break emails, and report.
 *
 *   npm run email-lab -- <folder-or-files...> [--out artifacts/email-lab] [--no-shots]
 *
 * Exits 1 when there are findings, so it can gate a build.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { nameOf, runEmailLab } from './lib/email-lab.js'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'artifacts/email-lab'
if (!outDir || outDir.startsWith('--')) {
  console.error('--out needs an output directory')
  process.exit(2)
}
const screenshots = !args.includes('--no-shots')
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))

if (!inputs.length) {
  console.error('usage: npm run email-lab -- <folder-or-files...> [--out dir] [--no-shots]')
  process.exit(2)
}

const files: string[] = []
for (const input of inputs) {
  if ((await stat(input)).isDirectory()) {
    for (const f of await readdir(input)) if (/\.html?$/i.test(f)) files.push(join(input, f))
  } else files.push(input)
}

const emails = await Promise.all(files.map(async (f) => ({ name: nameOf(f), html: await readFile(f, 'utf8') })))
const findings = await runEmailLab(emails, { outDir, screenshots })
const kinds = new Map<string, number>()
for (const f of findings) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1)
console.log(`email lab: ${emails.length} emails, ${findings.length} findings${findings.length ? ': ' + [...kinds].map(([k, n]) => `${k} ${n}`).join(', ') : ''}`)
console.log(`report: ${join(outDir, 'report.md')}`)
process.exit(findings.length ? 1 : 0)
