// USB and Bluetooth SPP must carry the same 31-field HSAD CSV protocol.
// The last three fields are pitch, yaw, roll in radians.
export function parseHsadFrame(line: string): number[] | null {
  const fields = line.trim().split(',')
  if (fields.length !== 31 || fields.some((field) => !field.trim())) return null
  const values = fields.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return null
  if (values.slice(0, 28).some((value) => value < -0.05 || value > 3.4)) return null
  if (values.slice(28).some((value) => Math.abs(value) > Math.PI + 0.00001)) return null
  return values
}
