# AI Insights Setup Guide

## Overview

The AI Insights system proactively monitors your inventory and sales data to generate helpful observations. The insights card will always appear on your dashboard.

## Automatic Setup

The AI Insights card is automatically added to your dashboard when you:
1. Load the dashboard page
2. The card configuration API initializes default cards
3. The `ai_insights` card is enabled by default in the right column

## Manual Insight Generation

### Option 1: Via API Endpoint

```bash
# Generate insights manually
curl -X POST http://localhost:3000/api/ai/insights/generate
```

### Option 2: Via Script

```bash
npm run generate-insights
```

## Scheduled Insight Generation

To automatically generate insights daily, set up a cron job:

### Railway

1. Add `CRON_SECRET` to your Railway environment variables
2. Railway will automatically use the `railway.json` configuration
3. The cron job runs daily at 9 AM UTC

### Vercel

1. Add `CRON_SECRET` to your Vercel environment variables
2. Vercel will automatically use the `vercel.json` configuration
3. The cron job runs daily at 9 AM UTC

### Manual Cron Setup (Linux/Mac)

Add to your crontab (`crontab -e`):

```bash
# Generate insights daily at 9 AM
0 9 * * * curl -X GET https://your-domain.com/api/cron/insights -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to "Daily" at 9:00 AM
4. Set action to "Start a program"
5. Program: `curl`
6. Arguments: `-X GET https://your-domain.com/api/cron/insights -H "Authorization: Bearer YOUR_CRON_SECRET"`

## Security

The cron endpoint is protected by the `CRON_SECRET` environment variable. Make sure to:
1. Set a strong secret: `CRON_SECRET=your-random-secret-here`
2. Never commit this secret to version control
3. Use the same secret in your cron job configuration

## What Gets Monitored

The system automatically checks for:
- **Out of Stock Items**: Items that have been out of stock recently
- **Sales Spikes**: SKUs with unusual sales increases (50%+ above average)
- **Late Shipments**: Purchase orders that are past their expected arrival date
- **Low Stock Without POs**: Items running low on stock with no pending purchase orders

## Viewing Insights

1. Open your dashboard
2. Look for the "AI Insights" card in the right column
3. Click "Respond" on any insight to have a conversation with the AI
4. Click the X to dismiss insights you're not interested in

## Troubleshooting

### Insights not appearing?

1. Check that insights have been generated:
   ```bash
   npm run generate-insights
   ```

2. Verify the card is enabled:
   - Check the dashboard card configuration
   - The `ai_insights` card should be enabled by default

3. Check the database:
   ```sql
   SELECT * FROM ai_observations WHERE status = 'new' ORDER BY created_at DESC;
   ```

### Cron job not running?

1. Verify `CRON_SECRET` is set in your environment
2. Check cron logs for errors
3. Test the endpoint manually:
   ```bash
   curl -X GET https://your-domain.com/api/cron/insights -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

