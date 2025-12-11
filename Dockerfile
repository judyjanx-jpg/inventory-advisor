# Railway Web App Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy ALL source files
COPY . .

# Build args for Next.js build (Railway passes these from env vars)
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Build the Next.js app
RUN npm run build

# Start the Next.js production server
CMD ["npm", "start"]
