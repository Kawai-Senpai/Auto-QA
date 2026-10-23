/**
 * Email lab: render an HTML email the way real inboxes do, and say where it
 * breaks.
 *
 * A browser preview flatters an email. Real inboxes do not: most clients read
 * on a phone, Gmail on Android recolours light emails in dark mode whatever
 * the email asks for, some apps strip the <head> styles, and many load images
 * late or never. Each of those is simulated here, at several widths, and
 * every render is checked for the defects that actually reach clients:
 * pictures drawn at the wrong shape, a layout wider than the phone, text that
 * disappears in dark mode, buttons too small for a thumb, broken images and
 * links that point at a developer's machine.
 *
 * Simulations are approximations of the clients' documented behaviour, not
 * the clients themselves; treat a clean report as necessary, not sufficient,
 * and still look at the screenshots it saves.
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export type Width = { name: string; width: number; height: number; mobile: boolean }
export type Client = 'as-designed' | 'gmail-dark' | 'head-stripped' | 'images-off'

export const WIDTHS: Width[] = [
  { name: 'desktop', width: 640, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'small-phone', width: 320, height: 640, mobile: true },
]

export const CLIENTS: Client[] = ['as-designed', 'gmail-dark', 'head-stripped', 'images-off']

export type Finding = {
  email: string
  width: string
  client: Client
  kind:
    | 'overflow'
    | 'image-distorted'
    | 'image-broken'
    | 'image-missing-size'
    | 'low-contrast'
    | 'small-tap-target'
    | 'small-text'
    | 'local-link'
    | 'escaped-markup'
  detail: string
}

/** What a client does to the HTML before showing it. */
function prepare(html: string, client: Client): string {
  if (client === 'head-stripped') {
    // Gmail for non-Google accounts and several Android apps drop <style>:
    // media queries and classes are gone, only inline styles survive.
    return html.replace(/<style[\s\S]*?<\/style>/gi, '')
  }
  if (client === 'images-off') {
    return html.replace(/(<img\b[^>]*?)\ssrc="[^"]*"/gi, '$1 src="data:image/gif;base64,R0lGODlhAQABAAAAACw="')
  }
  return html
}

/**
 * Gmail-style forced dark mode, run inside the page: light backgrounds go
 * dark, dark text goes light, mid and dark backgrounds stay, and images are
 * left exactly as they are. That last part is what makes transparent dark
 * logos and dark art vanish.
 */
const FORCE_DARK = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } }
  const lum = ({ r, g, b }) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
  // Keep the hue, invert the lightness: what Gmail does, so mint stays green.
  const flip = ({ r, g, b }) => {
    const [R, G, B] = [r / 255, g / 255, b / 255]; const max = Math.max(R, G, B), min = Math.min(R, G, B); const l = (max + min) / 2
    const d = max - min; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    const h = d === 0 ? 0 : max === R ? (((G - B) / d) + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    const L = Math.max(0.07, Math.min(0.93, 1 - l)); const c = (1 - Math.abs(2 * L - 1)) * s; const x = c * (1 - Math.abs((h % 2) - 1)); const m = L - c / 2
    const [p, q, w] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
    return 'rgb(' + [p, q, w].map((v) => Math.round((v + m) * 255)).join(',') + ')'
  }
  const els = [document.documentElement, document.body, ...document.querySelectorAll('body *')]
  const plan = els.map((el) => { const s = getComputedStyle(el); return [el, parse(s.backgroundColor), parse(s.color), s.backgroundImage] })
  for (const [el, bg, fg] of plan) {
    if (el.tagName === 'IMG') continue
    if (bg && bg.a > 0 && lum(bg) > 0.6) el.style.setProperty('background-color', flip(bg), 'important')
    if (fg && lum(fg) < 0.4) el.style.setProperty('color', flip(fg), 'important')
  }
  if (getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)') document.body.style.setProperty('background-color', '#121212', 'important')
})()`

/** The checks, run inside the rendered page. */
const CHECKS = `(({ mobile }) => {
  const out = []
  const vw = window.innerWidth
  if (document.documentElement.scrollWidth > vw + 1) out.push(['overflow', 'page is ' + document.documentElement.scrollWidth + 'px wide in a ' + vw + 'px screen'])
  for (const img of document.images) {
    const r = img.getBoundingClientRect()
    const name = (img.getAttribute('src') || '').split('/').pop().slice(0, 60)
    if (r.width <= 2 && r.height <= 2) continue
    if (!img.complete || img.naturalWidth === 0) { if (!img.src.startsWith('data:')) out.push(['image-broken', name]); continue }
    if (img.src.startsWith('data:')) continue
    const natural = img.naturalWidth / img.naturalHeight
    const shown = r.width / r.height
    if (Math.abs(shown - natural) / natural > 0.03) out.push(['image-distorted', name + ': natural ' + natural.toFixed(2) + ', shown ' + shown.toFixed(2)])
    if (!img.getAttribute('width') || !img.getAttribute('height')) out.push(['image-missing-size', name + ' has no ' + (!img.getAttribute('width') ? 'width' : 'height') + ' attribute'])
  }
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } }
  const rel = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); const c = parse(s.backgroundColor); if (c && c.a > 0.5) return c; if (s.backgroundImage !== 'none') return null } return { r: 255, g: 255, b: 255, a: 1 } }
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode
    const text = t.textContent.trim()
    const el = t.parentElement
    if (!text || !el || seen.has(el)) continue
    seen.add(el)
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0 || el.closest('[style*="display:none"]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const fg = parse(s.color); const bg = bgOf(el)
    const size = parseFloat(s.fontSize)
    if (fg && bg) {
      const need = size >= 18 || (size >= 14 && Number(s.fontWeight) >= 700) ? 3 : 4.5
      const c = ratio(fg, bg) * (parseFloat(s.opacity) || 1)
      if (c < need) out.push(['low-contrast', JSON.stringify(text.slice(0, 40)) + ' ' + c.toFixed(1) + ':1 (needs ' + need + ')'])
    }
    if (mobile && size < 12 && text.length > 3) out.push(['small-text', JSON.stringify(text.slice(0, 40)) + ' at ' + size + 'px'])
  }
  const shown = document.body.innerText
  const tag = shown.match(/<\\/?(b|strong|i|em|a|br|p|span|div)\\b[^>]*>|&(amp|lt|gt|nbsp|middot);/)
  if (tag) out.push(['escaped-markup', 'visible text contains ' + JSON.stringify(tag[0])])
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    if (/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)/.test(href)) out.push(['local-link', href.slice(0, 80)])
    const r = a.getBoundingClientRect()
    if (mobile && r.width > 0 && r.height > 0 && r.height < 24 && a.textContent.trim().length > 0 && getComputedStyle(a).display !== 'inline') out.push(['small-tap-target', JSON.stringify(a.textContent.trim().slice(0, 30)) + ' is ' + Math.round(r.height) + 'px tall'])
  }
  return out
})`

export type LabOptions = {
  outDir: string
  widths?: Width[]
  clients?: Client[]
  /** Hosts allowed in links (others flagged as local only when they are localhost). */
  screenshots?: boolean
}

export async function runEmailLab(emails: { name: string; html: string }[], opts: LabOptions): Promise<Finding[]> {
  const widths = opts.widths ?? WIDTHS
  const clients = opts.clients ?? CLIENTS
  await mkdir(opts.outDir, { recursive: true })
  const browser: Browser = await chromium.launch()
  const findings: Finding[] = []
  try {
    for (const w of widths) {
      const context = await browser.newContext({ viewport: { width: w.width, height: w.height }, isMobile: w.mobile, deviceScaleFactor: w.mobile ? 2 : 1, colorScheme: 'light' })
      const page: Page = await context.newPage()
      for (const email of emails) {
        for (const client of clients) {
          await page.setContent(prepare(email.html, client), { waitUntil: 'load', timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(300)
          if (client === 'gmail-dark') await page.evaluate(FORCE_DARK)
          const raw = (await page.evaluate(`${CHECKS}(${JSON.stringify({ mobile: w.mobile })})`)) as [Finding['kind'], string][]
          for (const [kind, detail] of raw) findings.push({ email: email.name, width: w.name, client, kind, detail })
          if (opts.screenshots !== false) {
            await page.screenshot({ path: join(opts.outDir, `${email.name}--${w.name}--${client}.png`), fullPage: true })
          }
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  await writeFile(join(opts.outDir, 'report.json'), JSON.stringify(findings, null, 2))
  await writeFile(join(opts.outDir, 'report.md'), summarise(findings, emails.length, widths, clients))
  return findings
}

export function summarise(findings: Finding[], count: number, widths: Width[], clients: Client[]): string {
  const lines = [`# Email lab`, ``, `${count} emails x ${widths.length} widths x ${clients.length} client behaviours.`, ``]
  if (!findings.length) return lines.concat(['No findings.']).join('\n')
  const byKind = new Map<string, Finding[]>()
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f])
  for (const [kind, list] of byKind) {
    lines.push(`## ${kind} (${list.length})`, '')
    const unique = new Map<string, string[]>()
    for (const f of list) {
      const key = `${f.email}: ${f.detail}`
      unique.set(key, [...(unique.get(key) ?? []), `${f.width}/${f.client}`])
    }
    for (const [key, where] of unique) lines.push(`- ${key} _(${where.join(', ')})_`)
    lines.push('')
  }
  return lines.join('\n')
}

export const nameOf = (path: string) => basename(path).replace(/\.html?$/i, '')
