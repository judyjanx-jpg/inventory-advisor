import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const goals = await prisma.goal.findMany({
      orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }]
    })
    return NextResponse.json({
      success: true,
      goals: goals.map((g: { id: number; title: string; goalType: string | null; targetValue: unknown; currentValue: unknown; unit: string | null; periodType: string | null; isCompleted: boolean; color: string }) => ({
        id: g.id,
        title: g.title,
        goalType: g.goalType,
        targetValue: g.targetValue ? Number(g.targetValue) : null,
        currentValue: g.currentValue ? Number(g.currentValue) : null,
        unit: g.unit,
        periodType: g.periodType,
        isCompleted: g.isCompleted,
        color: g.color
      }))
    })
  } catch (error) {
    console.error('Goals API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch goals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, targetValue, color } = await request.json()
    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title required' }, { status: 400 })
    }
    const goal = await prisma.goal.create({
      data: { title: title.trim(), targetValue, color: color || '#0ea5e9' }
    })
    return NextResponse.json({
      success: true,
      goal: {
        id: goal.id,
        title: goal.title,
        goalType: goal.goalType,
        targetValue: goal.targetValue ? Number(goal.targetValue) : null,
        currentValue: null,
        unit: goal.unit,
        periodType: goal.periodType,
        isCompleted: goal.isCompleted,
        color: goal.color
      }
    })
  } catch (error) {
    console.error('Create goal error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create goal' }, { status: 500 })
  }
}

