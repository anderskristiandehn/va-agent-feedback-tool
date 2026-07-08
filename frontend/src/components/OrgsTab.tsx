import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import type { SessionData } from '../types'

const fetchSessions = (): Promise<SessionData[]> =>
  fetch('/api/sessions').then((r) => r.json())

type SortCol =
  | 'org_name'
  | 'sessions'
  | 'avg_msgs'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'escalations'
  | 'comments'
type SortDir = 'asc' | 'desc'

interface OrgRow {
  org_id: string | null
  org_name: string
  org_country: string | null
  org_plan: string | null
  org_is_trial: boolean | null
  org_created: string | null
  sessions: number
  avg_msgs: number
  thumbs_up: number
  thumbs_down: number
  escalations: number
  comments: number
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function SortTh({
  col, label, sort, setSort, className = '',
}: {
  col: SortCol
  label: string
  sort: { col: SortCol; dir: SortDir }
  setSort: (s: { col: SortCol; dir: SortDir }) => void
  className?: string
}) {
  const active = sort.col === col
  return (
    <th className={`px-3 py-2 text-left text-[11px] font-medium text-gray-500 select-none ${className}`}>
      <button
        onClick={() => setSort({ col, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
        className="flex items-center gap-1 hover:text-gray-700 transition-colors"
      >
        {label}
        <span className="text-[10px]">{active ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}</span>
      </button>
    </th>
  )
}

export default function OrgsTab() {
  const { setFilter } = useStore()
  const [, setSearchParams] = useSearchParams()
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'sessions', dir: 'desc' })
  const [search, setSearch] = useState('')

  const { data: sessions, isLoading } = useQuery({ queryKey: ['sessions'], queryFn: fetchSessions })

  const orgs = useMemo<OrgRow[]>(() => {
    if (!sessions) return []

    const map = new Map<string, OrgRow>()

    for (const s of sessions) {
      const name = s.org_name ?? '(unknown)'
      if (!map.has(name)) {
        map.set(name, {
          org_id: s.org_id,
          org_name: name,
          org_country: s.org_country,
          org_plan: s.org_plan,
          org_is_trial: s.org_is_trial,
          org_created: s.org_created,
          sessions: 0,
          avg_msgs: 0,
          thumbs_up: 0,
          thumbs_down: 0,
          escalations: 0,
          comments: 0,
        })
      }
      const row = map.get(name)!
      row.sessions += 1
      row.avg_msgs += s.message_count
      row.thumbs_up += s.thumbs_up_count
      row.thumbs_down += s.thumbs_down_count
      row.escalations += s.escalation_count
      if (s.has_session_feedback) row.comments += 1
      s.messages.forEach((m) => { if (m.has_feedback && m.feedback_comment) row.comments += 1 })
    }

    // Finalize avg
    for (const row of map.values()) {
      row.avg_msgs = row.sessions > 0 ? Math.round((row.avg_msgs / row.sessions) * 10) / 10 : 0
    }

    return Array.from(map.values())
  }, [sessions])

  const filtered = useMemo(() => {
    const lower = search.toLowerCase()
    return orgs.filter((o) =>
      !lower || o.org_name.toLowerCase().includes(lower) || (o.org_country ?? '').toLowerCase().includes(lower)
    )
  }, [orgs, search])

  const sorted = useMemo(() => {
    const s = [...filtered]
    const { col, dir } = sort
    s.sort((a, b) => {
      const va = a[col] ?? ''
      const vb = b[col] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va
      }
      return dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
    return s
  }, [filtered, sort])

  const goToSessions = (orgName: string) => {
    if (orgName === '(unknown)') return
    setFilter('orgFilter', orgName)
    setSearchParams({ tab: 'sessions' })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex-none border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setSearch('') }}
          placeholder="Search organizations…"
          className="text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 w-56
                     text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-400
                     focus:ring-1 focus:ring-indigo-400/30 transition-colors"
        />
        <span className="text-[11px] text-gray-500">
          {isLoading ? 'Loading…' : (
            <><span className="text-gray-700 font-medium">{sorted.length}</span> organizations</>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!isLoading && sorted.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">No organizations found.</div>
        )}

        {(isLoading || sorted.length > 0) && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <SortTh col="org_name" label="Organization" sort={sort} setSort={setSort} className="w-48" />
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-32">Org ID</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-12">Country</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-24">Plan</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 w-28">Created</th>
                <SortTh col="sessions" label="Sessions" sort={sort} setSort={setSort} className="w-24" />
                <SortTh col="avg_msgs" label="Avg msgs" sort={sort} setSort={setSort} className="w-24" />
                <SortTh col="thumbs_up" label="👍" sort={sort} setSort={setSort} className="w-16" />
                <SortTh col="thumbs_down" label="👎" sort={sort} setSort={setSort} className="w-16" />
                <SortTh col="escalations" label="🎧" sort={sort} setSort={setSort} className="w-16" />
                <SortTh col="comments" label="Comments" sort={sort} setSort={setSort} className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-3 bg-gray-200 animate-pulse rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map((org) => (
                    <tr key={org.org_name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => goToSessions(org.org_name)}
                          disabled={org.org_name === '(unknown)'}
                          className="text-indigo-600 hover:text-indigo-500 transition-colors font-medium text-left disabled:text-gray-400 disabled:cursor-default"
                        >
                          {org.org_name}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400 select-all">{org.org_id ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{org.org_country ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {org.org_plan ? (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-600">{org.org_plan}</span>
                            {org.org_is_trial && (
                              <span className="text-[10px] text-amber-600 border border-amber-200 bg-amber-50 px-1 py-0.5 rounded">trial</span>
                            )}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px]">{formatDate(org.org_created)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-800 font-medium">{org.sessions}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{org.avg_msgs}</td>
                      <td className="px-3 py-2.5">
                        {org.thumbs_up > 0
                          ? <span className="text-green-600 font-medium">{org.thumbs_up}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {org.thumbs_down > 0
                          ? <span className="text-red-600 font-medium">{org.thumbs_down}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {org.escalations > 0
                          ? <span className="text-amber-600 font-medium">{org.escalations}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {org.comments > 0
                          ? <span className="text-blue-600 font-medium">{org.comments}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
