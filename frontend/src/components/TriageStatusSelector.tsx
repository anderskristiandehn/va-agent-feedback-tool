import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { TriageStatus } from '../types'

interface StatusConfig {
  label: string
  activeClasses: string
}

export const STATUS_CONFIG: Record<TriageStatus, StatusConfig> = {
  unreviewed: {
    label: 'Unreviewed',
    activeClasses: 'bg-zinc-800 border-zinc-500 text-zinc-300',
  },
  noted: {
    label: 'Noted',
    activeClasses: 'bg-blue-900/60 border-blue-500 text-blue-300',
  },
  actionable: {
    label: 'Actionable',
    activeClasses: 'bg-amber-900/60 border-amber-500 text-amber-300',
  },
  dismissed: {
    label: 'Dismissed',
    activeClasses: 'bg-gray-900 border-gray-600 text-gray-500',
  },
}

const STATUSES: TriageStatus[] = ['unreviewed', 'noted', 'actionable', 'dismissed']

interface Props {
  status: TriageStatus
  sessionId: string
  eventId: string | null  // null = session-level feedback
}

export default function TriageStatusSelector({ status: initialStatus, sessionId, eventId }: Props) {
  const [status, setStatus] = useState<TriageStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus, sessionId, eventId])

  const changeStatus = async (next: TriageStatus) => {
    if (next === status || saving) return
    setStatus(next)
    setSaving(true)
    try {
      const url = eventId
        ? `/api/annotations/message/${sessionId}/${eventId}/status`
        : `/api/annotations/session/${sessionId}/status`
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      qc.invalidateQueries({ queryKey: ['annotations'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`flex items-center gap-0 mt-2 ${saving ? 'opacity-50' : ''}`}>
      {STATUSES.map((s, i) => {
        const cfg = STATUS_CONFIG[s]
        const isActive = s === status
        const isFirst = i === 0
        const isLast = i === STATUSES.length - 1
        return (
          <button
            key={s}
            onClick={() => changeStatus(s)}
            title={cfg.label}
            className={`text-[10px] px-2 py-0.5 border transition-all
              ${isFirst ? 'rounded-l' : ''} ${isLast ? 'rounded-r' : ''}
              ${!isFirst ? '-ml-px' : ''}
              ${isActive
                ? cfg.activeClasses + ' font-medium z-10 relative'
                : 'bg-transparent border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-600 hover:z-10 hover:relative'
              }
              ${s === 'dismissed' && isActive ? 'line-through' : ''}
            `}
          >
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}
