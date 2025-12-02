'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface UploadResult {
  success: boolean
  file: string
  ordersCreated: number
  ordersUpdated: number
  itemsProcessed: number
  skipped: number
  errors: number
  error?: string
}

export default function UploadReportsPage() {
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setUploading(true)

    for (const file of Array.from(files)) {
      console.log(`Uploading: ${file.name}`)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/amazon/sync/upload-report', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        setResults(prev => [...prev, {
          success: response.ok,
          file: file.name,
          ordersCreated: result.ordersCreated || 0,
          ordersUpdated: result.ordersUpdated || 0,
          itemsProcessed: result.itemsProcessed || 0,
          skipped: result.skipped || 0,
          errors: result.errors || 0,
          error: result.error,
        }])

      } catch (error: any) {
        setResults(prev => [...prev, {
          success: false,
          file: file.name,
          ordersCreated: 0,
          ordersUpdated: 0,
          itemsProcessed: 0,
          skipped: 0,
          errors: 1,
          error: error.message,
        }])
      }
    }

    setUploading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  const totals = results.reduce((acc, r) => ({
    ordersCreated: acc.ordersCreated + r.ordersCreated,
    ordersUpdated: acc.ordersUpdated + r.ordersUpdated,
    itemsProcessed: acc.itemsProcessed + r.itemsProcessed,
    skipped: acc.skipped + r.skipped,
    errors: acc.errors + r.errors,
  }), { ordersCreated: 0, ordersUpdated: 0, itemsProcessed: 0, skipped: 0, errors: 0 })

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Upload Amazon Reports</h1>
          <p className="text-slate-400">
            Manually upload FBA Shipments reports from Amazon Seller Central
          </p>
        </div>
        <Link href="/settings/amazon">
          <Button variant="outline">← Back to Settings</Button>
        </Link>
      </div>

      {/* Instructions */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">How to get reports from Amazon</CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-2">
          <ol className="list-decimal list-inside space-y-2">
            <li>Go to <strong>Amazon Seller Central → Reports → Fulfillment</strong></li>
            <li>Select <strong>"Amazon Fulfilled Shipments"</strong></li>
            <li>Choose a date range (up to 30 days per report)</li>
            <li>Click <strong>"Request Download"</strong></li>
            <li>Wait for the report to generate, then download the <strong>.txt</strong> file</li>
            <li>Upload the file(s) here</li>
          </ol>
          <p className="text-sm text-slate-400 mt-4">
            Tip: You can upload multiple files at once. Drag and drop or click to select.
          </p>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors
              ${dragOver 
                ? 'border-blue-500 bg-blue-500/10' 
                : 'border-slate-600 hover:border-slate-500'}
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.tsv,.csv"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
                <p className="text-white">Processing files...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Upload className="h-12 w-12 text-slate-400" />
                <div>
                  <p className="text-white text-lg">
                    Drop report files here or click to browse
                  </p>
                  <p className="text-slate-400 text-sm mt-1">
                    Accepts .txt, .tsv, or .csv files
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Upload Results</CardTitle>
            <CardDescription>
              Total: {totals.ordersCreated} created, {totals.ordersUpdated} updated, {totals.itemsProcessed} items
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`
                    flex items-center justify-between p-4 rounded-lg
                    ${result.success ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-white font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {result.file}
                      </p>
                      {result.success ? (
                        <p className="text-sm text-slate-400">
                          {result.ordersCreated} created, {result.ordersUpdated} updated, {result.itemsProcessed} items
                          {result.skipped > 0 && `, ${result.skipped} skipped`}
                        </p>
                      ) : (
                        <p className="text-sm text-red-400">{result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Clear Results Button */}
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => setResults([])}
              >
                Clear Results
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


