import { writeFile } from 'node:fs/promises'

const [, , debugPort = '9223', outputPath = 'cdp_capture.png', waitMsArg = '12000'] = process.argv
const waitMs = Number(waitMsArg)
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function getPage() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json())
      const page = pages.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:5173/'))
      if (page) return page
    } catch {
      // Edge may still be creating its remote-debugging endpoint.
    }
    await sleep(250)
  }
  throw new Error(`No local HSAD page found on DevTools port ${debugPort}`)
}

const page = await getPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
const consoleMessages = []
let commandId = 0

function send(method, params = {}) {
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
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    consoleMessages.push({
      type: message.params.type,
      values: message.params.args.map((argument) => argument.value ?? argument.description),
    })
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleMessages.push({
      type: 'exception',
      values: [message.params.exceptionDetails.text, message.params.exceptionDetails.exception?.description],
    })
  }
})

await send('Runtime.enable')
await send('Page.enable')
await sleep(waitMs)

const evaluation = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    url: location.href,
    title: document.title,
    modelMessage: document.querySelector('.model-error')?.innerText ?? null,
    canvasCount: document.querySelectorAll('canvas').length,
    canvasSize: Array.from(document.querySelectorAll('canvas')).map((canvas) => [canvas.width, canvas.height]),
    viewport: [innerWidth, innerHeight],
    documentSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    bodyText: document.body.innerText.slice(0, 1600)
  })`,
  returnByValue: true,
})
const capture = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
await writeFile(outputPath, Buffer.from(capture.data, 'base64'))

console.log(JSON.stringify({
  page: JSON.parse(evaluation.result.value),
  consoleMessages,
  screenshot: outputPath,
}, null, 2))
socket.close()
