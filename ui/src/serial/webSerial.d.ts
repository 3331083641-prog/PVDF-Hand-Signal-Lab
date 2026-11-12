interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOpenOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialOpenOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>
}

interface Navigator {
  readonly serial?: Serial
}
