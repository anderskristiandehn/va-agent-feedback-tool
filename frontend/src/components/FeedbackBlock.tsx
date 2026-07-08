import type { TriageStatus } from '../types'
import AnnotationInput from './AnnotationInput'
import TriageStatusSelector from './TriageStatusSelector'

interface Props {
  feedbackType: string
  feedbackComment: string | null
  feedbackCategory: string | null
  sessionId: string
  eventId: string
  annotationText: string
  feedbackStatus: TriageStatus
}

export default function FeedbackBlock({
  feedbackType,
  feedbackComment,
  feedbackCategory,
  sessionId,
  eventId,
  annotationText,
  feedbackStatus,
}: Props) {
  const isDown = feedbackType === 'thumbs_down'

  return (
    <div
      className={`mx-3 mb-3 mt-1 rounded-lg border px-3 py-2.5 text-sm ${
        isDown
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-green-50 border-green-200 text-green-800'
      }`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-base leading-none mt-0.5">{isDown ? '👎' : '👍'}</span>

        {feedbackCategory && (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium font-mono ${
              isDown
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-green-100 text-green-700 border border-green-200'
            }`}
          >
            {feedbackCategory}
          </span>
        )}

        {feedbackComment && (
          <span className="text-xs leading-relaxed text-gray-700 flex-1">
            {feedbackComment}
          </span>
        )}
      </div>

      <TriageStatusSelector status={feedbackStatus} sessionId={sessionId} eventId={eventId} />
      <AnnotationInput sessionId={sessionId} eventId={eventId} initialValue={annotationText} />
    </div>
  )
}
