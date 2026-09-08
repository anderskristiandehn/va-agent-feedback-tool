import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useStore } from '../store'
import type { Annotations, SessionData } from '../types'
import { downloadSessionHtml } from '../utils/exportSessionHtml'
import FeedbackBlock from './FeedbackBlock'
import MessageBubble from './MessageBubble'
import TriageStatusSelector from './TriageStatusSelector'

interface Props {
  session: SessionData | null
  annotations: Annotations
}

function formatFullRange(first: string | null, last: string | null): string {
  if (!first) return '—'
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  if (!last || first === last) return fmt(first)
  return `${fmt(first)} – ${fmt(last)}`
}

export default function ThreadView({ session, annotations }: Props) {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const highlightEventId = searchParams.get('highlight')
  const qSearch = searchParams.get('q')

  const { threadSearch, setThreadSearch } = useStore()
  const [rawSearch, setRawSearch] = useState(qSearch ?? threadSearch)
  const debouncedSearch = useDebounce(rawSearch, 200)
  const searchRef = useRef<HTMLInputElement>(null)
  const messageRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const [sessionAnnotationText, setSessionAnnotationText] = useState('')
  const [sessionAnnotationSaved, setSessionAnnotationSaved] = useState('')
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  const [currentFeedbackIdx, setCurrentFeedbackIdx] = useState(0)
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const [copiedId, setCopiedId] = useState(false)

  // Sync thread search to store
  useEffect(() => {
    setThreadSearch(debouncedSearch)
    setCurrentMatchIdx(0)
  }, [debouncedSearch, setThreadSearch])

  // Reset state when session changes; pre-populate search from ?q= param
  useEffect(() => {
    setRawSearch(qSearch ?? '')
    setCurrentFeedbackIdx(0)
    setCurrentMatchIdx(0)

    if (!session) {
      setSessionAnnotationText('')
      setSessionAnnotationSaved('')
      return
    }

    const saved = annotations.sessions[session.session_id]?.text ?? ''
    setSessionAnnotationText(saved)
    setSessionAnnotationSaved(saved)
  }, [session?.session_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync annotation when annotations reload (e.g. after save)
  useEffect(() => {
    if (!session) return
    const saved = annotations.sessions[session.session_id]?.text ?? ''
    setSessionAnnotationText(saved)
    setSessionAnnotationSaved(saved)
  }, [annotations, session?.session_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const messages = session?.messages ?? []

  const feedbackIndices = useMemo(
    () => messages.map((m, i) => (m.has_feedback ? i : -1)).filter((i) => i !== -1),
    [messages],
  )

  const matchingIndices = useMemo(() => {
    if (!debouncedSearch.trim()) return []
    const lower = debouncedSearch.toLowerCase()
    return messages
      .map((m, i) => (m.message_text.toLowerCase().includes(lower) ? i : -1))
      .filter((i) => i !== -1)
  }, [messages, debouncedSearch])

  const scrollToMessage = useCallback((idx: number) => {
    messageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // Scroll to bottom when a session loads (unless we have a specific message to highlight)
  useEffect(() => {
    if (!session) return
    if (highlightEventId) return
    const el = scrollAreaRef.current
    if (!el) return
    const id = setTimeout(() => { el.scrollTop = el.scrollHeight }, 50)
    return () => clearTimeout(id)
  }, [session?.session_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to highlighted message when navigating from global search / annotations tab
  useEffect(() => {
    if (!highlightEventId || !session) return
    const idx = session.messages.findIndex((m) => m.event_id === highlightEventId)
    if (idx < 0) return
    const id = setTimeout(() => scrollToMessage(idx), 200)
    return () => clearTimeout(id)
  }, [highlightEventId, session?.session_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const goFeedback = useCallback(
    (dir: 1 | -1) => {
      if (feedbackIndices.length === 0) return
      const next = Math.max(0, Math.min(currentFeedbackIdx + dir, feedbackIndices.length - 1))
      setCurrentFeedbackIdx(next)
      scrollToMessage(feedbackIndices[next])  // always scroll, even if index unchanged
    },
    [feedbackIndices, currentFeedbackIdx, scrollToMessage],
  )

  const goMatch = useCallback(
    (dir: 1 | -1) => {
      if (matchingIndices.length === 0) return
      const next = (currentMatchIdx + dir + matchingIndices.length) % matchingIndices.length
      setCurrentMatchIdx(next)
      scrollToMessage(matchingIndices[next])
    },
    [matchingIndices, currentMatchIdx, scrollToMessage],
  )

  // Global keyboard shortcuts for thread
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === '/' || e.key === 'F') {
        if (e.key === '/') e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        goFeedback(1)
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        goFeedback(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goFeedback])

  const saveSessionAnnotation = async () => {
    if (!session || sessionAnnotationText === sessionAnnotationSaved) return
    setSavingAnnotation(true)
    try {
      if (sessionAnnotationText.trim()) {
        await fetch(`/api/annotations/session/${session.session_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sessionAnnotationText }),
        })
      } else {
        await fetch(`/api/annotations/session/${session.session_id}`, {
          method: 'DELETE',
        })
      }
      setSessionAnnotationSaved(sessionAnnotationText)
      queryClient.invalidateQueries({ queryKey: ['annotations'] })
    } finally {
      setSavingAnnotation(false)
    }
  }

  const copySessionId = () => {
    if (!session) return
    navigator.clipboard.writeText(session.session_id).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1500)
    })
  }

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="text-4xl mb-3">💬</div>
        <div className="text-base text-gray-500">Select a session to view the thread</div>
        <div className="text-xs mt-1 text-gray-400">Use J / K to navigate, F to search</div>
      </div>
    )
  }

  const annotationDirty = sessionAnnotationText !== sessionAnnotationSaved

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none border-b border-gray-200 bg-white px-4 py-3 space-y-2">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5 min-w-0">
            <button
              onClick={copySessionId}
              title={copiedId ? 'Copied!' : 'Click to copy session ID'}
              className="font-mono text-xs text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              {copiedId ? '✓ copied' : session.session_id}
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-gray-400">{session.user_id}</span>
              <span className="text-[11px] bg-gray-100 border border-gray-300 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                {session.app_name}
              </span>
              {session.org_name && (
                <span className="text-[11px] text-indigo-600 font-semibold">{session.org_name}</span>
              )}
              {session.org_country && (
                <span className="text-[11px] text-gray-500">{session.org_country}</span>
              )}
              {session.org_plan && (
                <span className="text-[11px] bg-gray-100 border border-gray-300 text-gray-600 px-1.5 py-0.5 rounded">
                  {session.org_plan}{session.org_is_trial ? ' · trial' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <button
              onClick={() => downloadSessionHtml(session, annotations)}
              title="Download this session as a shareable HTML file"
              className="text-[11px] px-2.5 py-1 rounded-md border border-gray-300 bg-white
                         text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap"
            >
              ⬇ Download
            </button>
            <div className="text-xs text-gray-500 text-right">
              {formatFullRange(session.first_timestamp, session.last_timestamp)}
            </div>
          </div>
        </div>

        {/* Session feedback banner */}
        {session.session_feedback && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 font-medium text-xs mt-0.5">💬 Session feedback</span>
              {session.session_feedback.category && (
                <span className="text-[10px] bg-indigo-100 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded font-mono">
                  {session.session_feedback.category}
                </span>
              )}
            </div>
            {session.session_feedback.details && (
              <p className="mt-1 text-xs text-indigo-700">{session.session_feedback.details}</p>
            )}
            <TriageStatusSelector
              status={session.session_feedback.status}
              sessionId={session.session_id}
              eventId={null}
            />
          </div>
        )}

        {/* Session annotation */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <label className="block text-[10px] text-gray-400 font-medium mb-1 uppercase tracking-wide">Internal note</label>
            <textarea
              value={sessionAnnotationText}
              onChange={(e) => setSessionAnnotationText(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Add a note about this session…"
              rows={2}
              className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 resize-none
                         text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400
                         focus:ring-1 focus:ring-indigo-400/30 transition-colors"
            />
          </div>
          <button
            onClick={saveSessionAnnotation}
            disabled={!annotationDirty || savingAnnotation}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors mb-0.5 ${
              annotationDirty
                ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500'
                : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            {savingAnnotation ? '…' : 'Save'}
          </button>
        </div>

        {/* Controls row: feedback nav + thread search */}
        <div className="flex items-center gap-3">
          {/* Feedback navigation */}
          {feedbackIndices.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => goFeedback(-1)}
                disabled={feedbackIndices.length > 1 && currentFeedbackIdx === 0}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-gray-300
                           text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">
                {currentFeedbackIdx + 1} / {feedbackIndices.length} feedback
              </span>
              <button
                onClick={() => goFeedback(1)}
                disabled={feedbackIndices.length > 1 && currentFeedbackIdx === feedbackIndices.length - 1}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-gray-300
                           text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}

          {/* In-thread search */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              ref={searchRef}
              type="text"
              value={rawSearch}
              onChange={(e) => {
                setRawSearch(e.target.value)
                setCurrentMatchIdx(0)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  setRawSearch('')
                  e.currentTarget.blur()
                }
                if (e.key === 'Enter') {
                  goMatch(e.shiftKey ? -1 : 1)
                }
              }}
              placeholder="Search in thread… (/)"
              className="flex-1 min-w-0 text-xs bg-white border border-gray-300 rounded px-2.5 py-1
                         text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400
                         focus:ring-1 focus:ring-indigo-400/30 transition-colors"
            />
            {matchingIndices.length > 0 && (
              <>
                <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">
                  {currentMatchIdx + 1} / {matchingIndices.length}
                </span>
                <button
                  onClick={() => goMatch(-1)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  ↑
                </button>
                <button
                  onClick={() => goMatch(1)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  ↓
                </button>
              </>
            )}
            {rawSearch && matchingIndices.length === 0 && (
              <span className="text-[11px] text-red-500 whitespace-nowrap">No matches</span>
            )}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto py-4 space-y-0 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">No messages in this session.</div>
        )}

        {messages.map((msg, idx) => {
          const isCurrentFeedbackMsg =
            feedbackIndices.length > 0 && feedbackIndices[currentFeedbackIdx] === idx
          const isCurrentMatchMsg =
            matchingIndices.length > 0 && matchingIndices[currentMatchIdx] === idx
          const isNavHighlight = !!highlightEventId && msg.event_id === highlightEventId

          const msgAnnotationKey = `${session.session_id}:${msg.event_id}`
          const msgAnnotation = annotations.messages[msgAnnotationKey]?.text ?? ''

          return (
            <div
              key={msg.event_id}
              ref={(el) => {
                messageRefs.current[idx] = el
              }}
            >
              <MessageBubble
                message={msg}
                searchTerm={debouncedSearch}
                isCurrentMatch={isCurrentMatchMsg || isCurrentFeedbackMsg || isNavHighlight}
              />

              {msg.has_feedback && msg.feedback_type && (
                <FeedbackBlock
                  feedbackType={msg.feedback_type}
                  feedbackComment={msg.feedback_comment}
                  feedbackCategory={msg.feedback_category}
                  sessionId={session.session_id}
                  eventId={msg.event_id}
                  annotationText={msgAnnotation}
                  feedbackStatus={msg.feedback_status}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
