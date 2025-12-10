'use client'

import { useState, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface AIInputProps {
  onSend: (input: string) => void
  disabled?: boolean
}

export default function AIInput({ onSend, disabled }: AIInputProps) {
  const [input, setInput] = useState('')

  const handleSubmit = () => {
    if (!input.trim() || disabled) return
    onSend(input)
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const suggestions = [
    "What are my top sellers?",
    "Create PO",
    "Check inventory"
  ]

  return (
    <div className="p-4 border-t border-indigo-500/20 bg-black/20">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => {
              setInput(suggestion)
              handleSubmit()
            }}
            className="px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-2xl text-white/80 text-xs hover:bg-indigo-500/25 hover:border-indigo-500/50 transition-all hover:-translate-y-0.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disabled}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="relative flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or ask anything..."
          rows={1}
          disabled={disabled}
          className="flex-1 px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-2xl text-white text-sm resize-none min-h-[44px] max-h-[120px] leading-relaxed transition-all placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || disabled}
          className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 border-none text-white cursor-pointer flex items-center justify-center transition-all shadow-[0_2px_8px_rgba(99,102,241,0.3)] hover:scale-110 hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          title="Send (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
