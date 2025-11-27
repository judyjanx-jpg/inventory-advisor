# 🚀 Step-by-Step Setup Guide

## Prerequisites Check ✅
- ✅ Node.js v24.11.1 (installed)
- ✅ npm 11.6.2 (installed)
- ⚠️ PostgreSQL (needs to be set up)

## Step 1: Create Environment File

Create a `.env` file in the root directory with the following content:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/inventory_advisor"

# Next.js
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**Replace the DATABASE_URL with your actual PostgreSQL credentials:**
- `user`: Your PostgreSQL username (default is often `postgres`)
- `password`: Your PostgreSQL password
- `localhost:5432`: Database host and port (default PostgreSQL port)
- `inventory_advisor`: Database name

## Step 2: Set Up PostgreSQL Database

### Option A: Install PostgreSQL Locally

1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Install it (remember the password you set for the `postgres` user)
3. Open pgAdmin or psql command line
4. Create the database:
   ```sql
   CREATE DATABASE inventory_advisor;
   ```

### Option B: Use a Cloud Database (Recommended for Development)

1. **Supabase** (Free tier available):
   - Go to https://supabase.com
   - Create a new project
   - Copy the connection string from Settings > Database
   - Use it as your `DATABASE_URL`

2. **Neon** (Free tier available):
   - Go to https://neon.tech
   - Create a new project
   - Copy the connection string
   - Use it as your `DATABASE_URL`

3. **Railway** (Free tier available):
   - Go to https://railway.app
   - Create a new PostgreSQL database
   - Copy the connection string
   - Use it as your `DATABASE_URL`

## Step 3: Update .env File

Once you have your database connection string, update the `.env` file:

```env
DATABASE_URL="your_actual_connection_string_here"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Step 4: Generate Prisma Client

```bash
npm run db:generate
```

## Step 5: Push Database Schema

```bash
npm run db:push
```

This will create all the tables in your database based on the Prisma schema.

## Step 6: Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Troubleshooting

### Database Connection Issues
- Make sure PostgreSQL is running
- Verify your connection string is correct
- Check firewall settings if using a remote database

### Prisma Issues
- Run `npm run db:generate` again if you see Prisma client errors
- Make sure your `.env` file is in the root directory

### Port Already in Use
- Change the port: `npm run dev -- -p 3001`
- Or kill the process using port 3000

