/**
 * UI sweep: paste into a signed-in app page (browserd js.evaluate with file:).
 * Visits every link in the sidebar and flags misshapen checkboxes, help
 * buttons that disappear into their background, raw values leaking into
 * text (null, undefined, NaN, snake_case keys) and horizontal overflow.
 * Found on 2026-10-23: a site CSS class reused by the app stretched every
 * checkbox, which no unit test would see.
 */
(async () => {
  const routes = [...new Set([...document.querySelectorAll('aside a[href^="/app"], nav a[href^="/app"]')].map(a => a.getAttribute('href')))]
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  const out = {}
  const rgb = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3]] : n }
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length && (c[3] ?? 1) > 0.5) return c } return [255, 255, 255] }
  for (const r of routes) {
    history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate'))
    await wait(2200)
    const f = []
    const main = document.querySelector('main') || document.body
    for (const c of main.querySelectorAll('.ug-check')) { const b = c.getBoundingClientRect(); if (b.width && Math.abs(b.width - b.height) > 1) f.push(`checkbox ${Math.round(b.width)}x${Math.round(b.height)}`) }
    for (const h of document.querySelectorAll('.ug-hint')) { const a = lum(rgb(getComputedStyle(h).color)), b = lum(bgOf(h.parentElement)); const k = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); if (k < 3) f.push(`hint contrast ${k.toFixed(1)}`) }
    const text = main.innerText
    for (const m of text.matchAll(/\b(null|undefined|NaN|\[object Object\])\b|\b[a-z]+_[a-z_]+\b/g)) f.push(`raw text "${m[0]}"`)
    if (document.documentElement.scrollWidth > innerWidth + 1) f.push('horizontal overflow')
    if (f.length) out[r] = [...new Set(f)].slice(0, 8)
  }
  return JSON.stringify(out, null, 1)
})()
