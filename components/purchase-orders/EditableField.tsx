'use client'

import { useState, useRef, useEffect } from 'react'

interface EditableFieldProps {
  value: string | number
  onChange: (value: string | number) => void
  type?: 'text' | 'date' | 'number'
  className?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
  formatValue?: (value: string | number) => string
  parseValue?: (value: string) => string | number
}

export default function EditableField({
  value,
  onChange,
  type = 'text',
  className = '',
  placeholder,
  min,
  max,
  step,
  formatValue,
  parseValue,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = () => {
    if (type === 'date') {
      setEditValue(value ? new Date(value as string).toISOString().split('T')[0] : '')
    } else {
      setEditValue(String(value))
    }
    setIsEditing(true)
  }

  const handleSave = () => {
    if (type === 'number') {
      const numValue = parseValue ? parseValue(editValue) : parseFloat(editValue) || 0
      onChange(numValue)
    } else if (type === 'date') {
      onChange(editValue || '')
    } else {
      onChange(parseValue ? parseValue(editValue) : editValue)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const displayValue = formatValue ? formatValue(value) : String(value || '')

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step={step}
        className={`${className} bg-[var(--muted)] border-2 border-cyan-500 rounded px-2 py-1 focus:outline-none`}
        placeholder={placeholder}
      />
    )
  }

  return (
    <div
      onClick={handleClick}
      className={`${className} cursor-pointer hover:bg-[var(--muted)]/50 rounded px-2 py-1 transition-colors group`}
      title="Click to edit"
    >
      <span className="group-hover:text-cyan-400 transition-colors">
        {displayValue || <span className="text-[var(--muted-foreground)] italic">{placeholder || 'Click to edit'}</span>}
      </span>
      <span className="ml-2 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity text-xs">
        ✏️
      </span>
    </div>
  )
}

