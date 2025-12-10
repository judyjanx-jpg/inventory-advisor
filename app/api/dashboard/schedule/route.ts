import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Get user profile and schedule
    let profile = await prisma.userProfile.findFirst()
    
    if (!profile) {
      // Create default profile and schedule
      profile = await prisma.userProfile.create({
        data: {
          name: 'Judy',
          timezone: 'America/New_York'
        }
      })
      
      const defaultSchedule = [
        { dayOfWeek: 0, isWorking: false, startTime: null, endTime: null },
        { dayOfWeek: 1, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 6, isWorking: false, startTime: null, endTime: null },
      ]
      
      for (const day of defaultSchedule) {
        await prisma.userSchedule.create({
          data: {
            userId: profile.id,
            ...day
          }
        })
      }
    }

    const schedule = await prisma.userSchedule.findMany({
      where: { userId: profile.id },
      orderBy: { dayOfWeek: 'asc' }
    })

    return NextResponse.json({
      success: true,
      schedule: schedule.map((s: { dayOfWeek: number; isWorking: boolean; startTime: string | null; endTime: string | null }) => ({
        dayOfWeek: s.dayOfWeek,
        isWorking: s.isWorking,
        startTime: s.startTime,
        endTime: s.endTime
      }))
    })
  } catch (error) {
    console.error('Schedule API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to load schedule'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { dayOfWeek, isWorking, startTime, endTime } = body

    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({
        success: false,
        error: 'Invalid day of week'
      }, { status: 400 })
    }

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    await prisma.userSchedule.upsert({
      where: {
        userId_dayOfWeek: {
          userId: profile.id,
          dayOfWeek
        }
      },
      update: {
        isWorking,
        startTime,
        endTime
      },
      create: {
        userId: profile.id,
        dayOfWeek,
        isWorking,
        startTime,
        endTime
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Schedule updated'
    })
  } catch (error) {
    console.error('Schedule update error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update schedule'
    }, { status: 500 })
  }
}

