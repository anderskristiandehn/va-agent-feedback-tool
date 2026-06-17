import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

interface Props {
  sessionId: string
  eventId: string
  initialValue: string
}

export default function AnnotationInput({ sessionId, eventId, initialValue }: Props) {
  const [value, setValue] = useState(initialValue)
  const prevSaved = useRef(initialValue)
  const queryClient = useQueryClient()

  // Re-sync when session changes (different annotation loaded)
  useEffect(() => {
    setValue(initialValue)
    prevSaved.current = initialValue
  }, [initialValue, sessionId, eventId])

  const save = async (text: string) => {
    if (text === prevSaved.current) return
    prevSaved.current = text
    try {
      if (text.trim()) {
        await fetch(`/api/annotations/message/${sessionId}/${eventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      } else {
        await fetch(`/api/annotations/message/${sessionId}/${eventId}`, {
          method: 'DELETE',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['annotations'] })
    } catch {
      // silently ignore — user can retry by re-blurring
    }
  }

  return (
    <input
      type="text"
      value={value}
      placeholder="Your note…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => save(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        e.stopPropagation() // prevent global keyboard shortcuts from firing
      }}
      className="mt-2 w-full text-xs bg-black/20 border border-white/10 rounded px-2 py-1
                 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500
                 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
    />
  )
}
