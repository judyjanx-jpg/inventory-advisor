'use client'

import { useState, useEffect } from 'react'
import { Clock, Hash, Calendar, Edit, X, LogOut } from 'lucide-react'

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
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualEntry, setManualEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    clockInTime: '',
    clockOutTime: '',
    hours: ''
  })
  const [savingManual, setSavingManual] = useState(false)
  const [useManualTime, setUseManualTime] = useState(false)
  const [manualTime, setManualTime] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5) // HH:MM format
  })

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleClearEmployee = () => {
    setEmployeeNumber('')
    setStatus(null)
    setMessage(null)
    setUseManualTime(false)
    setManualTime({
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5)
    })
  }

  // Fetch status when employee number changes
  useEffect(() => {
    if (employeeNumber.length === 4) {
      fetchStatus()
    } else {
      setStatus(null)
    }
  }, [employeeNumber])

  // Auto-refresh status every 30 seconds when clocked in
  useEffect(() => {
    if (!status || !status.isClockedIn || employeeNumber.length !== 4) {
      return
    }

    const interval = setInterval(() => {
      fetchStatus()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [status?.isClockedIn, employeeNumber])

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
      // If manual time is enabled, create a custom timestamp
      let customTimestamp: string | null = null
      if (useManualTime) {
        const manualDateTime = new Date(`${manualTime.date}T${manualTime.time}`)
        customTimestamp = manualDateTime.toISOString()
      }

      const res = await fetch('/api/employees/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          employeeNumber,
          timestamp: customTimestamp
        })
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
      // Reset manual time after clocking
      if (useManualTime) {
        setUseManualTime(false)
        setManualTime({
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().slice(0, 5)
        })
      }
      // Refresh status after a short delay
      setTimeout(() => {
        fetchStatus()
      }, 500)
    }
  }

  const handleManualEntry = async () => {
    if (!manualEntry.date || (!manualEntry.clockInTime && !manualEntry.clockOutTime && !manualEntry.hours)) {
      setMessage({ type: 'error', text: 'Please fill in at least date and time or hours' })
      return
    }

    setSavingManual(true)
    setMessage(null)

    try {
      const res = await fetch('/api/employees/clock/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeNumber,
          date: manualEntry.date,
          clockInTime: manualEntry.clockInTime || null,
          clockOutTime: manualEntry.clockOutTime || null,
          hours: manualEntry.hours ? parseFloat(manualEntry.hours) : null
        })
      })

      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: 'Manual time entry added successfully' })
        setShowManualEntry(false)
        setManualEntry({
          date: new Date().toISOString().split('T')[0],
          clockInTime: '',
          clockOutTime: '',
          hours: ''
        })
        setTimeout(() => {
          fetchStatus()
        }, 500)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add manual time entry' })
      }
    } catch (error) {
      console.error('Error adding manual time entry:', error)
      setMessage({ type: 'error', text: 'Failed to add manual time entry' })
    } finally {
      setSavingManual(false)
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
                {(() => {
                  const dateToShow = useManualTime 
                    ? new Date(`${manualTime.date}T${manualTime.time}`)
                    : currentTime
                  // Use local date components to avoid timezone issues
                  const year = dateToShow.getFullYear()
                  const month = dateToShow.getMonth()
                  const day = dateToShow.getDate()
                  const weekday = dateToShow.getDay()
                  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                  return `${weekdays[weekday]}, ${months[month]} ${day}, ${year}`
                })()}
              </span>
            </div>
            <div className="text-3xl font-mono font-bold text-cyan-400 mb-3">
              {useManualTime
                ? (() => {
                    const manualDateTime = new Date(`${manualTime.date}T${manualTime.time}`)
                    return manualDateTime.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      hour12: false
                    })
                  })()
                : currentTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false
                  })
            }
            </div>
            
            {/* Manual Time Toggle */}
            <button
              onClick={() => {
                setUseManualTime(!useManualTime)
                if (!useManualTime) {
                  // When enabling, set default to current time
                  setManualTime({
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toTimeString().slice(0, 5)
                  })
                }
              }}
              className={`text-xs px-3 py-1 rounded-md transition-all ${
                useManualTime
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
              }`}
            >
              {useManualTime ? 'Using Manual Time' : 'Manual Time'}
            </button>
          </div>

          {/* Manual Time Inputs */}
          {useManualTime && (
            <div className="bg-slate-900/30 rounded-lg p-4 mb-6 border border-slate-700/30">
              <div className="text-sm text-slate-400 mb-3">Set custom time for clock in/out:</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={manualTime.date}
                    onChange={(e) => setManualTime({ ...manualTime, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time</label>
                  <input
                    type="time"
                    value={manualTime.time}
                    onChange={(e) => setManualTime({ ...manualTime, time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>
            </div>
          )}

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
          {status && (() => {
            // Calculate real-time hours if clocked in
            // The API returns dailyTotal which includes completed sessions
            // We need to add the current session hours in real-time
            let displayTotal = status.dailyTotal
            if (status.isClockedIn && status.lastEntry) {
              const clockInTime = new Date(status.lastEntry.timestamp)
              const now = currentTime // Use currentTime which updates every second
              const currentSessionMs = now.getTime() - clockInTime.getTime()
              const currentSessionHours = currentSessionMs / (1000 * 60 * 60)
              // dailyTotal from API includes completed sessions only
              // Add the current active session hours
              displayTotal = status.dailyTotal + currentSessionHours
            }
            
            return (
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
                      {displayTotal.toFixed(2)} hours
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

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

          {/* Manual Time Entry Button */}
          {status && (
            <button
              onClick={() => setShowManualEntry(true)}
              className="mt-4 w-full py-2 rounded-lg font-medium text-sm bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-all flex items-center justify-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Add Manual Time
            </button>
          )}

          {/* Exit Button - Always visible when employee is entered */}
          {employeeNumber.length === 4 && (
            <button
              onClick={handleClearEmployee}
              className="mt-4 w-full py-2 rounded-lg font-medium text-sm bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-all flex items-center justify-center gap-2"
              title="Clear employee and allow another employee to clock in"
            >
              <LogOut className="w-4 h-4" />
              Exit / Clear Employee
            </button>
          )}
        </div>
      </div>

      {/* Manual Time Entry Modal */}
      {showManualEntry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add Manual Time Entry</h2>
              <button
                onClick={() => {
                  setShowManualEntry(false)
                  setManualEntry({
                    date: new Date().toISOString().split('T')[0],
                    clockInTime: '',
                    clockOutTime: '',
                    hours: ''
                  })
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={manualEntry.date}
                  onChange={(e) => setManualEntry({ ...manualEntry, date: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Clock In Time
                  </label>
                  <input
                    type="time"
                    value={manualEntry.clockInTime}
                    onChange={(e) => setManualEntry({ ...manualEntry, clockInTime: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Clock Out Time
                  </label>
                  <input
                    type="time"
                    value={manualEntry.clockOutTime}
                    onChange={(e) => setManualEntry({ ...manualEntry, clockOutTime: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Or Enter Hours Directly
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualEntry.hours}
                  onChange={(e) => setManualEntry({ ...manualEntry, hours: e.target.value })}
                  placeholder="8.5"
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Leave blank if using clock in/out times above
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowManualEntry(false)
                    setManualEntry({
                      date: new Date().toISOString().split('T')[0],
                      clockInTime: '',
                      clockOutTime: '',
                      hours: ''
                    })
                  }}
                  className="flex-1 py-2 rounded-lg font-medium bg-slate-700 hover:bg-slate-600 text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualEntry}
                  disabled={savingManual}
                  className="flex-1 py-2 rounded-lg font-medium bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingManual ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


