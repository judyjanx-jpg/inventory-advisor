'use client'

import { Shield, Lock, Eye, FileText, Users, Globe } from 'lucide-react'

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 md:p-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
            <p className="text-slate-500 dark:text-slate-400">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          {/* Introduction */}
          <section className="mb-8">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We are committed to protecting your privacy and ensuring the security of your personal information. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you 
              use our customer support portal and services.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Information We Collect</h2>
            </div>
            <div className="space-y-4 text-slate-600 dark:text-slate-300">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Personal Information</h3>
                <p>We may collect personal information that you provide to us, including:</p>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>Name and contact information (email address, phone number, mailing address)</li>
                  <li>Order information (order numbers, product details, purchase history)</li>
                  <li>Account information (if you create an account with us)</li>
                  <li>Communication records (correspondence with our support team)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Automatically Collected Information</h3>
                <p>When you visit our portal, we may automatically collect certain information, including:</p>
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>Device information (IP address, browser type, operating system)</li>
                  <li>Usage data (pages visited, time spent, click patterns)</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">How We Use Your Information</h2>
            </div>
            <div className="space-y-3 text-slate-600 dark:text-slate-300">
              <p>We use the information we collect for the following purposes:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>To provide, maintain, and improve our customer support services</li>
                <li>To process and respond to your inquiries, requests, and warranty claims</li>
                <li>To track and manage your orders and replacements</li>
                <li>To communicate with you about your account, orders, and our services</li>
                <li>To detect, prevent, and address technical issues and security threats</li>
                <li>To comply with legal obligations and enforce our terms of service</li>
                <li>To analyze usage patterns and improve user experience</li>
              </ul>
            </div>
          </section>

          {/* Information Sharing and Disclosure */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Information Sharing and Disclosure</h2>
            </div>
            <div className="space-y-3 text-slate-600 dark:text-slate-300">
              <p>We do not sell your personal information. We may share your information only in the following circumstances:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li><strong>Service Providers:</strong> With trusted third-party service providers who assist us in operating our portal and conducting our business</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> When you have given us explicit permission to share your information</li>
                <li><strong>Protection of Rights:</strong> To protect our rights, property, or safety, or that of our users or others</li>
              </ul>
            </div>
          </section>

          {/* Data Security */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Data Security</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              We implement appropriate technical and organizational security measures to protect your personal information 
              against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over 
              the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Your Rights</h2>
            </div>
            <div className="space-y-3 text-slate-600 dark:text-slate-300">
              <p>Depending on your location, you may have the following rights regarding your personal information:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li><strong>Access:</strong> Request access to the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Objection:</strong> Object to processing of your personal information</li>
                <li><strong>Portability:</strong> Request transfer of your information to another service</li>
                <li><strong>Withdrawal of Consent:</strong> Withdraw consent where processing is based on consent</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us using the information provided in the "Contact Us" section below.
              </p>
            </div>
          </section>

          {/* Cookies */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Cookies and Tracking Technologies</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-3">
              We use cookies and similar tracking technologies to enhance your experience on our portal. Cookies are small 
              data files stored on your device that help us remember your preferences and improve site functionality.
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              You can control cookies through your browser settings. However, disabling cookies may limit your ability to 
              use certain features of our portal.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Children's Privacy</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Our services are not directed to individuals under the age of 13. We do not knowingly collect personal 
              information from children under 13. If you believe we have collected information from a child under 13, 
              please contact us immediately.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Changes to This Privacy Policy</h2>
            <p className="text-slate-600 dark:text-slate-300">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting 
              the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this 
              Privacy Policy periodically to stay informed about how we protect your information.
            </p>
          </section>

          {/* Contact Us */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Contact Us</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-3">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, 
              please contact us:
            </p>
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Customer Support Portal</strong><br />
                Email: <a href="/portal/support" className="text-cyan-600 dark:text-cyan-400 hover:underline">Contact Support</a><br />
                Through our support portal: <a href="/portal/support" className="text-cyan-600 dark:text-cyan-400 hover:underline">/portal/support</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

