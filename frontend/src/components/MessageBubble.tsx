import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { MessageData } from '../types'

interface Props {
  message: MessageData
  searchTerm: string
  isCurrentMatch: boolean
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightMarkdown(text: string, search: string): string {
  if (!search.trim()) return text
  const re = new RegExp(escapeRegex(search), 'gi')
  return text.replace(re, (match) => `<mark class="search-highlight">${escapeHtml(match)}</mark>`)
}

function getPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MessageBubble({ message, searchTerm, isCurrentMatch }: Props) {
  const isUser = message.speaker === 'User'
  const content = highlightMarkdown(message.message_text, searchTerm)

  return (
    <div className="px-3 mb-1">
      {/* Escalation banner — outside the bubble, full width */}
      {message.contact_support && (
        <div className={`mb-2 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ${isUser ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}`}>
          <span>🎧</span>
          <span>Escalated to support</span>
        </div>
      )}

      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          {/* Speaker label */}
          <span
            className={`text-[10px] font-mono mb-1 px-1 ${
              isUser ? 'text-indigo-500 self-end' : 'text-emerald-600 self-start'
            }`}
          >
            {message.speaker}
          </span>

          {/* Bubble */}
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm transition-all ${
              isCurrentMatch ? 'ring-2 ring-yellow-400/70' : ''
            } ${
              isUser
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm shadow-sm'
            }`}
          >
            <div className={isUser ? 'bubble-prose-invert' : 'bubble-prose'}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {content}
              </ReactMarkdown>
            </div>

            {!isUser && message.sources?.length > 0 && (
              <div className="mt-3 border-t border-gray-200 pt-2">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Sources
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...message.sources].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((source) => {
                    let label = source.url
                    try {
                      const u = new URL(source.url)
                      const path = u.pathname.replace(/\/$/, '')
                      label = path && path !== '/' ? u.hostname + path : u.hostname
                    } catch { /* keep url */ }
                    return (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
                        title={source.url}
                      >
                        {source.title || label}
                        {source.score != null && source.score >= 0.5 && (
                          <span className="ml-1 text-gray-400">
                            {(source.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Metadata row */}
          <div
            className={`flex items-center gap-2 mt-1 px-1 flex-wrap ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <span className="text-[10px] text-gray-400 font-mono">{formatTime(message.timestamp)}</span>

            {message.locale && (
              <span className="text-[10px] font-mono bg-gray-100 border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                {message.locale}
              </span>
            )}

            {message.current_page && (
              <span
                title={message.current_page}
                className="text-[10px] font-mono bg-gray-100 border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded cursor-default max-w-[240px] truncate"
              >
                {getPathname(message.current_page)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
