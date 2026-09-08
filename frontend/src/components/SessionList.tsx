import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useStore, type FeedbackFilter, type EscalationFilter, type SortOrder } from '../store'
import type { Annotations, MetaData, SessionData, TriageStatus } from '../types'
import { downloadSessionsHtml } from '../utils/exportSessionHtml'
import MultiSelect from './MultiSelect'

interface Props {
  sessions: SessionData[]
  annotations: Annotations
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  onRefresh: () => void
  meta: MetaData
  selectedSessionId: string | null
  onSelect: (id: string) => void
}

function formatDateRange(first: string | null, last: string | null): string {
  if (!first) return '—'
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (!last || first === last) return fmt(first)
  return `${fmt(first)} → ${fmt(last)}`
}

function SessionSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-gray-200 animate-pulse" />
      ))}
    </div>
  )
}

export default function SessionList({
  sessions,
  annotations,
  isLoading,
  isError,
  isFetching,
  onRefresh,
  meta,
  selectedSessionId,
  onSelect,
}: Props) {
  const [, setSearchParams] = useSearchParams()
  const { filters, setFilter, clearFilters, hideTestOrgs } = useStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [rawSearch, setRawSearch] = useState(filters.searchTerm)
  const debouncedSearch = useDebounce(rawSearch, 200)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setFilter('searchTerm', debouncedSearch)
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSessions = useMemo(() => {
    const { feedbackFilter, escalationFilter, statusFilter, categoryFilter, appNameFilter, localeFilter, orgFilter, dateFrom, dateTo, sortOrder } = filters
    const term = debouncedSearch.toLowerCase()

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null
    // dateTo is a date (no time), so include the full day
    const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null

    const filtered = sessions.filter((s) => {
      if (hideTestOrgs && s.org_is_test) return false

      if (term) {
        const matchId = s.session_id.toLowerCase().includes(term)
        const matchUser = s.user_id?.toLowerCase().includes(term)
        const matchOrg = s.org_name?.toLowerCase().includes(term) || s.org_url?.toLowerCase().includes(term)
        if (!matchId && !matchUser && !matchOrg) return false
      }

      if (orgFilter && s.org_id !== orgFilter) return false

      if (feedbackFilter === 'thumbs_down' && s.thumbs_down_count === 0) return false
      if (feedbackFilter === 'thumbs_up' && s.thumbs_up_count === 0) return false
      if (feedbackFilter === 'session_feedback' && !s.has_session_feedback) return false
      if (
        feedbackFilter === 'any' &&
        s.thumbs_down_count === 0 &&
        s.thumbs_up_count === 0 &&
        !s.has_session_feedback
      )
        return false
      if (
        feedbackFilter === 'none' &&
        (s.thumbs_down_count > 0 || s.thumbs_up_count > 0 || s.has_session_feedback)
      )
        return false

      if (escalationFilter === 'escalated' && s.escalation_count === 0) return false
      if (escalationFilter === 'not_escalated' && s.escalation_count > 0) return false

      if (statusFilter.length > 0) {
        const statuses = [
          ...s.messages.filter((m) => m.has_feedback).map(
            (m) => annotations.messages[`${s.session_id}:${m.event_id}`]?.status ?? 'unreviewed'
          ),
          ...(s.session_feedback
            ? [annotations.sessions[s.session_id]?.status ?? 'unreviewed']
            : []),
        ]
        if (!statuses.some((st) => statusFilter.includes(st as TriageStatus))) return false
      }

      if (categoryFilter && !s.categories.includes(categoryFilter)) return false
      if (appNameFilter && s.app_name !== appNameFilter) return false
      if (localeFilter && !s.messages.some((m) => m.locale === localeFilter)) return false

      if (fromMs !== null || toMs !== null) {
        const sessionTs = s.last_timestamp ? new Date(s.last_timestamp).getTime() : null
        if (sessionTs === null) return false
        if (fromMs !== null && sessionTs < fromMs) return false
        if (toMs !== null && sessionTs > toMs) return false
      }

      return true
    })

    filtered.sort((a, b) => {
      const aTs = a.last_timestamp ?? ''
      const bTs = b.last_timestamp ?? ''
      return sortOrder === 'newest' ? bTs.localeCompare(aTs) : aTs.localeCompare(bTs)
    })

    return filtered
  }, [sessions, filters, annotations, debouncedSearch, hideTestOrgs])

  const hasActiveFilters =
    debouncedSearch ||
    filters.feedbackFilter !== 'all' ||
    filters.escalationFilter !== 'all' ||
    filters.statusFilter.length > 0 ||
    filters.categoryFilter ||
    filters.appNameFilter ||
    filters.localeFilter ||
    filters.orgFilter ||
    filters.dateFrom ||
    filters.dateTo

  const copyId = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      navigator.clipboard.writeText(id).then(() => {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 1500)
      })
    },
    [],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const idx = filteredSessions.findIndex((s) => s.session_id === selectedSessionId)
        let next = idx
        if (e.key === 'j' || e.key === 'J') next = Math.min(idx + 1, filteredSessions.length - 1)
        else next = Math.max(idx - 1, 0)
        if (next >= 0 && filteredSessions[next]) {
          const target = filteredSessions[next]
          onSelect(target.session_id)
          setSearchParams({ tab: 'sessions', session: target.session_id })
          setTimeout(() => {
            cardRefs.current.get(target.session_id)?.scrollIntoView({ block: 'nearest' })
          }, 0)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredSessions, selectedSessionId, onSelect, setSearchParams])

  return (
    <div className="flex flex-col h-full">
      {/* Sticky filters */}
      <div className="flex-none border-b border-gray-200 bg-white px-3 py-2 space-y-2">
        {/* Search */}
        <input
          ref={searchRef}
          type="text"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              setRawSearch('')
              e.currentTarget.blur()
            }
          }}
          placeholder="Search session ID or user ID… (F)"
          className="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5
                     text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-400
                     focus:ring-1 focus:ring-indigo-400/30 transition-colors"
        />

        {/* Dropdowns row 1 */}
        <div className="flex gap-1.5">
          <Select
            value={filters.feedbackFilter}
            onChange={(v) => setFilter('feedbackFilter', v as FeedbackFilter)}
            options={[
              { value: 'all', label: 'All feedback' },
              { value: 'thumbs_down', label: '👎 Thumbs down' },
              { value: 'thumbs_up', label: '👍 Thumbs up' },
              { value: 'session_feedback', label: '💬 Session feedback' },
              { value: 'any', label: 'Has any feedback' },
              { value: 'none', label: 'No feedback' },
            ]}
            className="flex-1"
          />
          <Select
            value={filters.escalationFilter}
            onChange={(v) => setFilter('escalationFilter', v as EscalationFilter)}
            options={[
              { value: 'all', label: 'All escalations' },
              { value: 'escalated', label: '🎧 Escalated' },
              { value: 'not_escalated', label: 'Not escalated' },
            ]}
            className="flex-1"
          />
        </div>

        {/* Dropdowns row 2 */}
        <div className="flex gap-1.5">
          <Select
            value={filters.appNameFilter}
            onChange={(v) => setFilter('appNameFilter', v)}
            options={[
              { value: '', label: 'All apps' },
              ...meta.app_names.map((a) => ({ value: a, label: a })),
            ]}
            className="flex-1"
          />
          <Select
            value={filters.localeFilter}
            onChange={(v) => setFilter('localeFilter', v)}
            options={[
              { value: '', label: 'All locales' },
              ...meta.locales.map((l) => ({ value: l, label: l })),
            ]}
            className="flex-1"
          />
        </div>

        {/* Org filter row */}
        <div className="flex gap-1.5">
          <Select
            value={filters.orgFilter}
            onChange={(v) => setFilter('orgFilter', v)}
            options={[
              { value: '', label: 'All organizations' },
              ...meta.orgs
                .filter((o) => !hideTestOrgs || !o.org_is_test)
                .map((o) => ({ value: o.org_id, label: `${o.org_name} (${o.org_id})` })),
            ]}
            className="flex-1"
          />
        </div>

        {/* Dropdowns row 3 */}
        <div className="flex gap-1.5 items-center">
          <Select
            value={filters.categoryFilter}
            onChange={(v) => setFilter('categoryFilter', v)}
            options={[
              { value: '', label: 'All categories' },
              ...meta.categories.map((c) => ({ value: c, label: c })),
            ]}
            className="flex-1"
          />
          <MultiSelect
            options={[
              { value: 'unreviewed', label: 'Unreviewed' },
              { value: 'noted', label: 'Noted' },
              { value: 'actionable', label: 'Actionable' },
              { value: 'dismissed', label: 'Dismissed' },
            ]}
            selected={filters.statusFilter}
            onChange={(v) => setFilter('statusFilter', v as TriageStatus[])}
            label="Status"
          />
        </div>

        {/* Date range row */}
        <div className="flex gap-1.5 items-center">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilter('dateFrom', e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            title="From date"
            className="flex-1 text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          />
          <span className="text-[11px] text-gray-400 flex-shrink-0">–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilter('dateTo', e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            title="To date"
            className="flex-1 text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          />
          <button
            onClick={() => setFilter('sortOrder', filters.sortOrder === 'newest' ? 'oldest' : 'newest')}
            title={filters.sortOrder === 'newest' ? 'Sorted: newest first' : 'Sorted: oldest first'}
            className="flex-shrink-0 text-[11px] px-2 py-1.5 rounded border border-gray-300 bg-white
                       text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors whitespace-nowrap"
          >
            {filters.sortOrder === 'newest' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>

        {/* Count + clear + refresh */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">
            {isLoading ? (
              'Loading…'
            ) : (
              <>
                <span className="text-gray-700 font-medium">{filteredSessions.length}</span>
                {hasActiveFilters && sessions.length !== filteredSessions.length && (
                  <> / {sessions.length}</>
                )}{' '}
                session{filteredSessions.length !== 1 ? 's' : ''}
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setRawSearch('')
                  clearFilters()
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Clear filters
              </button>
            )}
            <button
              onClick={() => downloadSessionsHtml(filteredSessions, annotations)}
              disabled={filteredSessions.length === 0}
              title="Download all filtered sessions as a shareable HTML file"
              className="text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white
                         text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              ⬇ Download all
            </button>
            <button
              onClick={() => onRefresh()}
              disabled={isFetching}
              title="Refresh sessions"
              className={`text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white
                         text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isFetching ? '↻ …' : '↻'}
            </button>
          </div>
        </div>
      </div>

      {/* Session list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && <SessionSkeleton />}

        {isError && (
          <div className="p-4 text-center text-red-500 text-sm">
            Failed to load sessions. Check backend connection.
          </div>
        )}

        {!isLoading && !isError && filteredSessions.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            {sessions.length === 0 ? 'No sessions found.' : 'No sessions match the current filters.'}
          </div>
        )}

        {filteredSessions.map((session) => {
          const isSelected = session.session_id === selectedSessionId
          const hasAnnotation = !!annotations.sessions[session.session_id]
          const isCopied = copiedId === session.session_id

          return (
            <div
              key={session.session_id}
              ref={(el) => {
                if (el) cardRefs.current.set(session.session_id, el)
                else cardRefs.current.delete(session.session_id)
              }}
              onClick={() => onSelect(session.session_id)}
              className={`rounded-lg px-3 py-2.5 cursor-pointer border transition-all select-none ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {/* Top row: org name (header) + badges */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <div
                    title={session.org_id ?? undefined}
                    className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-900'}`}
                  >
                    {session.org_name ?? session.session_id.slice(0, 20) + '…'}
                    {session.org_country && (
                      <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                        {session.org_country}
                      </span>
                    )}
                    {session.org_is_test && (
                      <span className="ml-1 text-[10px] font-normal text-purple-600 bg-purple-50 border border-purple-200 px-1 py-0.5 rounded">
                        test
                      </span>
                    )}
                    {session.org_is_trial && (
                      <span className="ml-1 text-[10px] font-normal text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                        trial
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {hasAnnotation && (
                    <span title="Has annotation" className="text-[11px] text-yellow-500">
                      📝
                    </span>
                  )}
                  {session.escalation_count > 0 && (
                    <span title="Escalated to support" className="text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full">
                      🎧 {session.escalation_count}
                    </span>
                  )}
                  {session.thumbs_down_count > 0 && (
                    <span title="Thumbs down feedback" className="text-[10px] font-medium bg-red-100 text-red-600 border border-red-300 px-1.5 py-0.5 rounded-full">
                      👎 {session.thumbs_down_count}
                    </span>
                  )}
                  {session.thumbs_up_count > 0 && (
                    <span title="Thumbs up feedback" className="text-[10px] font-medium bg-green-100 text-green-600 border border-green-300 px-1.5 py-0.5 rounded-full">
                      👍 {session.thumbs_up_count}
                    </span>
                  )}
                  {session.has_session_feedback && (
                    <span title="Session feedback" className="text-[10px] font-medium bg-blue-100 text-blue-600 border border-blue-300 px-1.5 py-0.5 rounded-full">
                      💬
                    </span>
                  )}
                </div>
              </div>

              {/* Session ID row */}
              <div className="flex items-center gap-1.5 mb-1">
                <button
                  title={isCopied ? 'Copied!' : 'Click to copy full session ID'}
                  onClick={(e) => copyId(e, session.session_id)}
                  className={`font-mono text-[10px] truncate max-w-[180px] transition-colors ${
                    isCopied ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {isCopied ? '✓ copied' : session.session_id.slice(0, 20) + '…'}
                </button>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[10px] text-gray-400">
                  {formatDateRange(session.first_timestamp, session.last_timestamp)}
                </span>
              </div>

              {/* Triage status summary */}
              {(() => {
                const counts: Partial<Record<TriageStatus, number>> = {}
                session.messages.filter((m) => m.has_feedback).forEach((m) => {
                  const st = (annotations.messages[`${session.session_id}:${m.event_id}`]?.status ?? 'unreviewed') as TriageStatus
                  if (st !== 'unreviewed') counts[st] = (counts[st] ?? 0) + 1
                })
                if (session.session_feedback) {
                  const st = (annotations.sessions[session.session_id]?.status ?? 'unreviewed') as TriageStatus
                  if (st !== 'unreviewed') counts[st] = (counts[st] ?? 0) + 1
                }
                const entries = Object.entries(counts) as [TriageStatus, number][]
                if (entries.length === 0) return null
                return (
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {entries.map(([status, count]) => (
                      <span
                        key={status}
                        title={status}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                          status === 'noted'
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : status === 'actionable'
                            ? 'bg-amber-50 border-amber-200 text-amber-600'
                            : 'bg-gray-100 border-gray-300 text-gray-500'
                        }`}
                      >
                        {status === 'noted' ? '✓' : status === 'actionable' ? '⚡' : '✕'} {count} {status}
                      </span>
                    ))}
                  </div>
                )
              })()}

              {/* Bottom row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-400 font-mono">
                  {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
                </span>
                {session.speakers.map((sp) => (
                  <span
                    key={sp}
                    title={sp}
                    className="text-[10px] bg-gray-100 border border-gray-300 text-gray-500 px-1 py-0.5 rounded font-mono"
                  >
                    {sp === 'User' ? 'U' : sp.slice(0, 3).toUpperCase()}
                  </span>
                ))}
                {session.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] bg-orange-50 border border-orange-200 text-orange-600 px-1.5 py-0.5 rounded"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                  focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer ${className}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
