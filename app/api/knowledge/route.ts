import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all knowledge articles (with optional filters)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const published = searchParams.get('published')
    const search = searchParams.get('search')

    const where: any = {}

    if (category) {
      where.category = category
    }

    if (published === 'true') {
      where.isPublished = true
    } else if (published === 'false') {
      where.isPublished = false
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { contentMarkdown: { contains: search, mode: 'insensitive' } },
      ]
    }

    const articles = await prisma.knowledgeArticle.findMany({
      where,
      orderBy: [
        { isPublished: 'desc' },
        { viewCount: 'desc' },
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        isPublished: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    // Get unique categories
    const categories = await prisma.knowledgeArticle.groupBy({
      by: ['category'],
      _count: { category: true },
    })

    return NextResponse.json({
      articles,
      categories: categories.map(c => ({ name: c.category, count: c._count.category })),
    })
  } catch (error) {
    console.error('[Knowledge] List error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch articles' },
      { status: 500 }
    )
  }
}

// POST - Create a new knowledge article
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, category, contentMarkdown, isPublished = false } = body

    if (!title?.trim() || !category?.trim() || !contentMarkdown?.trim()) {
      return NextResponse.json(
        { error: 'Title, category, and content are required' },
        { status: 400 }
      )
    }

    // Generate slug from title
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if slug exists and make unique if needed
    let slug = baseSlug
    let counter = 1
    while (await prisma.knowledgeArticle.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const article = await prisma.knowledgeArticle.create({
      data: {
        title: title.trim(),
        slug,
        category: category.trim(),
        contentMarkdown: contentMarkdown.trim(),
        isPublished,
      }
    })

    console.log(`[Knowledge] Created article: ${article.title} (${article.slug})`)

    return NextResponse.json({ success: true, article })
  } catch (error) {
    console.error('[Knowledge] Create error:', error)
    return NextResponse.json(
      { error: 'Unable to create article' },
      { status: 500 }
    )
  }
}

