import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TeachingMode } from '../data/teachingFlow'

type TeachingModeValue = { mode: TeachingMode; setMode: (mode: TeachingMode) => void }
const TeachingModeContext = createContext<TeachingModeValue | null>(null)

export function TeachingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TeachingMode>('student')
  const value = useMemo(() => ({ mode, setMode }), [mode])
  return <TeachingModeContext.Provider value={value}>{children}</TeachingModeContext.Provider>
}

export function useTeachingMode() {
  const context = useContext(TeachingModeContext)
  if (!context) throw new Error('useTeachingMode must be used within TeachingModeProvider')
  return context
}
