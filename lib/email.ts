/**
 * Email Service for Support Notifications
 * Supports both SendGrid and Resend as providers
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.SUPPORT_FROM_EMAIL || 'support@choejewelers.com'
const FROM_NAME = process.env.SUPPORT_FROM_NAME || 'KISPER Support'

interface EmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

interface EmailResult {
  success: boolean
  provider?: string
  messageId?: string
  error?: string
}

/**
 * Send email using configured provider (SendGrid or Resend)
 */
export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  // Try Resend first (recommended)
  if (RESEND_API_KEY) {
    return sendWithResend(params)
  }
  
  // Fall back to SendGrid
  if (SENDGRID_API_KEY) {
    return sendWithSendGrid(params)
  }
  
  // No email provider configured - log and return success
  console.log(`[Email] No provider configured. Would send to ${params.to}: ${params.subject}`)
  return { 
    success: true, 
    provider: 'console',
    error: 'No email provider configured (set RESEND_API_KEY or SENDGRID_API_KEY)'
  }
}

async function sendWithResend(params: EmailParams): Promise<EmailResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || 'Resend API error')
    }

    console.log(`[Email/Resend] Sent to ${params.to}: ${params.subject}`)
    return { success: true, provider: 'resend', messageId: data.id }
  } catch (error: any) {
    console.error('[Email/Resend] Error:', error.message)
    return { success: false, provider: 'resend', error: error.message }
  }
}

async function sendWithSendGrid(params: EmailParams): Promise<EmailResult> {
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: params.subject,
        content: [
          { type: 'text/html', value: params.html },
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
        ],
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.errors?.[0]?.message || 'SendGrid API error')
    }

    console.log(`[Email/SendGrid] Sent to ${params.to}: ${params.subject}`)
    return { success: true, provider: 'sendgrid' }
  } catch (error: any) {
    console.error('[Email/SendGrid] Error:', error.message)
    return { success: false, provider: 'sendgrid', error: error.message }
  }
}

// =============================================
// Email Templates
// =============================================

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); padding: 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 32px 24px; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #6b7280; }
    .button { display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin: 16px 0; }
    .button:hover { background: #059669; }
    .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 16px 0; }
    .tracking-link { color: #10b981; text-decoration: none; font-weight: 500; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>KISPER</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>KISPER Jewelry</p>
      <p>Questions? Visit our <a href="${process.env.NEXT_PUBLIC_SUPPORT_URL || '/support'}">Support Center</a></p>
    </div>
  </div>
</body>
</html>
`

/**
 * Warranty Claim Confirmation Email
 */
export async function sendWarrantyConfirmation(params: {
  to: string
  customerName: string
  claimNumber: string
  claimType: 'REFUND' | 'REPLACEMENT'
  productName?: string
  returnLabelUrl?: string
}): Promise<EmailResult> {
  const { to, customerName, claimNumber, claimType, productName, returnLabelUrl } = params

  const content = `
    <h2>Warranty Claim Received</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Thank you for reaching out. Your warranty claim has been received and is being processed.</p>
    
    <div class="info-box">
      <p><strong>Claim Number:</strong> ${claimNumber}</p>
      <p><strong>Type:</strong> ${claimType === 'REFUND' ? 'Refund' : 'Replacement'}</p>
      ${productName ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
    </div>
    
    ${returnLabelUrl ? `
      <h3>Next Steps</h3>
      <p>Please use the prepaid return label below to ship your item back to us:</p>
      <p><a href="${returnLabelUrl}" class="button">Download Return Label</a></p>
      <p>Once we receive your return, we will process your ${claimType === 'REFUND' ? 'refund' : 'replacement'} within 2-3 business days.</p>
    ` : `
      <h3>Next Steps</h3>
      <p>Our team is preparing your return label. You'll receive another email shortly with shipping instructions.</p>
    `}
    
    <hr>
    <p>You can track the status of your claim anytime:</p>
    <p><a href="${process.env.NEXT_PUBLIC_SUPPORT_URL || ''}/warranty/${claimNumber}" class="tracking-link">Track Your Claim →</a></p>
  `

  return sendEmail({
    to,
    subject: `Warranty Claim ${claimNumber} - ${claimType === 'REFUND' ? 'Refund' : 'Replacement'} Request`,
    html: baseTemplate(content),
    text: `Warranty Claim ${claimNumber} received. Type: ${claimType}. ${returnLabelUrl ? `Return label: ${returnLabelUrl}` : 'Return label coming soon.'}`,
  })
}

/**
 * Warranty Claim Status Update Email
 */
export async function sendWarrantyStatusUpdate(params: {
  to: string
  customerName: string
  claimNumber: string
  status: string
  message?: string
}): Promise<EmailResult> {
  const { to, customerName, claimNumber, status, message } = params

  const statusMessages: Record<string, string> = {
    'RETURN_SHIPPED': 'We see your return is on its way! Thank you for sending it back.',
    'RETURN_DELIVERED': 'We\'ve received your return and it\'s being inspected.',
    'PROCESSING': 'Your claim is being processed. Almost there!',
    'COMPLETED': 'Great news! Your claim has been completed.',
    'CANCELLED': 'Your warranty claim has been cancelled.',
  }

  const content = `
    <h2>Claim Status Update</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>${statusMessages[status] || `Your claim status has been updated to: ${status}`}</p>
    
    ${message ? `<div class="info-box"><p>${message}</p></div>` : ''}
    
    <p><a href="${process.env.NEXT_PUBLIC_SUPPORT_URL || ''}/warranty/${claimNumber}" class="button">View Claim Details</a></p>
  `

  return sendEmail({
    to,
    subject: `Warranty Claim ${claimNumber} - Status Update`,
    html: baseTemplate(content),
    text: `Claim ${claimNumber} status: ${status}. ${message || ''}`,
  })
}

/**
 * Support Ticket Confirmation Email
 */
export async function sendTicketConfirmation(params: {
  to: string
  customerName: string
  ticketNumber: string
  subject: string
}): Promise<EmailResult> {
  const { to, customerName, ticketNumber, subject } = params

  const content = `
    <h2>Support Request Received</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>We've received your support request and will get back to you as soon as possible.</p>
    
    <div class="info-box">
      <p><strong>Ticket:</strong> ${ticketNumber}</p>
      <p><strong>Subject:</strong> ${subject}</p>
    </div>
    
    <p>Our support team typically responds within 24 hours during business days.</p>
    
    <hr>
    <p>In the meantime, you might find answers in our <a href="${process.env.NEXT_PUBLIC_SUPPORT_URL || ''}/faq" class="tracking-link">FAQ section</a>.</p>
  `

  return sendEmail({
    to,
    subject: `[${ticketNumber}] ${subject}`,
    html: baseTemplate(content),
    text: `Support ticket ${ticketNumber} created. Subject: ${subject}. We'll respond within 24 hours.`,
  })
}

/**
 * Ticket Reply Notification Email
 */
export async function sendTicketReply(params: {
  to: string
  customerName: string
  ticketNumber: string
  subject: string
  replyContent: string
  agentName?: string
}): Promise<EmailResult> {
  const { to, customerName, ticketNumber, subject, replyContent, agentName } = params

  const content = `
    <h2>New Reply to Your Support Request</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>${agentName || 'Our support team'} has replied to your request:</p>
    
    <div class="info-box">
      <p>${replyContent.replace(/\n/g, '<br>')}</p>
    </div>
    
    <p>You can reply to this email or visit our support center for more help.</p>
    
    <p><a href="${process.env.NEXT_PUBLIC_SUPPORT_URL || ''}/contact" class="button">Contact Support</a></p>
  `

  return sendEmail({
    to,
    subject: `Re: [${ticketNumber}] ${subject}`,
    html: baseTemplate(content),
    text: `Reply to ${ticketNumber}: ${replyContent}`,
  })
}

