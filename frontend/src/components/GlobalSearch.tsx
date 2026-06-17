import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useStore } from '../store'
import type { Annotations, SessionData } from '../types'

const fetchSessions = (): Promise<SessionData[]> =>
  fetch('/api/sessions').then((r) => r.json())
const fetchAnnotations = (): Promise<Annotations> =>
  fetch('/api/annotations').then((r) => r.json())

interface MatchItem {
  eventId: string | null
  snippet: string
  field: 'message' | 'feedback' | 'annotation' | 'session note'
}

interface SessionResult {
  session: SessionData
  matches: MatchItem[]
}

function getSnippet(text: string, term: string, maxLen = 72): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '')
  const start = Math.max(0, idx - 28)
  const end = Math.min(text.length, idx + term.length + 36)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function computeResults(
  sessions: SessionData[],
  annotations: Annotations,
  term: string,
): SessionResult[] {
  if (!term.trim() || term.length < 2) return []
  const lower = term.toLowerCase()
  const results: SessionResult[] = []

  for (const session of sessions) {
    const matches: MatchItem[] = []

    for (const msg of session.messages) {
      if (matches.length >= 4) break

      if (msg.message_text.toLowerCase().includes(lower)) {
        matches.push({ eventId: msg.event_id, snippet: getSnippet(msg.message_text, term), field: 'message' })
        continue
      }
      if (msg.feedback_comment?.toLowerCase().includes(lower)) {
        matches.push({ eventId: msg.event_id, snippet: getSnippet(msg.feedback_comment, term), field: 'feedback' })
        continue
      }
      const msgKey = `${session.session_id}:${msg.event_id}`
      const msgAnn = annotations.messages[msgKey]
      if (msgAnn?.text.toLowerCase().includes(lower)) {
        matches.push({ eventId: msg.event_id, snippet: getSnippet(msgAnn.text, term), field: 'annotation' })
      }
    }

    const sessAnn = annotations.sessions[session.session_id]
    if (sessAnn?.text.toLowerCase().includes(lower)) {
      matches.push({ eventId: null, snippet: getSnippet(sessAnn.text, term), field: 'session note' })
    }

    if (matches.length > 0) {
      results.push({ session, matches })
    }
    if (results.length >= 10) break
  }

  return results
}

function formatSessionRange(first: string | null, last: string | null): string {
  if (!first) return ''
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (!last || first === last) return fmt(first)
  return `${fmt(first)} – ${fmt(last)}`
}

const FIELD_LABELS: Record<MatchItem['field'], string> = {
  message: 'message',
  feedback: 'feedback',
  annotation: 'note',
  'session note': 'session note',
}

export default function GlobalSearch() {
  const [rawSearch, setRawSearch] = useState('')
  const debouncedSearch = useDebounce(rawSearch, 200)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [, setSearchParams] = useSearchParams()
  const { setSelectedSession } = useStore()

  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: fetchSessions })
  const { data: annotations } = useQuery({ queryKey: ['annotations'], queryFn: fetchAnnotations })

  const results = useMemo(
    () =>
      computeResults(
        sessions ?? [],
        annotations ?? { sessions: {}, messages: {} },
        debouncedSearch,
      ),
    [sessions, annotations, debouncedSearch],
  )

  useEffect(() => {
    setOpen(results.length > 0 || (debouncedSearch.length >= 2 && results.length === 0))
  }, [results, debouncedSearch])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navigate = (sessionId: string, eventId: string | null, q: string) => {
    setSelectedSession(sessionId)
    const params: Record<string, string> = { tab: 'sessions', session: sessionId, q }
    if (eventId) params.highlight = eventId
    setSearchParams(params)
    setRawSearch('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || debouncedSearch.length >= 2) setOpen(true)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              setRawSearch('')
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search all sessions…"
          className="w-48 lg:w-64 pl-7 pr-3 py-1 text-xs bg-gray-900 border border-gray-700 rounded
                     text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500
                     focus:ring-1 focus:ring-indigo-500/50 transition-all focus:w-64 lg:focus:w-80"
        />
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[480px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">
              {debouncedSearch.length < 2
                ? 'Type at least 2 characters to search…'
                : `No results for "${debouncedSearch}"`}
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-800">
              {results.map(({ session, matches }) => (
                <div key={session.session_id} className="px-3 py-2">
                  {/* Session header */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-[10px] text-indigo-400">
                      {session.session_id.slice(0, 16)}…
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {formatSessionRange(session.first_timestamp, session.last_timestamp)}
                    </span>
                  </div>
                  {/* Matches */}
                  <div className="space-y-1">
                    {matches.map((match, mi) => (
                      <button
                        key={`${match.field}-${mi}`}
                        onClick={() => navigate(session.session_id, match.eventId, debouncedSearch)}
                        className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg
                                   hover:bg-gray-800 transition-colors group"
                      >
                        <span
                          className={`flex-none mt-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wide ${
                            match.field === 'message'
                              ? 'bg-blue-900/60 text-blue-300'
                              : match.field === 'feedback'
                              ? 'bg-red-900/60 text-red-300'
                              : 'bg-yellow-900/60 text-yellow-300'
                          }`}
                        >
                          {FIELD_LABELS[match.field]}
                        </span>
                        <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors truncate">
                          {match.snippet}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-800 px-3 py-1.5 text-[10px] text-gray-600">
            {results.length} session{results.length !== 1 ? 's' : ''} · Click to open thread · Esc to close
          </div>
        </div>
      )}
    </div>
  )
}
