// 要求ごとのトークンを積み上げ棒の SVG にする（$ を使わない純な関数）
// 1 本 = 1 回の要求。下から キャッシュ読み・キャッシュ書き・新しい入力、上に出力を細く重ねる

const COLORS = {
  cacheRead: '#4f8a8b',
  cacheWrite: '#d9b26a',
  input: '#e07a5f',
  output: '#7fd1a6',
  axis: '#8a8780',
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// 12345 → '12k'
export function short(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

/**
 * @param {{ input: number, output: number, cacheRead: number, cacheWrite: number }[]} steps 古い順
 * @param {number} w SVG の幅（CSS の点）
 * @param {number} h SVG の高さ（CSS の点）
 */
export function tokenChart(steps, w, h) {
  const pad = { l: 8, r: 44, t: 22, b: 18 }
  const iw = w - pad.l - pad.r
  const ih = h - pad.t - pad.b
  const totals = steps.map((s) => s.cacheRead + s.cacheWrite + s.input)
  const max = Math.max(1, ...totals)
  const n = Math.max(steps.length, 1)
  const slot = iw / n
  const bw = Math.max(2, Math.min(18, slot * 0.7))
  const y = (v) => pad.t + ih - (v / max) * ih
  const parts = []
  steps.forEach((s, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2
    let base = 0
    for (const k of ['cacheRead', 'cacheWrite', 'input']) {
      if (s[k] <= 0) continue
      parts.push(`<rect x="${x.toFixed(1)}" y="${y(base + s[k]).toFixed(1)}" width="${bw.toFixed(1)}" height="${((s[k] / max) * ih).toFixed(1)}" fill="${COLORS[k]}"/>`)
      base += s[k]
    }
    // 出力は棒の頭に細い線で（量は入力よりずっと小さいので、印として見せる）
    parts.push(`<rect x="${x.toFixed(1)}" y="${(y(base) - 3).toFixed(1)}" width="${bw.toFixed(1)}" height="2" fill="${COLORS.output}"/>`)
  })
  const last = totals[totals.length - 1] ?? 0
  const legend = [['cacheRead', 'キャッシュ読み'], ['cacheWrite', '書き'], ['input', '新しい入力'], ['output', '出力']]
    .map(([k, label], i) => `<rect x="${pad.l + i * 92}" y="6" width="9" height="9" fill="${COLORS[k]}"/><text x="${pad.l + 13 + i * 92}" y="14">${esc(label)}</text>`)
    .join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMin meet">`,
    `<style>text{font:11px system-ui,'Yu Gothic UI',sans-serif;fill:${COLORS.axis}}</style>`,
    legend,
    `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="${COLORS.axis}" stroke-width="1"/>`,
    `<text x="${pad.l + iw + 4}" y="${pad.t + 8}">${short(max)}</text>`,
    `<text x="${pad.l + iw + 4}" y="${y(last).toFixed(1)}">${short(last)}</text>`,
    `<text x="${pad.l}" y="${h - 4}">古い ← 要求 ${steps.length} 回 → 新しい</text>`,
    ...parts,
    '</svg>',
  ].join('')
}
