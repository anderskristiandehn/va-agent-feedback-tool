import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { Annotations, MessageData, SessionData } from '../types'

function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMarkdown(text: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {text}
    </ReactMarkdown>,
  )
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
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFullRange(first: string | null, last: string | null): string {
  if (!first) return ''
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (!last || first === last) return fmt(first)
  return `${fmt(first)} – ${fmt(last)}`
}

function sourcesHtml(message: MessageData): string {
  if (message.speaker === 'User' || !message.sources?.length) return ''
  const chips = [...message.sources]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((s) => {
      let label = s.url
      try {
        const u = new URL(s.url)
        const path = u.pathname.replace(/\/$/, '')
        label = path && path !== '/' ? u.hostname + path : u.hostname
      } catch {
        // keep raw url as label
      }
      const pct =
        s.score != null && s.score >= 0.5
          ? ` <span class="source-score">${(s.score * 100).toFixed(0)}%</span>`
          : ''
      return `<a class="source-chip" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}">${esc(s.title || label)}${pct}</a>`
    })
    .join('')
  return `<div class="sources"><div class="sources-label">Sources</div><div class="sources-list">${chips}</div></div>`
}

function feedbackBlockHtml(message: MessageData, annotationText: string): string {
  if (!message.has_feedback || !message.feedback_type) return ''
  const isDown = message.feedback_type === 'thumbs_down'
  return `
    <div class="feedback-block ${isDown ? 'feedback-down' : 'feedback-up'}">
      <span class="feedback-icon">${isDown ? '\u{1F44E}' : '\u{1F44D}'}</span>
      ${message.feedback_category ? `<span class="feedback-category">${esc(message.feedback_category)}</span>` : ''}
      ${message.feedback_comment ? `<span class="feedback-comment">${esc(message.feedback_comment)}</span>` : ''}
      ${annotationText ? `<div class="annotation">\u{1F4DD} ${esc(annotationText)}</div>` : ''}
    </div>`
}

function messageHtml(message: MessageData, annotations: Annotations, sessionId: string): string {
  const isUser = message.speaker === 'User'
  const annotationText = annotations.messages[`${sessionId}:${message.event_id}`]?.text ?? ''

  return `
    <div class="message-row ${isUser ? 'align-right' : 'align-left'}">
      ${message.contact_support ? `<div class="escalation-banner">\u{1F3A7} Escalated to support</div>` : ''}
      <div class="bubble-wrap">
        <span class="speaker ${isUser ? 'speaker-user' : 'speaker-agent'}">${esc(message.speaker)}</span>
        <div class="bubble ${isUser ? 'bubble-user' : 'bubble-agent'}">
          <div class="prose">${renderMarkdown(message.message_text)}</div>
          ${sourcesHtml(message)}
        </div>
        <div class="msg-meta">
          <span class="meta-time">${esc(formatTime(message.timestamp))}</span>
          ${message.locale ? `<span class="meta-chip">${esc(message.locale)}</span>` : ''}
          ${message.current_page ? `<span class="meta-chip" title="${esc(message.current_page)}">${esc(getPathname(message.current_page))}</span>` : ''}
        </div>
      </div>
    </div>
    ${feedbackBlockHtml(message, annotationText)}`
}

function headerHtml(session: SessionData, sessionNote: string): string {
  const orgChips = session.org_name
    ? `
      <span class="org-name">${esc(session.org_name)}</span>
      ${session.org_country ? `<span class="meta-chip">${esc(session.org_country)}</span>` : ''}
      ${session.org_plan ? `<span class="meta-chip">${esc(session.org_plan)}${session.org_is_trial ? ' · trial' : ''}</span>` : ''}
      ${session.org_is_test ? `<span class="meta-chip chip-test">test</span>` : ''}`
    : ''

  const sessionFeedback = session.session_feedback
    ? `
      <div class="session-feedback-banner">
        <div class="sf-header">\u{1F4AC} Session feedback ${session.session_feedback.category ? `<span class="meta-chip">${esc(session.session_feedback.category)}</span>` : ''}</div>
        ${session.session_feedback.details ? `<p>${esc(session.session_feedback.details)}</p>` : ''}
      </div>`
    : ''

  const noteBlock = sessionNote
    ? `<div class="session-note"><div class="session-note-label">Internal note</div><p>${esc(sessionNote)}</p></div>`
    : ''

  return `
    <div class="thread-header">
      <div class="header-top">
        <div>
          <div class="session-id">${esc(session.session_id)}</div>
          <div class="header-meta">
            <span class="meta-chip mono">${esc(session.user_id)}</span>
            <span class="meta-chip">${esc(session.app_name)}</span>
            ${orgChips}
          </div>
        </div>
        <div class="header-dates">${esc(formatFullRange(session.first_timestamp, session.last_timestamp))}</div>
      </div>
      ${sessionFeedback}
      ${noteBlock}
    </div>`
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f9fafb;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }

  .thread-header {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .session-id { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; color: #4f46e5; word-break: break-all; }
  .header-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .header-dates { font-size: 12px; color: #6b7280; white-space: nowrap; }
  .org-name { font-size: 12px; font-weight: 600; color: #4f46e5; }
  .meta-chip {
    font-size: 11px; background: #f3f4f6; border: 1px solid #e5e7eb; color: #4b5563;
    padding: 1px 6px; border-radius: 4px;
  }
  .meta-chip.mono { font-family: 'SF Mono', Consolas, monospace; color: #9ca3af; }
  .chip-test { background: #f5f3ff; border-color: #ddd6fe; color: #7c3aed; }

  .session-feedback-banner {
    margin-top: 10px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px;
    padding: 8px 12px; font-size: 13px;
  }
  .sf-header { color: #4338ca; font-weight: 500; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .session-feedback-banner p { margin: 4px 0 0; color: #4338ca; font-size: 12px; }

  .session-note {
    margin-top: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px;
  }
  .session-note-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; }
  .session-note p { margin: 4px 0 0; font-size: 13px; color: #374151; white-space: pre-wrap; }

  .messages { display: flex; flex-direction: column; }
  .message-row { padding: 0 4px; margin-bottom: 4px; }
  .escalation-banner {
    margin-bottom: 8px; max-width: 80%; font-size: 12px; font-weight: 500; color: #92400e;
    background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px;
  }
  .bubble-wrap { display: flex; flex-direction: column; max-width: 80%; }
  .align-right .bubble-wrap { margin-left: auto; align-items: flex-end; }
  .align-left .bubble-wrap { margin-right: auto; align-items: flex-start; }
  .speaker { font-family: 'SF Mono', Consolas, monospace; font-size: 10px; margin-bottom: 4px; padding: 0 4px; }
  .speaker-user { color: #6366f1; }
  .speaker-agent { color: #059669; }

  .bubble { border-radius: 16px; padding: 10px 16px; font-size: 14px; line-height: 1.5; }
  .bubble-user { background: #4f46e5; color: #fff; border-top-right-radius: 4px; }
  .bubble-agent { background: #fff; color: #1f2937; border: 1px solid #e5e7eb; border-top-left-radius: 4px; }

  .prose p { margin: 0 0 8px; }
  .prose p:last-child { margin-bottom: 0; }
  .prose ul, .prose ol { margin: 4px 0 8px; padding-left: 20px; }
  .prose li { margin: 2px 0; }
  .prose a { color: inherit; text-decoration: underline; }
  .bubble-agent .prose a { color: #4338ca; }
  .prose code { font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; }
  .bubble-user .prose code { background: rgba(255,255,255,0.18); }
  .prose pre { background: rgba(0,0,0,0.06); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
  .bubble-user .prose pre { background: rgba(255,255,255,0.18); }
  .prose pre code { background: none; padding: 0; }
  .prose table { border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  .prose th, .prose td { border: 1px solid rgba(0,0,0,0.12); padding: 4px 8px; }
  .prose blockquote { border-left: 3px solid rgba(0,0,0,0.15); margin: 8px 0; padding-left: 10px; color: inherit; opacity: 0.85; }

  .sources { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
  .sources-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: #9ca3af; margin-bottom: 4px; }
  .sources-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .source-chip {
    font-size: 11px; color: #4b5563; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
    padding: 3px 8px; text-decoration: none;
  }
  .source-chip:hover { border-color: #9ca3af; }
  .source-score { color: #9ca3af; }

  .msg-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; padding: 0 4px; flex-wrap: wrap; }
  .meta-time { font-size: 10px; font-family: 'SF Mono', Consolas, monospace; color: #9ca3af; }

  .feedback-block {
    max-width: 80%; margin: 4px 4px 12px; border-radius: 8px; padding: 10px 12px; font-size: 13px;
    display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
  }
  .feedback-down { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .feedback-up { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .feedback-icon { font-size: 15px; line-height: 1; }
  .feedback-category {
    font-family: 'SF Mono', Consolas, monospace; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px;
  }
  .feedback-down .feedback-category { background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; }
  .feedback-up .feedback-category { background: #dcfce7; border: 1px solid #bbf7d0; color: #15803d; }
  .feedback-comment { font-size: 12px; color: #374151; flex: 1; }
  .annotation { width: 100%; font-size: 12px; color: #78350f; background: rgba(0,0,0,0.04); border-radius: 6px; padding: 4px 8px; }

  .export-footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 24px; }

  .toc {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; margin-bottom: 24px;
  }
  .toc-title { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 10px; }
  .toc-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 8px 10px; border-radius: 8px; text-decoration: none; color: inherit;
  }
  .toc-row:hover { background: #f9fafb; }
  .toc-org { font-size: 13px; font-weight: 600; color: #4f46e5; }
  .toc-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .toc-feedback { font-size: 11px; white-space: nowrap; }
  .session-section { margin-bottom: 8px; }
  .session-divider { height: 1px; background: #e5e7eb; margin: 32px 0; }
`

function sessionSectionHtml(session: SessionData, annotations: Annotations, anchorId?: string): string {
  const sessionNote = annotations.sessions[session.session_id]?.text ?? ''
  const messagesHtml = session.messages
    .map((m) => messageHtml(m, annotations, session.session_id))
    .join('\n')

  return `
    <section${anchorId ? ` id="${esc(anchorId)}"` : ''} class="session-section">
      ${headerHtml(session, sessionNote)}
      <div class="messages">
        ${messagesHtml}
      </div>
    </section>`
}

function documentHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="page">
    ${bodyHtml}
    <div class="export-footer">Exported from Feedback Review Tool · ${esc(new Date().toLocaleString())}</div>
  </div>
</body>
</html>`
}

function triggerDownload(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slug(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
}

export function downloadSessionHtml(session: SessionData, annotations: Annotations): void {
  const title = `Session ${session.session_id}${session.org_name ? ` — ${session.org_name}` : ''}`
  const html = documentHtml(title, sessionSectionHtml(session, annotations))
  const orgSlug = session.org_name ? `-${slug(session.org_name)}` : ''
  triggerDownload(html, `session-${session.session_id.slice(0, 8)}${orgSlug}.html`)
}

function tocRowHtml(session: SessionData, anchorId: string): string {
  const feedbackBits = [
    session.thumbs_down_count > 0 ? `\u{1F44E} ${session.thumbs_down_count}` : '',
    session.thumbs_up_count > 0 ? `\u{1F44D} ${session.thumbs_up_count}` : '',
    session.escalation_count > 0 ? `\u{1F3A7} ${session.escalation_count}` : '',
  ].filter(Boolean).join(' &nbsp; ')

  return `
    <a class="toc-row" href="#${esc(anchorId)}">
      <span class="toc-org">${esc(session.org_name ?? session.session_id.slice(0, 20) + '…')}</span>
      <span class="toc-meta">
        <span class="meta-chip">${esc(session.app_name)}</span>
        <span class="meta-time">${esc(formatFullRange(session.first_timestamp, session.last_timestamp))}</span>
        <span class="meta-time">${session.message_count} msgs</span>
        ${feedbackBits ? `<span class="toc-feedback">${feedbackBits}</span>` : ''}
      </span>
    </a>`
}

export function downloadSessionsHtml(sessions: SessionData[], annotations: Annotations): void {
  const anchorIds = sessions.map((s, i) => `session-${i}-${s.session_id.slice(0, 8)}`)

  const toc = `
    <div class="toc">
      <div class="toc-title">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</div>
      ${sessions.map((s, i) => tocRowHtml(s, anchorIds[i])).join('\n')}
    </div>`

  const sections = sessions
    .map((s, i) => sessionSectionHtml(s, annotations, anchorIds[i]))
    .join('\n<div class="session-divider"></div>\n')

  const html = documentHtml(
    `${sessions.length} sessions — Feedback Review export`,
    `${toc}\n${sections}`,
  )

  const date = new Date().toISOString().slice(0, 10)
  triggerDownload(html, `sessions-export-${date}-${sessions.length}.html`)
}
