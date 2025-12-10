'use client'

import { Check, X, Sparkles } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  data?: any
  visualization?: any
  actionPreview?: any
  toolCreated?: any
  featureRequest?: any
}

interface AIMessageProps {
  message: Message
  onActionConfirm?: (actionId: string) => void
}

export default function AIMessage({ message, onActionConfirm }: AIMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 animate-[slideIn_0.3s_ease-out] ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_rgba(99,102,241,0.3)] animate-[pulse-glow_2s_ease-in-out_infinite]">
          <Sparkles className="w-4.5 h-4.5 text-white" />
        </div>
      )}

      <div className={`max-w-[75%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <p className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-words ${
          isUser 
            ? 'bg-indigo-500/30 text-white border border-indigo-500/40' 
            : 'bg-white/10 text-white/90 border border-white/10'
        }`}>
          {message.content}
        </p>

        {/* Action Preview */}
        {message.actionPreview && (
          <div className="mt-2 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="font-semibold text-white/90 mb-2 text-sm">Confirm Action</div>
            <p className="text-white/80 text-xs mb-3">{message.actionPreview.description}</p>
            {message.actionPreview.changes && (
              <div className="bg-black/20 rounded-lg p-3 mb-3 flex flex-col gap-1.5">
                {message.actionPreview.changes.map((change: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-white/80">
                    <span className="font-medium">{change.field}:</span>
                    <span className="text-red-400/80 line-through">{change.from}</span>
                    <span>→</span>
                    <span className="text-emerald-400/80 font-medium">{change.to}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onActionConfirm?.(message.actionPreview.actionId)}
                className="flex-1 px-4 py-2 bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-medium hover:bg-emerald-500/40 hover:border-emerald-500/60 transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm
              </button>
              <button className="px-4 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg text-xs font-medium hover:bg-white/15 transition-all flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tool Created */}
        {message.toolCreated && (
          <div className="mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <p className="text-white/90 text-xs mb-2">
              ✨ I've added "{message.toolCreated.title}" to your tools!
            </p>
            <button className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-400 text-xs hover:bg-emerald-500/30 transition-all">
              View Tool
            </button>
          </div>
        )}

        {/* Feature Request */}
        {message.featureRequest && (
          <div className="mt-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <p className="text-white/90 text-xs mb-2">
              {message.featureRequest.funnyMessage || "That's a great idea! I've created a feature request for the team."}
            </p>
            <p className="text-white/70 text-xs leading-relaxed">
              {message.featureRequest.suggestedApproach}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
