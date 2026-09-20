import { createContext, useContext } from 'react'
import type { PartSpec } from '../types'

/**
 * Exhibit-wide interaction state. One machine, many parts: the parts read
 * from here so that selection, dimming and the explode slider behave
 * identically on every exhibit in the museum.
 */
export interface ExhibitState {
  selected: string | null
  hovered: string | null
  explode: number
  xray: boolean
  accent: string
  parts: Record<string, PartSpec>
  select: (id: string | null) => void
  hover: (id: string | null) => void
}

export const ExhibitCtx = createContext<ExhibitState | null>(null)

export function useExhibit() {
  const ctx = useContext(ExhibitCtx)
  if (!ctx) throw new Error('useExhibit must be used inside an ExhibitProvider')
  return ctx
}

/** How a single part is currently being presented. */
export type PartState = 'idle' | 'hover' | 'selected' | 'dimmed'

export const PartCtx = createContext<PartState>('idle')

export function usePartState() {
  return useContext(PartCtx)
}
