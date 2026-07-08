import { create } from 'zustand'
import type { TriageStatus } from './types'

export type FeedbackFilter =
  | 'all'
  | 'thumbs_down'
  | 'thumbs_up'
  | 'session_feedback'
  | 'any'
  | 'none'

export type SortOrder = 'newest' | 'oldest'

export type EscalationFilter = 'all' | 'escalated' | 'not_escalated'

interface FilterState {
  searchTerm: string
  feedbackFilter: FeedbackFilter
  escalationFilter: EscalationFilter
  statusFilter: TriageStatus[]
  categoryFilter: string
  appNameFilter: string
  localeFilter: string
  orgFilter: string
  dateFrom: string
  dateTo: string
  sortOrder: SortOrder
}

const DEFAULT_FILTERS: FilterState = {
  searchTerm: '',
  feedbackFilter: 'all',
  escalationFilter: 'all',
  statusFilter: [],
  categoryFilter: '',
  appNameFilter: '',
  localeFilter: '',
  orgFilter: '',
  dateFrom: '',
  dateTo: '',
  sortOrder: 'newest',
}

interface AppState {
  selectedSessionId: string | null
  filters: FilterState
  threadSearch: string
  darkMode: boolean

  setSelectedSession: (id: string | null) => void
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  clearFilters: () => void
  setThreadSearch: (search: string) => void
  toggleDarkMode: () => void
}

const getInitialDarkMode = (): boolean => {
  const stored = localStorage.getItem('darkMode')
  return stored === 'true'
}

export const useStore = create<AppState>((set) => ({
  selectedSessionId: null,
  filters: { ...DEFAULT_FILTERS },
  threadSearch: '',
  darkMode: getInitialDarkMode(),

  setSelectedSession: (id) => set({ selectedSessionId: id }),

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  clearFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  setThreadSearch: (search) => set({ threadSearch: search }),

  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode
      localStorage.setItem('darkMode', String(next))
      if (next) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return { darkMode: next }
    }),
}))
