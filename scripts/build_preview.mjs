// Build the app into one self-contained HTML file for previewing before release.
// Usage: node scripts/build_preview.mjs <output.html>
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/build_preview.mjs <output.html>')

const dist = 'dist-preview'
execSync(`npx vite build --outDir ${dist} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, PREVIEW: '1' } })

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const asset = (re) => readFileSync(join(dist, html.match(re)[1]), 'utf8')
const css = asset(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/)
const js = asset(/<script type="module"[^>]*src="\.\/([^"]+)"/)

writeFileSync(
  out,
  `<title>개인연금 앱 미리보기</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replaceAll('</script', '<\\/script').replaceAll('\uFFFD', '\\uFFFD')}</script>
`,
)
console.log(`preview written to ${out}`)
