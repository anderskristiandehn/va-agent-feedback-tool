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
            ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300'
            : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
        }`}
      >
        {btnLabel} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 cursor-pointer text-xs text-gray-300"
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
              className="w-full px-3 py-1.5 text-left text-xs text-indigo-400 hover:text-indigo-300 border-t border-gray-800 mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
