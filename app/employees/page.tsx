'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Calendar, DollarSign, Hash, User, Clock, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import MainLayout from '@/components/layout/MainLayout'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface Employee {
  id: number
  employeeNumber: string
  name: string
  startDate: string
  payType: string | null
  payRate: number | null
  payPeriod: string | null
  isActive: boolean
  _count?: {
    timeEntries: number
  }
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTimesheetModal, setShowTimesheetModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [timesheetData, setTimesheetData] = useState<any>(null)
  const [timesheetLoading, setTimesheetLoading] = useState(false)
  const [timesheetDate, setTimesheetDate] = useState<Date>(new Date()) // For navigating between periods
  
  const [formData, setFormData] = useState({
    employeeNumber: '',
    name: '',
    startDate: '',
    payType: '',
    payRate: '',
    payPeriod: 'weekly',
    isActive: true
  })

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees')
      const data = await res.json()
      if (data.success) {
        setEmployees(data.employees)
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmployee = async () => {
    if (!formData.employeeNumber || !formData.name || !formData.startDate) {
      alert('Please fill in employee number, name, and start date')
      return
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await res.json()
      if (data.success) {
        setShowAddModal(false)
        setFormData({
          employeeNumber: '',
          name: '',
          startDate: '',
          payType: '',
          payRate: '',
          payPeriod: 'weekly',
          isActive: true
        })
        fetchEmployees()
      } else {
        alert(data.error || 'Failed to add employee')
      }
    } catch (error) {
      console.error('Error adding employee:', error)
      alert('Failed to add employee')
    }
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      employeeNumber: employee.employeeNumber,
      name: employee.name,
      startDate: employee.startDate.split('T')[0],
      payType: employee.payType || '',
      payRate: employee.payRate ? employee.payRate.toString() : '',
      payPeriod: employee.payPeriod || 'weekly',
      isActive: employee.isActive
    })
    setShowEditModal(true)
  }

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return

    if (!formData.employeeNumber || !formData.name || !formData.startDate) {
      alert('Please fill in employee number, name, and start date')
      return
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEmployee.id,
          ...formData
        })
      })

      const data = await res.json()
      if (data.success) {
        setShowEditModal(false)
        setEditingEmployee(null)
        setFormData({
          employeeNumber: '',
          name: '',
          startDate: '',
          payType: '',
          payRate: '',
          payPeriod: 'weekly',
          isActive: true
        })
        fetchEmployees()
      } else {
        alert(data.error || 'Failed to update employee')
      }
    } catch (error) {
      console.error('Error updating employee:', error)
      alert('Failed to update employee')
    }
  }

  const handleDeleteEmployee = async (id: number) => {
    if (!confirm('Are you sure you want to delete this employee?')) return

    try {
      const res = await fetch(`/api/employees?id=${id}`, {
        method: 'DELETE'
      })

      const data = await res.json()
      if (data.success) {
        fetchEmployees()
      } else {
        alert(data.error || 'Failed to delete employee')
      }
    } catch (error) {
      console.error('Error deleting employee:', error)
      alert('Failed to delete employee')
    }
  }

  const handleViewTimesheet = async (employee: Employee, referenceDate?: Date) => {
    setSelectedEmployee(employee)
    setShowTimesheetModal(true)
    setTimesheetLoading(true)

    try {
      // Use referenceDate if provided, otherwise use current timesheetDate
      const dateToUse = referenceDate || timesheetDate
      const dateParam = dateToUse.toISOString().split('T')[0]
      
      // Fetch timesheet - API will automatically calculate date range based on pay period
      const res = await fetch(`/api/employees/timesheet?employeeId=${employee.id}&referenceDate=${dateParam}`)
      const data = await res.json()
      if (data.success) {
        setTimesheetData(data.timesheet[0] || null)
        setTimesheetDate(dateToUse)
      }
    } catch (error) {
      console.error('Error fetching timesheet:', error)
    } finally {
      setTimesheetLoading(false)
    }
  }

  const handlePreviousPeriod = () => {
    if (!selectedEmployee) return
    
    const payPeriod = selectedEmployee.payPeriod || 'weekly'
    const newDate = new Date(timesheetDate)
    
    if (payPeriod === 'weekly') {
      newDate.setDate(newDate.getDate() - 7)
    } else if (payPeriod === 'bi-weekly') {
      const day = newDate.getDate()
      if (day <= 15) {
        // Currently in first half, go to previous month's second half
        newDate.setMonth(newDate.getMonth() - 1)
        const daysInPrevMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate()
        newDate.setDate(16)
      } else {
        // Currently in second half, go to first half of same month
        newDate.setDate(1)
      }
    } else {
      // Monthly
      newDate.setMonth(newDate.getMonth() - 1)
      newDate.setDate(1)
    }
    
    handleViewTimesheet(selectedEmployee, newDate)
  }

  const handleNextPeriod = () => {
    if (!selectedEmployee) return
    
    const payPeriod = selectedEmployee.payPeriod || 'weekly'
    const newDate = new Date(timesheetDate)
    
    if (payPeriod === 'weekly') {
      newDate.setDate(newDate.getDate() + 7)
    } else if (payPeriod === 'bi-weekly') {
      const day = newDate.getDate()
      if (day <= 15) {
        // Currently in first half, go to second half of same month
        newDate.setDate(16)
      } else {
        // Currently in second half, go to next month's first half
        newDate.setMonth(newDate.getMonth() + 1)
        newDate.setDate(1)
      }
    } else {
      // Monthly
      newDate.setMonth(newDate.getMonth() + 1)
      newDate.setDate(1)
    }
    
    handleViewTimesheet(selectedEmployee, newDate)
  }

  const handleCurrentPeriod = () => {
    if (!selectedEmployee) return
    handleViewTimesheet(selectedEmployee, new Date())
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-slate-400">Loading...</div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Employees</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Manage employee information and timesheets</p>
          </div>
          <div className="flex items-center gap-3">
          <a
            href="/time-clock"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Employee Portal
          </a>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Employee #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Start Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Pay Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-[var(--muted-foreground)]">
                  No employees found. Add your first employee to get started.
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-[var(--hover-bg)]">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Hash className="w-4 h-4 text-[var(--muted-foreground)] mr-2" />
                      <span className="font-mono font-medium text-[var(--foreground)]">
                        {employee.employeeNumber}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[var(--foreground)]">
                    {employee.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[var(--muted-foreground)]">
                    {new Date(employee.startDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.payType ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-cyan-500/20 text-cyan-400 capitalize">
                        {employee.payType}
                      </span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[var(--foreground)]">
                    {employee.payRate ? (
                      <>
                        ${Number(employee.payRate).toFixed(2)}
                        {employee.payType === 'hourly' ? '/hr' : ''}
                      </>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewTimesheet(employee)}
                        className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-colors"
                        title="View Timesheet"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditEmployee(employee)}
                        className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                        title="Edit Employee"
                      >
                        <User className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(employee.id)}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Delete Employee"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Employee"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <Hash className="w-4 h-4 inline mr-1" />
              4-Digit Employee Number
            </label>
            <input
              type="text"
              maxLength={4}
              value={formData.employeeNumber}
              onChange={(e) => setFormData({ ...formData, employeeNumber: e.target.value.replace(/\D/g, '') })}
              placeholder="1234"
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <User className="w-4 h-4 inline mr-1" />
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Employee Name"
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Pay Type <span className="text-[var(--muted-foreground)] text-xs">(Optional)</span>
            </label>
            <select
              value={formData.payType}
              onChange={(e) => setFormData({ ...formData, payType: e.target.value, payRate: '' })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            >
              <option value="">Not specified</option>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
          </div>

          {formData.payType && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                {formData.payType === 'hourly' ? 'Hourly Rate' : 'Salary'} <span className="text-[var(--muted-foreground)] text-xs">(Optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.payRate}
                onChange={(e) => setFormData({ ...formData, payRate: e.target.value })}
                placeholder={formData.payType === 'hourly' ? '15.00' : '50000.00'}
                className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Pay Period
            </label>
            <select
              value={formData.payPeriod}
              onChange={(e) => setFormData({ ...formData, payPeriod: e.target.value })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            >
              <option value="weekly">Weekly (Week ending Saturday)</option>
              <option value="bi-weekly">Bi-Weekly (1-15, 16-30/31)</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEmployee}>
              Add Employee
            </Button>
          </div>
        </div>
      </Modal>

      {/* Timesheet Modal */}
      <Modal
        isOpen={showTimesheetModal}
        onClose={() => {
          setShowTimesheetModal(false)
          setSelectedEmployee(null)
          setTimesheetData(null)
        }}
        title={`Timesheet - ${selectedEmployee?.name} (${selectedEmployee?.employeeNumber})`}
      >
        {timesheetLoading ? (
          <div className="text-center py-8 text-[var(--muted-foreground)]">Loading...</div>
        ) : timesheetData ? (
          <div className="space-y-4">
            {/* Period Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={handlePreviousPeriod}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--hover-bg)] rounded-lg transition-colors border border-[var(--border)]"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <div className="flex-1 text-center">
                <div className="text-lg font-semibold text-[var(--foreground)]">
                  {timesheetData.periodLabel || 'Period Total'}
                </div>
                {timesheetDate.toDateString() !== new Date().toDateString() && (
                  <button
                    onClick={handleCurrentPeriod}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                  >
                    Go to current period
                  </button>
                )}
              </div>
              
              <button
                onClick={handleNextPeriod}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--hover-bg)] rounded-lg transition-colors border border-[var(--border)]"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Period Total */}
            <div className="bg-[var(--muted)] rounded-lg p-4">
              <div className="text-sm text-[var(--muted-foreground)]">Period Total</div>
              <div className="text-2xl font-bold text-[var(--foreground)] mt-1">
                {timesheetData.periodTotal?.toFixed(2) || timesheetData.days.reduce((sum: number, day: any) => sum + day.totalHours, 0).toFixed(2)} hours
              </div>
            </div>

            {/* Daily Breakdown */}
            {timesheetData.days.length > 0 ? (
              <div className="max-h-96 overflow-y-auto space-y-3">
                {timesheetData.days.map((day: any) => (
                <div key={day.date} className="border border-[var(--border)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-[var(--foreground)]">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="text-lg font-bold text-cyan-400">
                      {day.totalHours.toFixed(2)} hours
                    </div>
                  </div>
                  <div className="space-y-1 mt-2">
                    {day.entries.map((entry: any) => (
                      <div key={entry.id} className="text-sm text-[var(--muted-foreground)] flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${entry.entryType === 'clock_in' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        <span className="capitalize">{entry.entryType.replace('_', ' ')}</span>
                        <span className="ml-auto">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        {entry.hoursWorked && (
                          <span className="text-cyan-400 font-medium">
                            ({entry.hoursWorked.toFixed(2)}h)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--muted-foreground)]">
            No timesheet data for this period
          </div>
        )}
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingEmployee(null)
          setFormData({
            employeeNumber: '',
            name: '',
            startDate: '',
            payType: '',
            payRate: '',
            payPeriod: 'weekly',
            isActive: true
          })
        }}
        title="Edit Employee"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <Hash className="w-4 h-4 inline mr-1" />
              4-Digit Employee Number
            </label>
            <input
              type="text"
              maxLength={4}
              value={formData.employeeNumber}
              onChange={(e) => setFormData({ ...formData, employeeNumber: e.target.value.replace(/\D/g, '') })}
              placeholder="1234"
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <User className="w-4 h-4 inline mr-1" />
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Employee Name"
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Pay Type <span className="text-[var(--muted-foreground)] text-xs">(Optional)</span>
            </label>
            <select
              value={formData.payType}
              onChange={(e) => setFormData({ ...formData, payType: e.target.value, payRate: '' })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            >
              <option value="">Not specified</option>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
          </div>

          {formData.payType && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                {formData.payType === 'hourly' ? 'Hourly Rate' : 'Salary'} <span className="text-[var(--muted-foreground)] text-xs">(Optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.payRate}
                onChange={(e) => setFormData({ ...formData, payRate: e.target.value })}
                placeholder={formData.payType === 'hourly' ? '15.00' : '50000.00'}
                className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Pay Period
            </label>
            <select
              value={formData.payPeriod}
              onChange={(e) => setFormData({ ...formData, payPeriod: e.target.value })}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
            >
              <option value="weekly">Weekly (Week ending Saturday)</option>
              <option value="bi-weekly">Bi-Weekly (1-15, 16-30/31)</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--foreground)]">Active Employee</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => {
              setShowEditModal(false)
              setEditingEmployee(null)
              setFormData({
                employeeNumber: '',
                name: '',
                startDate: '',
                payType: '',
                payRate: '',
                payPeriod: 'weekly',
                isActive: true
              })
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEmployee}>
              Update Employee
            </Button>
          </div>
        </div>
      </Modal>
      </div>
    </MainLayout>
  )
}

