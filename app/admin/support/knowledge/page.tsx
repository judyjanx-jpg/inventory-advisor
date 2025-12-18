'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  FileText,
  Tag,
  ExternalLink,
  Check,
  X,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

interface Article {
  id: number
  title: string
  slug: string
  category: string
  isPublished: boolean
  viewCount: number
  createdAt: string
  updatedAt: string
}

interface CategoryCount {
  name: string
  count: number
}

const CATEGORIES = [
  'Shipping',
  'Returns',
  'Sizing',
  'Care Instructions',
  'Warranty',
  'Product Info',
  'General',
]

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<CategoryCount[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPublished, setFilterPublished] = useState<string>('')
  
  // Editor state
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorCategory, setEditorCategory] = useState('General')
  const [editorContent, setEditorContent] = useState('')
  const [editorPublished, setEditorPublished] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchArticles()
  }, [searchQuery, filterCategory, filterPublished])

  const fetchArticles = async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (filterCategory) params.set('category', filterCategory)
      if (filterPublished) params.set('published', filterPublished)

      const res = await fetch(`/api/knowledge?${params}`)
      const data = await res.json()

      if (res.ok) {
        setArticles(data.articles)
        setCategories(data.categories)
      }
    } catch (error) {
      console.error('Error fetching articles:', error)
    } finally {
      setLoading(false)
    }
  }

  const openEditor = (article?: Article) => {
    if (article) {
      setEditingId(article.id)
      setEditorTitle(article.title)
      setEditorCategory(article.category)
      setEditorPublished(article.isPublished)
      // Fetch full content
      fetch(`/api/knowledge/${article.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.article) {
            setEditorContent(data.article.contentMarkdown)
          }
        })
    } else {
      setEditingId(null)
      setEditorTitle('')
      setEditorCategory('General')
      setEditorContent('')
      setEditorPublished(false)
    }
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditingId(null)
  }

  const saveArticle = async () => {
    if (!editorTitle.trim() || !editorContent.trim()) {
      alert('Title and content are required')
      return
    }

    setSaving(true)
    try {
      const url = editingId ? `/api/knowledge/${editingId}` : '/api/knowledge'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editorTitle,
          category: editorCategory,
          contentMarkdown: editorContent,
          isPublished: editorPublished,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save article')
      }

      closeEditor()
      fetchArticles()
    } catch (error) {
      console.error('Error saving article:', error)
      alert('Failed to save article')
    } finally {
      setSaving(false)
    }
  }

  const deleteArticle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this article?')) return

    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      fetchArticles()
    } catch (error) {
      console.error('Error deleting article:', error)
      alert('Failed to delete article')
    }
  }

  const togglePublished = async (article: Article) => {
    try {
      const res = await fetch(`/api/knowledge/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !article.isPublished }),
      })
      if (!res.ok) throw new Error('Failed to update')
      fetchArticles()
    } catch (error) {
      console.error('Error toggling publish:', error)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/support"
              className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">Knowledge Base</h1>
              <p className="text-[var(--muted-foreground)]">
                Manage FAQ articles and help content
              </p>
            </div>
          </div>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            New Article
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{articles.length}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Total Articles</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">
                    {articles.filter(a => a.isPublished).length}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Published</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <EyeOff className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">
                    {articles.filter(a => !a.isPublished).length}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Drafts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{categories.length}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Categories</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search articles..."
                    className="w-full pl-10 pr-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
              <select
                value={filterPublished}
                onChange={(e) => setFilterPublished(e.target.value)}
                className="px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
              >
                <option value="">All Status</option>
                <option value="true">Published</option>
                <option value="false">Draft</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Articles List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Articles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
                <p className="text-[var(--muted-foreground)]">No articles found</p>
                <Button variant="outline" onClick={() => openEditor()} className="mt-4">
                  Create your first article
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {articles.map((article) => (
                  <div
                    key={article.id}
                    className="py-4 flex items-center justify-between hover:bg-[var(--muted)]/50 -mx-4 px-4 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-[var(--foreground)] truncate">
                          {article.title}
                        </h3>
                        {article.isPublished ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                            Published
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">
                            Draft
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
                        <span className="px-2 py-0.5 rounded bg-[var(--muted)] text-xs">
                          {article.category}
                        </span>
                        <span>{article.viewCount} views</span>
                        <span>Updated {formatDate(article.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {article.isPublished && (
                        <a
                          href={`/support/faq/${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors"
                          title="View live"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => togglePublished(article)}
                        className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors"
                        title={article.isPublished ? 'Unpublish' : 'Publish'}
                      >
                        {article.isPublished ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditor(article)}
                        className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteArticle(article.id)}
                        className="p-2 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor Modal */}
        {showEditor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {editingId ? 'Edit Article' : 'New Article'}
                </h3>
                <button
                  onClick={closeEditor}
                  className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    placeholder="Article title..."
                    className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                      Category
                    </label>
                    <select
                      value={editorCategory}
                      onChange={(e) => setEditorCategory(e.target.value)}
                      className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                      Status
                    </label>
                    <div className="flex items-center gap-3 h-[42px]">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editorPublished}
                          onChange={(e) => setEditorPublished(e.target.checked)}
                          className="w-4 h-4 rounded border-[var(--border)] bg-[var(--muted)] text-purple-500 focus:ring-purple-500"
                        />
                        <span className="text-sm text-[var(--foreground)]">
                          Published
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                    Content (Markdown)
                  </label>
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    placeholder="Write your article content in Markdown..."
                    rows={12}
                    className="w-full px-4 py-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">
                    Supports Markdown: **bold**, *italic*, [links](url), ## headers, - lists
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3">
                <Button variant="ghost" onClick={closeEditor}>
                  Cancel
                </Button>
                <Button onClick={saveArticle} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {editingId ? 'Save Changes' : 'Create Article'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

