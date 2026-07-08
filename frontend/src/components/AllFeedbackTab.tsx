import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useStore } from '../store'
import type { Annotations, FeedbackEntry, TriageStatus } from '../types'
import MultiSelect from './MultiSelect'

const fetchFeedback = (): Promise<FeedbackEntry[]> =>
  fetch('/api/feedback').then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  })

type SortCol = 'timestamp' | 'type' | 'session_id' | 'category'
type SortDir = 'asc' | 'desc'
type TypeFilter = 'all' | 'thumbs_down' | 'thumbs_up' | 'session'
type AnnFilter = 'all' | 'with' | 'without'

function getAnnotation(entry: FeedbackEntry, annotations: Annotations): string {
  if (entry.type === 'message' && entry.event_id) {
    return annotations.messages[`${entry.session_id}:${entry.event_id}`]?.text ?? ''
  }
  return annotations.sessions[entry.session_id]?.text ?? ''
}

function getStatus(entry: FeedbackEntry, annotations: Annotations): TriageStatus {
  if (entry.type === 'message' && entry.event_id) {
    return annotations.messages[`${entry.session_id}:${entry.event_id}`]?.status ?? 'unreviewed'
  }
  return annotations.sessions[entry.session_id]?.status ?? 'unreviewed'
}

function typeIcon(entry: FeedbackEntry): string {
  if (entry.type === 'session') return '💬'
  if (entry.feedback_type === 'thumbs_down') return '👎'
  if (entry.feedback_type === 'thumbs_up') return '👍'
  return '—'
}

function escapeCSV(val: string | null | undefined): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function formatTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Inline annotation cell — transparent, auto-saves on blur
function InlineAnnotation({
  sessionId,
  eventId,
  initialValue,
}: {
  sessionId: string
  eventId: string | null
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)
  const prevSaved = useRef(initialValue)
  const qc = useQueryClient()

  useEffect(() => {
    setValue(initialValue)
    prevSaved.current = initialValue
  }, [initialValue])

  const save = async (text: string) => {
    if (text === prevSaved.current) return
    prevSaved.current = text
    const url =
      eventId
        ? `/api/annotations/message/${sessionId}/${eventId}`
        : `/api/annotations/session/${sessionId}`
    try {
      if (text.trim()) {
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      } else {
        await fetch(url, { method: 'DELETE' })
      }
      qc.invalidateQueries({ queryKey: ['annotations'] })
    } catch {
      // silent
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => save(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      placeholder="Add note…"
      className="w-full bg-transparent text-xs text-gray-600 placeholder-gray-300
                 border-b border-transparent hover:border-gray-300 focus:border-indigo-400
                 focus:outline-none py-0.5 transition-colors min-w-[80px]"
    />
  )
}

// Sort header button
function SortTh({
  col,
  label,
  sort,
  setSort,
  className = '',
}: {
  col: SortCol
  label: string
  sort: { col: SortCol; dir: SortDir }
  setSort: (s: { col: SortCol; dir: SortDir }) => void
  className?: string
}) {
  const active = sort.col === col
  return (
    <th
      className={`px-3 py-2 text-left text-[11px] font-medium text-gray-500 select-none ${className}`}
    >
      <button
        onClick={() =>
          setSort({ col, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })
        }
        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
      >
        {label}
        <span className="text-[10px]">
          {active ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </button>
    </th>
  )
}

interface Props {
  annotations: Annotations
}

export default function AllFeedbackTab({ annotations }: Props) {
  const [, setSearchParams] = useSearchParams()
  const { setSelectedSession } = useStore()

  const { data: feedbackData, isLoading, isError } = useQuery({
    queryKey: ['feedback'],
    queryFn: fetchFeedback,
  })

  const ann = annotations

  const allOrgs = useMemo(() => {
    const orgs = new Set<string>()
    feedbackData?.forEach((e) => { if (e.org_name) orgs.add(e.org_name) })
    return Array.from(orgs).sort()
  }, [feedbackData])

  const [rawSearch, setRawSearch] = useState('')
  const debouncedSearch = useDebounce(rawSearch, 200)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [appFilter, setAppFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [annFilter, setAnnFilter] = useState<AnnFilter>('all')
  const [statusFilter, setStatusFilter] = useState<TriageStatus[]>([])
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'timestamp', dir: 'desc' })

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    feedbackData?.forEach((e) => {
      if (e.category) cats.add(e.category)
    })
    return Array.from(cats).sort()
  }, [feedbackData])

  const allApps = useMemo(() => {
    const apps = new Set<string>()
    feedbackData?.forEach((e) => {
      if (e.app_name) apps.add(e.app_name)
    })
    return Array.from(apps).sort()
  }, [feedbackData])

  const filtered = useMemo(() => {
    const lower = debouncedSearch.toLowerCase()
    return (feedbackData ?? []).filter((e) => {
      if (typeFilter === 'thumbs_down' && e.feedback_type !== 'thumbs_down') return false
      if (typeFilter === 'thumbs_up' && e.feedback_type !== 'thumbs_up') return false
      if (typeFilter === 'session' && e.type !== 'session') return false

      if (selectedCategories.length > 0 && (!e.category || !selectedCategories.includes(e.category)))
        return false

      if (appFilter && e.app_name !== appFilter) return false
      if (orgFilter && e.org_name !== orgFilter) return false

      if (dateFrom) {
        if (!e.timestamp || new Date(e.timestamp) < new Date(dateFrom)) return false
      }
      if (dateTo) {
        const to = new Date(dateTo)
        to.setDate(to.getDate() + 1)
        if (!e.timestamp || new Date(e.timestamp) >= to) return false
      }

      if (annFilter !== 'all') {
        const text = getAnnotation(e, ann)
        if (annFilter === 'with' && !text) return false
        if (annFilter === 'without' && !!text) return false
      }

      if (lower) {
        const text = getAnnotation(e, ann)
        const matchDetails = e.details?.toLowerCase().includes(lower)
        const matchPreview = e.message_preview?.toLowerCase().includes(lower)
        const matchAnnotation = text.toLowerCase().includes(lower)
        if (!matchDetails && !matchPreview && !matchAnnotation) return false
      }

      if (statusFilter.length > 0) {
        const st = getStatus(e, ann)
        if (!statusFilter.includes(st)) return false
      }

      return true
    })
  }, [feedbackData, typeFilter, selectedCategories, appFilter, dateFrom, dateTo, annFilter, statusFilter, debouncedSearch, ann])

  const sorted = useMemo(() => {
    const s = [...filtered]
    const { col, dir } = sort
    s.sort((a, b) => {
      let va = ''
      let vb = ''
      if (col === 'timestamp') { va = a.timestamp ?? ''; vb = b.timestamp ?? '' }
      else if (col === 'type') { va = a.type + (a.feedback_type ?? ''); vb = b.type + (b.feedback_type ?? '') }
      else if (col === 'session_id') { va = a.session_id; vb = b.session_id }
      else if (col === 'category') { va = a.category ?? ''; vb = b.category ?? '' }
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return s
  }, [filtered, sort])

  const hasActiveFilters =
    typeFilter !== 'all' ||
    selectedCategories.length > 0 ||
    appFilter ||
    orgFilter ||
    dateFrom ||
    dateTo ||
    annFilter !== 'all' ||
    statusFilter.length > 0 ||
    debouncedSearch

  const clearFilters = () => {
    setRawSearch('')
    setTypeFilter('all')
    setSelectedCategories([])
    setAppFilter('')
    setOrgFilter('')
    setDateFrom('')
    setDateTo('')
    setAnnFilter('all')
    setStatusFilter([])
  }

  const exportCSV = () => {
    const headers = [
      'type', 'feedback_type', 'session_id', 'event_id', 'timestamp',
      'speaker', 'app_name', 'organization', 'category', 'details', 'message_preview', 'annotation',
    ]
    const rows = sorted.map((e) => [
      e.type,
      e.feedback_type,
      e.session_id,
      e.event_id,
      e.timestamp,
      e.speaker,
      e.app_name,
      e.org_name ?? '',
      e.category,
      e.details,
      e.message_preview,
      getAnnotation(e, ann),
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const goToSession = (sessionId: string, eventId?: string | null) => {
    setSelectedSession(sessionId)
    const params: Record<string, string> = { tab: 'sessions', session: sessionId }
    if (eventId) params.highlight = eventId
    setSearchParams(params)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filter bar */}
      <div className="flex-none border-b border-gray-200 bg-white px-4 py-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Text search */}
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setRawSearch('')
            }}
            placeholder="Search comments, previews, notes…"
            className="text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 w-56
                       text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-400
                       focus:ring-1 focus:ring-indigo-400/30 transition-colors"
          />

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          >
            <option value="all">All types</option>
            <option value="thumbs_down">👎 Thumbs down</option>
            <option value="thumbs_up">👍 Thumbs up</option>
            <option value="session">💬 Session feedback</option>
          </select>

          {/* App filter */}
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          >
            <option value="">All apps</option>
            {allApps.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Org filter */}
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          >
            <option value="">All organizations</option>
            {allOrgs.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          {/* Category multi-select */}
          <MultiSelect
            options={allCategories.map((c) => ({ value: c, label: c }))}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            label="Category"
          />

          {/* Status filter */}
          <MultiSelect
            options={[
              { value: 'unreviewed', label: 'Unreviewed' },
              { value: 'noted', label: 'Noted' },
              { value: 'actionable', label: 'Actionable' },
              { value: 'dismissed', label: 'Dismissed' },
            ]}
            selected={statusFilter}
            onChange={(v) => setStatusFilter(v as TriageStatus[])}
            label="Status"
          />

          {/* Annotation filter */}
          <select
            value={annFilter}
            onChange={(e) => setAnnFilter(e.target.value as AnnFilter)}
            className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                       focus:outline-none focus:border-indigo-400 transition-colors cursor-pointer"
          >
            <option value="all">All notes</option>
            <option value="with">With note</option>
            <option value="without">Without note</option>
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                         focus:outline-none focus:border-indigo-400 transition-colors"
            />
            <span className="text-xs text-gray-500">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700
                         focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
        </div>

        {/* Count row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            {isLoading ? 'Loading…' : (
              <>
                <span className="text-gray-700 font-medium">{sorted.length}</span>
                {hasActiveFilters && feedbackData && sorted.length !== feedbackData.length && (
                  <> / {feedbackData.length}</>
                )}{' '}
                entries
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[11px] text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Clear filters
              </button>
            )}
            <button
              onClick={exportCSV}
              disabled={sorted.length === 0}
              className="text-[11px] px-2.5 py-1 bg-white border border-gray-300 rounded
                         text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isError && (
          <div className="p-8 text-center text-red-500 text-sm">
            Failed to load feedback data. Check backend connection.
          </div>
        )}

        {!isLoading && !isError && sorted.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">
            {feedbackData?.length === 0 ? 'No feedback entries found.' : 'No entries match the current filters.'}
          </div>
        )}

        {(isLoading || sorted.length > 0) && (
          <table className="w-full min-w-[900px] text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-10">Type</th>
                <SortTh col="session_id" label="Session" sort={sort} setSort={setSort} className="w-36" />
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-32">Organization</th>
                <SortTh col="timestamp" label="Timestamp" sort={sort} setSort={setSort} className="w-40" />
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-28">Speaker</th>
                <SortTh col="category" label="Category" sort={sort} setSort={setSort} className="w-24" />
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">Comment</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-40">Note</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-3 bg-gray-200 animate-pulse rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map((entry) => {
                    const annotation = getAnnotation(entry, ann)
                    return (
                      <tr
                        key={`${entry.session_id}-${entry.event_id ?? 'sess'}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-base leading-none">{typeIcon(entry)}</td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => goToSession(entry.session_id, entry.event_id)}
                            title={entry.session_id}
                            className="font-mono text-indigo-600 hover:text-indigo-500 transition-colors truncate max-w-[120px] block"
                          >
                            {entry.session_id.slice(0, 14)}…
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-indigo-600 text-[11px] font-medium truncate max-w-[120px]">
                          {entry.org_name ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 font-mono whitespace-nowrap">
                          {formatTs(entry.timestamp)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">{entry.speaker ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {entry.category ? (
                            <span className="font-mono text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded text-[10px]">
                              {entry.category}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-[200px]">
                          <span className="line-clamp-2 leading-snug">{entry.details ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[160px]">
                          <InlineAnnotation
                            sessionId={entry.session_id}
                            eventId={entry.event_id}
                            initialValue={annotation}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 max-w-[200px]">
                          <span className="line-clamp-2 leading-snug">
                            {entry.message_preview ?? '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
