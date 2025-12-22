'use client'

import { useState, useEffect } from 'react'
import { Clock, Hash, Calendar } from 'lucide-react'

export default function TimeClockPage() {
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [status, setStatus] = useState<{
    isClockedIn: boolean
    dailyTotal: number
    employeeName: string
    lastEntry: any
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [clocking, setClocking] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch status when employee number changes
  useEffect(() => {
    if (employeeNumber.length === 4) {
      fetchStatus()
    } else {
      setStatus(null)
    }
  }, [employeeNumber])

  const fetchStatus = async () => {
    if (employeeNumber.length !== 4) return

    try {
      const res = await fetch(`/api/employees/clock?employeeNumber=${employeeNumber}`)
      const data = await res.json()
      if (data.success) {
        setStatus({
          isClockedIn: data.isClockedIn,
          dailyTotal: data.dailyTotal || 0,
          employeeName: data.employeeName,
          lastEntry: data.lastEntry
        })
        setMessage(null)
      } else {
        setStatus(null)
        setMessage({ type: 'error', text: data.error || 'Employee not found' })
      }
    } catch (error) {
      console.error('Error fetching status:', error)
      setMessage({ type: 'error', text: 'Failed to fetch status' })
    }
  }

  const handleClock = async () => {
    if (employeeNumber.length !== 4) {
      setMessage({ type: 'error', text: 'Please enter a 4-digit employee number' })
      return
    }

    setClocking(true)
    setMessage(null)

    try {
      const res = await fetch('/api/employees/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber })
      })

      const data = await res.json()
      if (data.success) {
        setStatus({
          isClockedIn: data.entryType === 'clock_in',
          dailyTotal: data.dailyTotal || 0,
          employeeName: data.employeeName,
          lastEntry: data.entry
        })
        
        if (data.entryType === 'clock_out' && data.hoursWorked) {
          setMessage({
            type: 'success',
            text: `Clocked out. You worked ${data.hoursWorked.toFixed(2)} hours today.`
          })
        } else {
          setMessage({
            type: 'success',
            text: `Clocked ${data.entryType === 'clock_in' ? 'in' : 'out'} successfully.`
          })
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to clock in/out' })
      }
    } catch (error) {
      console.error('Error clocking in/out:', error)
      setMessage({ type: 'error', text: 'Failed to clock in/out' })
    } finally {
      setClocking(false)
      // Refresh status after a short delay
      setTimeout(() => {
        fetchStatus()
      }, 500)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full mb-4">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Time Clock</h1>
            <p className="text-slate-400">Enter your employee number to clock in or out</p>
          </div>

          {/* Current Date & Time */}
          <div className="bg-slate-900/50 rounded-lg p-4 mb-6 text-center border border-slate-700/50">
            <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">
                {currentTime.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </span>
            </div>
            <div className="text-3xl font-mono font-bold text-cyan-400">
              {currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
              })}
            </div>
          </div>

          {/* Employee Number Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Hash className="w-4 h-4 inline mr-1" />
              Employee Number
            </label>
            <input
              type="text"
              maxLength={4}
              value={employeeNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '')
                setEmployeeNumber(value)
              }}
              placeholder="1234"
              className="w-full px-4 py-4 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-center text-2xl font-mono focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              autoFocus
            />
          </div>

          {/* Status Display */}
          {status && (
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-1">Employee</div>
              <div className="text-lg font-semibold text-white mb-3">{status.employeeName}</div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400">Status</div>
                  <div className={`text-lg font-bold ${status.isClockedIn ? 'text-green-400' : 'text-red-400'}`}>
                    {status.isClockedIn ? 'Clocked In' : 'Clocked Out'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">Today's Total</div>
                  <div className="text-lg font-bold text-cyan-400">
                    {status.dailyTotal.toFixed(2)} hours
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-500/20 border border-green-500/50 text-green-400' 
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          {/* Clock Button */}
          <button
            onClick={handleClock}
            disabled={clocking || employeeNumber.length !== 4}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
              clocking || employeeNumber.length !== 4
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : status?.isClockedIn
                  ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25'
                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/25'
            }`}
          >
            {clocking ? (
              <span className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 animate-spin" />
                Processing...
              </span>
            ) : status?.isClockedIn ? (
              'Clock Out'
            ) : (
              'Clock In'
            )}
          </button>

          {/* Instructions */}
          <div className="mt-6 text-center text-sm text-slate-500">
            {status?.isClockedIn 
              ? 'Click "Clock Out" when you finish your shift'
              : 'Click "Clock In" to start your shift'
            }
          </div>
        </div>
      </div>
    </div>
  )
}


