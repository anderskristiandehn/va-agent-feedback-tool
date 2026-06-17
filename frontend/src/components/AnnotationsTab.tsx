import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useStore } from '../store'
import type { Annotations, SessionData, TriageStatus } from '../types'
import MultiSelect from './MultiSelect'

const fetchSessions = (): Promise<SessionData[]> =>
  fetch('/api/sessions').then((r) => r.json())
const fetchAnnotations = (): Promise<Annotations> =>
  fetch('/api/annotations').then((r) => r.json())

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateRange(first: string | null, last: string | null): string {
  if (!first) return '—'
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (!last || first === last) return fmt(first)
  return `${fmt(first)} – ${fmt(last)}`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-gray-600 text-sm">
      <div className="text-2xl mb-2">📭</div>
      {message}
    </div>
  )
}

export default function AnnotationsTab() {
  const [, setSearchParams] = useSearchParams()
  const { setSelectedSession } = useStore()

  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: fetchSessions })
  const { data: annotations } = useQuery({ queryKey: ['annotations'], queryFn: fetchAnnotations })

  const ann = annotations ?? { sessions: {}, messages: {} }
  const allSessions = sessions ?? []

  const [s1Search, setS1Search] = useState('')
  const [s2Search, setS2Search] = useState('')
  const [s1StatusFilter, setS1StatusFilter] = useState<TriageStatus[]>([])
  const [s2StatusFilter, setS2StatusFilter] = useState<TriageStatus[]>([])
  const dS1 = useDebounce(s1Search, 200)
  const dS2 = useDebounce(s2Search, 200)

  const goToSession = (sessionId: string, eventId?: string | null) => {
    setSelectedSession(sessionId)
    const params: Record<string, string> = { tab: 'sessions', session: sessionId }
    if (eventId) params.highlight = eventId
    setSearchParams(params)
  }

  // Section 1: session-level annotations
  const sessionAnnotations = useMemo(() => {
    return Object.entries(ann.sessions)
      .filter(([, a]) => a.text.trim())
      .map(([sid, a]) => {
        const session = allSessions.find((s) => s.session_id === sid)
        return { sessionId: sid, annotation: a, session }
      })
      .sort((a, b) => b.annotation.updated_at.localeCompare(a.annotation.updated_at))
  }, [ann.sessions, allSessions])

  const filteredS1 = useMemo(() => {
    return sessionAnnotations.filter((item) => {
      if (s1StatusFilter.length > 0 && !s1StatusFilter.includes(item.annotation.status ?? 'unreviewed')) return false
      if (!dS1) return true
      const lower = dS1.toLowerCase()
      return (
        item.sessionId.toLowerCase().includes(lower) ||
        item.annotation.text.toLowerCase().includes(lower)
      )
    })
  }, [sessionAnnotations, dS1, s1StatusFilter])

  // Section 2: message-level annotations
  const messageAnnotations = useMemo(() => {
    return Object.entries(ann.messages)
      .filter(([, a]) => a.text.trim())
      .map(([key, a]) => {
        const colonIdx = key.indexOf(':')
        const sessionId = key.slice(0, colonIdx)
        const eventId = key.slice(colonIdx + 1)
        const session = allSessions.find((s) => s.session_id === sessionId)
        const message = session?.messages.find((m) => m.event_id === eventId)
        return { sessionId, eventId, annotation: a, session, message }
      })
      .sort((a, b) => b.annotation.updated_at.localeCompare(a.annotation.updated_at))
  }, [ann.messages, allSessions])

  const filteredS2 = useMemo(() => {
    return messageAnnotations.filter((item) => {
      if (s2StatusFilter.length > 0 && !s2StatusFilter.includes(item.annotation.status ?? 'unreviewed')) return false
      if (!dS2) return true
      const lower = dS2.toLowerCase()
      return (
        item.sessionId.toLowerCase().includes(lower) ||
        item.annotation.text.toLowerCase().includes(lower)
      )
    })
  }, [messageAnnotations, dS2, s2StatusFilter])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-10">
        {/* Section 1 — Session annotations */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              Session annotations
              <span className="text-[11px] font-normal text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                {sessionAnnotations.length}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <MultiSelect
                options={[
                  { value: 'unreviewed', label: 'Unreviewed' },
                  { value: 'noted', label: 'Noted' },
                  { value: 'actionable', label: 'Actionable' },
                  { value: 'dismissed', label: 'Dismissed' },
                ]}
                selected={s1StatusFilter}
                onChange={(v) => setS1StatusFilter(v as TriageStatus[])}
                label="Status"
              />
              <input
                type="text"
                value={s1Search}
                onChange={(e) => setS1Search(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') setS1Search('')
                }}
                placeholder="Filter session annotations…"
                className="text-xs bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 w-56
                           text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500
                           focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          {sessionAnnotations.length === 0 ? (
            <EmptyState message="No session annotations yet. Add one from the thread view." />
          ) : filteredS1.length === 0 ? (
            <EmptyState message="No annotations match the search." />
          ) : (
            <div className="border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-48">Session</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-36">Organization</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Annotation</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-48">Session dates</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-32">Feedback</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-36">Last updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filteredS1.map(({ sessionId, annotation, session }) => (
                    <tr key={sessionId} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => goToSession(sessionId)}
                          title={sessionId}
                          className="font-mono text-indigo-400 hover:text-indigo-300 transition-colors block truncate max-w-[160px]"
                        >
                          {sessionId.slice(0, 18)}…
                        </button>
                      </td>
                      <td className="px-4 py-3 text-indigo-300/80 text-[11px] font-medium truncate max-w-[140px]">
                        {session?.org_name ?? <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 leading-relaxed">
                        {annotation.text}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-[11px]">
                        {session
                          ? formatDateRange(session.first_timestamp, session.last_timestamp)
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {session && session.escalation_count > 0 && (
                            <span className="text-[10px] bg-amber-900/60 text-amber-300 border border-amber-800/50 px-1.5 py-0.5 rounded-full">
                              🎧 {session.escalation_count}
                            </span>
                          )}
                          {session && session.thumbs_down_count > 0 && (
                            <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-800/50 px-1.5 py-0.5 rounded-full">
                              👎 {session.thumbs_down_count}
                            </span>
                          )}
                          {session && session.thumbs_up_count > 0 && (
                            <span className="text-[10px] bg-green-900/60 text-green-300 border border-green-800/50 px-1.5 py-0.5 rounded-full">
                              👍 {session.thumbs_up_count}
                            </span>
                          )}
                          {session?.has_session_feedback && (
                            <span className="text-[10px] bg-blue-900/60 text-blue-300 border border-blue-800/50 px-1.5 py-0.5 rounded-full">
                              💬
                            </span>
                          )}
                          {session && !session.thumbs_down_count && !session.thumbs_up_count && !session.has_session_feedback && (
                            <span className="text-gray-700 text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-[11px] font-mono whitespace-nowrap">
                        {formatTs(annotation.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 2 — Message annotations */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              Message annotations
              <span className="text-[11px] font-normal text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                {messageAnnotations.length}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <MultiSelect
                options={[
                  { value: 'unreviewed', label: 'Unreviewed' },
                  { value: 'noted', label: 'Noted' },
                  { value: 'actionable', label: 'Actionable' },
                  { value: 'dismissed', label: 'Dismissed' },
                ]}
                selected={s2StatusFilter}
                onChange={(v) => setS2StatusFilter(v as TriageStatus[])}
                label="Status"
              />
              <input
                type="text"
                value={s2Search}
                onChange={(e) => setS2Search(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') setS2Search('')
                }}
                placeholder="Filter message annotations…"
                className="text-xs bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 w-56
                           text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500
                           focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          {messageAnnotations.length === 0 ? (
            <EmptyState message='No message annotations yet. Add one via "Your note" below a feedback block.' />
          ) : filteredS2.length === 0 ? (
            <EmptyState message="No annotations match the search." />
          ) : (
            <div className="border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-44">Session</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-32">Organization</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-28">Speaker</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Message preview</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-12">FB</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Annotation</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 w-36">Last updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filteredS2.map(({ sessionId, eventId, annotation, session, message }) => (
                    <tr key={`${sessionId}:${eventId}`} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => goToSession(sessionId, eventId)}
                          title={sessionId}
                          className="font-mono text-indigo-400 hover:text-indigo-300 transition-colors block truncate max-w-[140px]"
                        >
                          {sessionId.slice(0, 14)}…
                        </button>
                      </td>
                      <td className="px-4 py-3 text-indigo-300/80 text-[11px] font-medium truncate max-w-[120px]">
                        {session?.org_name ?? <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {message?.speaker ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                        <span className="line-clamp-2 leading-snug">
                          {message ? message.message_text.slice(0, 80) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-base leading-none">
                        {message?.feedback_type === 'thumbs_down'
                          ? '👎'
                          : message?.feedback_type === 'thumbs_up'
                          ? '👍'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-300 leading-relaxed">
                        {annotation.text}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-[11px] font-mono whitespace-nowrap">
                        {formatTs(annotation.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
