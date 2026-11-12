import { writeFile } from 'node:fs/promises'

const [, , debugPort = '9224', outputPath = 'lab_action.png', actionMode = 'bend'] = process.argv
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function pageTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json())
      const page = pages.find((item) => item.type === 'page' && item.url.includes('/#/lab'))
      if (page) return page
    } catch {
      // Remote debugging starts shortly after the Edge process.
    }
    await sleep(250)
  }
  throw new Error(`No lab page found on DevTools port ${debugPort}`)
}

const target = await pageTarget()
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let commandId = 0
const send = (method, params = {}) => {
  commandId += 1
  const id = commandId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const entry = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})

await send('Runtime.enable')
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })
await sleep(4500)
const action = await send('Runtime.evaluate', {
  expression: `(() => {
    const angle = document.querySelector('.primary-range input[type="range"]')
    const differential = document.querySelector('.segmented-control button:nth-child(2)')
    if (!(angle instanceof HTMLInputElement) || !(differential instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'controls not found' }
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    valueSetter.call(angle, '60')
    angle.dispatchEvent(new Event('input', { bubbles: true }))
    angle.dispatchEvent(new Event('change', { bubbles: true }))
    differential.click()
    return { ok: true, target: angle.value, mode: differential.textContent.trim() }
  })()`,
  returnByValue: true,
})

await sleep(3500)
if (actionMode === 'cycle') {
  await send('Runtime.evaluate', {
    expression: `(() => {
      const angle = document.querySelector('.primary-range input[type="range"]')
      if (!(angle instanceof HTMLInputElement)) return false
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      valueSetter.call(angle, '0')
      angle.dispatchEvent(new Event('input', { bubbles: true }))
      angle.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
    returnByValue: true,
  })
  await sleep(3500)
}
const result = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    resultReadout: Array.from(document.querySelectorAll('.result-readout > div')).map((row) => [row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.trim()]),
    signalMetrics: Array.from(document.querySelectorAll('.signal-metrics > span')).map((cell) => [cell.querySelector('small')?.textContent.trim(), cell.querySelector('b')?.textContent.trim()]),
    mappingStatus: document.querySelector('.mapping-status')?.innerText,
    mode: document.querySelector('.segmented-control button[aria-pressed="true"]')?.textContent.trim(),
    selectedJoint: document.querySelector('.compact-select select')?.value,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  })`,
  returnByValue: true,
})
const capture = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
await writeFile(outputPath, Buffer.from(capture.data, 'base64'))

console.log(JSON.stringify({ action: action.result.value, state: JSON.parse(result.result.value), screenshot: outputPath }, null, 2))
socket.close()
