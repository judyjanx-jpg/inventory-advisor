'use client'

import { Sparkles } from 'lucide-react'

export default function AIThinking() {
  return (
    <div className="flex items-center gap-3 animate-[slideIn_0.3s_ease-out]">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_rgba(99,102,241,0.3)] animate-[pulse-glow_2s_ease-in-out_infinite]">
        <Sparkles className="w-4.5 h-4.5 text-white" />
      </div>
      <div className="flex gap-1.5 px-4 py-3 bg-white/10 border border-white/10 rounded-2xl">
        <span className="w-2 h-2 rounded-full bg-white/60 animate-[dotPulse_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0s' }} />
        <span className="w-2 h-2 rounded-full bg-white/60 animate-[dotPulse_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
        <span className="w-2 h-2 rounded-full bg-white/60 animate-[dotPulse_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  )
}
