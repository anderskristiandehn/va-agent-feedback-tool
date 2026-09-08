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
  hideTestOrgs: boolean

  setSelectedSession: (id: string | null) => void
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  clearFilters: () => void
  setThreadSearch: (search: string) => void
  toggleDarkMode: () => void
  toggleHideTestOrgs: () => void
}

const getInitialDarkMode = (): boolean => {
  const stored = localStorage.getItem('darkMode')
  return stored === 'true'
}

// Defaults to hiding test orgs — they're noise in a feedback review tool.
const getInitialHideTestOrgs = (): boolean => {
  const stored = localStorage.getItem('hideTestOrgs')
  return stored === null ? true : stored === 'true'
}

export const useStore = create<AppState>((set) => ({
  selectedSessionId: null,
  filters: { ...DEFAULT_FILTERS },
  threadSearch: '',
  darkMode: getInitialDarkMode(),
  hideTestOrgs: getInitialHideTestOrgs(),

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

  toggleHideTestOrgs: () =>
    set((state) => {
      const next = !state.hideTestOrgs
      localStorage.setItem('hideTestOrgs', String(next))
      return { hideTestOrgs: next }
    }),
}))
