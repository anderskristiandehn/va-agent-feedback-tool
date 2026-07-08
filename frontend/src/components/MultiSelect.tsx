import { useEffect, useRef, useState } from 'react'

interface Props {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  label: string
}

export default function MultiSelect({ options, selected, onChange, label }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val])

  const btnLabel = selected.length === 0 ? label : `${label} (${selected.length})`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
          selected.length > 0
            ? 'bg-indigo-50 border-indigo-300 text-indigo-600'
            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
        }`}
      >
        {btnLabel} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-indigo-500"
              />
              {opt.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-left text-xs text-indigo-600 hover:text-indigo-500 border-t border-gray-100 mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
