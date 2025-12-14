import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get single article by ID or slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Try to find by ID first, then by slug
    let article = null
    const numericId = parseInt(id)

    if (!isNaN(numericId)) {
      article = await prisma.knowledgeArticle.findUnique({
        where: { id: numericId }
      })
    }

    if (!article) {
      article = await prisma.knowledgeArticle.findUnique({
        where: { slug: id }
      })
    }

    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      )
    }

    // Increment view count (only for published articles accessed by slug)
    if (article.isPublished && isNaN(numericId)) {
      await prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } }
      })
    }

    return NextResponse.json({ article })
  } catch (error) {
    console.error('[Knowledge] Get error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch article' },
      { status: 500 }
    )
  }
}

// PATCH - Update an article
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const articleId = parseInt(id)
    const body = await request.json()

    if (isNaN(articleId)) {
      return NextResponse.json(
        { error: 'Invalid article ID' },
        { status: 400 }
      )
    }

    const { title, category, contentMarkdown, isPublished } = body

    const updateData: any = {}

    if (title !== undefined) {
      updateData.title = title.trim()
      // Update slug if title changed
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      let slug = baseSlug
      let counter = 1
      const existing = await prisma.knowledgeArticle.findUnique({ where: { slug } })
      while (existing && existing.id !== articleId) {
        slug = `${baseSlug}-${counter}`
        counter++
      }
      updateData.slug = slug
    }

    if (category !== undefined) updateData.category = category.trim()
    if (contentMarkdown !== undefined) updateData.contentMarkdown = contentMarkdown.trim()
    if (isPublished !== undefined) updateData.isPublished = isPublished

    const article = await prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: updateData,
    })

    console.log(`[Knowledge] Updated article: ${article.title}`)

    return NextResponse.json({ success: true, article })
  } catch (error) {
    console.error('[Knowledge] Update error:', error)
    return NextResponse.json(
      { error: 'Unable to update article' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an article
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const articleId = parseInt(id)

    if (isNaN(articleId)) {
      return NextResponse.json(
        { error: 'Invalid article ID' },
        { status: 400 }
      )
    }

    await prisma.knowledgeArticle.delete({
      where: { id: articleId }
    })

    console.log(`[Knowledge] Deleted article ID: ${articleId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Knowledge] Delete error:', error)
    return NextResponse.json(
      { error: 'Unable to delete article' },
      { status: 500 }
    )
  }
}

