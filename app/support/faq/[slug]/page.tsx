'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, Eye, Tag, Loader2 } from 'lucide-react'

interface Article {
  id: number
  title: string
  slug: string
  category: string
  contentMarkdown: string
  viewCount: number
  createdAt: string
  updatedAt: string
}

// Simple markdown renderer
function renderMarkdown(content: string): string {
  return content
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-white mt-6 mb-3">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-white mt-8 mb-4">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-emerald-400 hover:underline" target="_blank" rel="noopener">$1</a>')
    // Unordered lists
    .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="space-y-1 my-4">$&</ul>')
    // Ordered lists
    .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-800 rounded-lg p-4 my-4 overflow-x-auto"><code class="text-sm text-emerald-300">$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300 text-sm">$1</code>')
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 my-4 text-slate-300 italic">$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gim, '<hr class="border-slate-700 my-8" />')
    // Paragraphs (wrap remaining text)
    .replace(/^(?!<[hluopb]|<li|<hr|<blockquote)(.+)$/gim, '<p class="text-slate-300 leading-relaxed mb-4">$1</p>')
    // Clean up empty paragraphs
    .replace(/<p class="[^"]*"><\/p>/g, '')
}

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const res = await fetch(`/api/knowledge/${slug}`)
        const data = await res.json()

        if (!res.ok || !data.article?.isPublished) {
          setNotFound(true)
        } else {
          setArticle(data.article)
        }
      } catch (error) {
        console.error('Error fetching article:', error)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <h2 className="text-2xl font-bold text-white mb-4">Article not found</h2>
        <p className="text-slate-400 mb-6">
          The article you are looking for does not exist or has been unpublished.
        </p>
        <Link 
          href="/support/faq"
          className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to FAQ
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link 
        href="/support/faq"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to FAQ
      </Link>

      {/* Article header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">
            {article.category}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">{article.title}</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Updated {new Date(article.updatedAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {article.viewCount} views
          </span>
        </div>
      </header>

      {/* Article content */}
      <article 
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(article.contentMarkdown) }}
      />

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-slate-800">
        <p className="text-slate-400 text-center">
          Still have questions?{' '}
          <Link href="/support/contact" className="text-emerald-400 hover:underline">
            Contact our support team
          </Link>
        </p>
      </footer>
    </div>
  )
}

