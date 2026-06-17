import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AllFeedbackTab from './components/AllFeedbackTab'
import AnnotationsTab from './components/AnnotationsTab'
import GlobalSearch from './components/GlobalSearch'
import OrgsTab from './components/OrgsTab'
import SessionList from './components/SessionList'
import ThreadView from './components/ThreadView'
import { useStore } from './store'
import type { Annotations, MetaData, SessionData } from './types'

const fetchSessions = (): Promise<SessionData[]> =>
  fetch('/api/sessions').then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  })

const fetchMeta = (): Promise<MetaData> =>
  fetch('/api/meta').then((r) => r.json())

const fetchAnnotations = (): Promise<Annotations> =>
  fetch('/api/annotations').then((r) => r.json())

type Tab = 'sessions' | 'feedback' | 'annotations' | 'orgs'

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'sessions', label: 'Sessions', key: '1' },
  { id: 'feedback', label: 'All Feedback', key: '2' },
  { id: 'annotations', label: 'Annotations', key: '3' },
  { id: 'orgs', label: 'Organizations', key: '4' },
]

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedSessionId, setSelectedSession, darkMode, toggleDarkMode } = useStore()
  const tabParam = (searchParams.get('tab') as Tab) || 'sessions'

  const { data: sessions, isLoading, isError, refetch: refetchSessions, isFetching: isFetchingSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
  })
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: fetchMeta })
  const { data: annotations } = useQuery({ queryKey: ['annotations'], queryFn: fetchAnnotations })

  // Sync URL ?session= param to store on first mount
  const synced = useRef(false)
  useEffect(() => {
    if (synced.current) return
    synced.current = true
    const urlSession = searchParams.get('session')
    if (urlSession) setSelectedSession(urlSession)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = useCallback(
    (tab: Tab) => {
      const params: Record<string, string> = { tab }
      if (selectedSessionId) params.session = selectedSessionId
      setSearchParams(params)
    },
    [selectedSessionId, setSearchParams],
  )

  // Tab keyboard shortcuts: 1 / 2 / 3
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '1') setTab('sessions')
      if (e.key === '2') setTab('feedback')
      if (e.key === '3') setTab('annotations')
      if (e.key === '4') setTab('orgs')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setTab])

  const handleSelectSession = (id: string) => {
    setSelectedSession(id)
    setSearchParams({ tab: 'sessions', session: id })
  }

  const selectedSession = sessions?.find((s) => s.session_id === selectedSessionId) ?? null

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Top nav */}
      <header className="flex-none flex items-center gap-0 border-b border-gray-800 px-4 h-12">
        <span className="text-sm font-semibold text-indigo-400 mr-6 tracking-wide flex-none">
          Feedback Review
        </span>
        <nav className="flex h-full">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              title={`Switch to ${tab.label} (${tab.key})`}
              className={`px-4 h-full text-sm border-b-2 transition-colors ${
                tabParam === tab.id
                  ? 'border-indigo-500 text-gray-100'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Global search */}
        <div className="ml-6 flex-1 flex justify-end items-center gap-4">
          <GlobalSearch />
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-sm transition-colors flex-none"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Tab content */}
      <main className="flex-1 min-h-0">
        {tabParam === 'sessions' && (
          <div className="flex h-full">
            <div className="w-[35%] min-w-[280px] max-w-[480px] flex-none border-r border-gray-800 flex flex-col">
              <SessionList
                sessions={sessions ?? []}
                annotations={annotations ?? { sessions: {}, messages: {} }}
                isLoading={isLoading}
                isError={isError}
                isFetching={isFetchingSessions}
                onRefresh={refetchSessions}
                meta={meta ?? { app_names: [], locales: [], categories: [], org_names: [] }}
                selectedSessionId={selectedSessionId}
                onSelect={handleSelectSession}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <ThreadView
                session={selectedSession}
                annotations={annotations ?? { sessions: {}, messages: {} }}
              />
            </div>
          </div>
        )}

        {tabParam === 'feedback' && <AllFeedbackTab />}

        {tabParam === 'annotations' && <AnnotationsTab />}

        {tabParam === 'orgs' && <OrgsTab />}
      </main>
    </div>
  )
}
