'use client'

import { useState } from 'react'
import {
  Shield,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Camera,
  FileText,
  X
} from 'lucide-react'

interface FormData {
  orderNumber: string
  email: string
  name: string
  phone: string
  productSku: string
  purchaseDate: string
  issueType: string
  issueDescription: string
  preferredResolution: string
}

const issueTypes = [
  'Product not working',
  'Physical damage on arrival',
  'Missing parts',
  'Quality defect',
  'Wrong item received',
  'Other',
]

const resolutionOptions = [
  'Replacement',
  'Refund',
  'Repair',
  'Exchange for different product',
  'Store credit',
]

export default function WarrantyClaimPage() {
  const [formData, setFormData] = useState<FormData>({
    orderNumber: '',
    email: '',
    name: '',
    phone: '',
    productSku: '',
    purchaseDate: '',
    issueType: '',
    issueDescription: '',
    preferredResolution: '',
  })
  const [images, setImages] = useState<File[]>([])
  const [imagePreview, setImagePreview] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    success: boolean
    message: string
    claimId?: string
  } | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length + images.length > 5) {
      alert('Maximum 5 images allowed')
      return
    }

    setImages(prev => [...prev, ...files])

    // Create previews
    files.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
    setImagePreview(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitResult(null)

    try {
      // Create FormData for file upload
      const submitData = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        submitData.append(key, value)
      })
      images.forEach(image => {
        submitData.append('images', image)
      })

      const res = await fetch('/api/portal/warranty/submit', {
        method: 'POST',
        body: submitData,
      })

      const data = await res.json()

      if (data.success) {
        setSubmitResult({
          success: true,
          message: 'Your warranty claim has been submitted successfully!',
          claimId: data.claimId,
        })
        // Reset form
        setFormData({
          orderNumber: '',
          email: '',
          name: '',
          phone: '',
          productSku: '',
          purchaseDate: '',
          issueType: '',
          issueDescription: '',
          preferredResolution: '',
        })
        setImages([])
        setImagePreview([])
      } else {
        setSubmitResult({
          success: false,
          message: data.error || 'Failed to submit warranty claim. Please try again.',
        })
      }
    } catch (error) {
      setSubmitResult({
        success: false,
        message: 'Unable to submit claim. Please try again later.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFormValid = formData.orderNumber && formData.email && formData.name &&
    formData.issueType && formData.issueDescription && formData.preferredResolution

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Warranty Claim</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Submit a claim for defective or damaged products
        </p>
      </div>

      {/* Success/Error Message */}
      {submitResult && (
        <div className={`rounded-xl p-6 ${
          submitResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-start gap-3">
            {submitResult.success ? (
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            )}
            <div>
              <p className={`font-medium ${
                submitResult.success
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {submitResult.success ? 'Claim Submitted!' : 'Submission Failed'}
              </p>
              <p className={`text-sm mt-1 ${
                submitResult.success
                  ? 'text-green-600 dark:text-green-300'
                  : 'text-red-600 dark:text-red-300'
              }`}>
                {submitResult.message}
              </p>
              {submitResult.claimId && (
                <p className="text-sm text-green-600 dark:text-green-300 mt-2">
                  <strong>Claim ID:</strong> {submitResult.claimId}<br />
                  <span className="text-xs">Save this ID to track your claim status</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Claim Form */}
      {!submitResult?.success && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Information */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-500" />
              Order Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Order Number *
                </label>
                <input
                  type="text"
                  name="orderNumber"
                  value={formData.orderNumber}
                  onChange={handleInputChange}
                  placeholder="e.g., ORD-12345"
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Product SKU (if known)
                </label>
                <input
                  type="text"
                  name="productSku"
                  value={formData.productSku}
                  onChange={handleInputChange}
                  placeholder="e.g., PRD-ABC123"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Purchase Date
                </label>
                <input
                  type="date"
                  name="purchaseDate"
                  value={formData.purchaseDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Contact Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Phone Number (optional)
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="For urgent issues"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Issue Details */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Issue Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Issue Type *
                </label>
                <select
                  name="issueType"
                  value={formData.issueType}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                >
                  <option value="">Select an issue type</option>
                  {issueTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Describe the Issue *
                </label>
                <textarea
                  name="issueDescription"
                  value={formData.issueDescription}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  placeholder="Please provide as much detail as possible about the problem..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Preferred Resolution *
                </label>
                <select
                  name="preferredResolution"
                  value={formData.preferredResolution}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none"
                >
                  <option value="">Select preferred resolution</option>
                  {resolutionOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Photo Upload */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Camera className="w-5 h-5 text-red-500" />
              Photos (Optional but Recommended)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Upload photos of the damage or defect to help us process your claim faster. Max 5 images.
            </p>

            {/* Image Previews */}
            {imagePreview.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
                {imagePreview.map((preview, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {images.length < 5 && (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Click to upload photos</span>
                <span className="text-xs text-slate-400 mt-1">{5 - images.length} remaining</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold rounded-xl hover:from-red-600 hover:to-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting Claim...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Submit Warranty Claim
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            By submitting this form, you agree to our warranty terms and conditions.
            We typically respond within 1-2 business days.
          </p>
        </form>
      )}
    </div>
  )
}
