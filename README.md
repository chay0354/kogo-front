# קוגומלו - Frontend

Next.js frontend for the Kogomalo class management system.

## Features

- ✅ RTL (Right-to-Left) support for Hebrew
- ✅ Heebo font family (weights 300-800)
- ✅ Modern, clean UI with Tailwind CSS
- ✅ Responsive sidebar navigation
- ✅ Animated transitions
- ✅ TypeScript support

## Setup

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Environment Variables

Create a `.env.local` file in the frontend directory:

```env
# Backend API URL (for frontend → backend communication)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# Webhook Base URL (for Tranzila callbacks - MUST be publicly accessible)
# For local development with Cloudflare Tunnel:
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://your-tunnel-url.trycloudflare.com/api/v1

# For production:
# NEXT_PUBLIC_WEBHOOK_BASE_URL=https://yourdomain.com/api/v1
```

**Important:** The `NEXT_PUBLIC_WEBHOOK_BASE_URL` tells Tranzila where to send payment confirmation webhooks. It MUST be a publicly accessible URL, not localhost.

#### **Development with Cloudflare Tunnel:**

1. **Start Cloudflare tunnel** in a separate terminal:
   ```bash
   cloudflared tunnel --url localhost:8000
   ```
   
2. **Copy the generated URL** (e.g., `https://random-words.trycloudflare.com`)

3. **Update `.env.local`** with the tunnel URL:
   ```env
   NEXT_PUBLIC_WEBHOOK_BASE_URL=https://random-words.trycloudflare.com/api/v1
   ```

4. **Restart the frontend** for changes to take effect

**Note:** Cloudflare tunnel URLs change each time you restart the tunnel. You'll need to update `.env.local` accordingly.

### 3. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

- `/` - Dashboard/Home
- `/customers` - Customers management
- `/courses` - Courses catalog
- `/schedule` - Weekly schedule view
- `/branches` - Branches management
- `/instructors` - Instructors management

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── customers/
│   │   ├── courses/
│   │   ├── schedule/
│   │   ├── branches/
│   │   ├── instructors/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/       # Reusable components
│   │   ├── Sidebar.tsx
│   │   ├── AppLayout.tsx
│   │   └── PageHeader.tsx
│   └── lib/              # Utilities
│       └── api.ts        # Axios API client
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Design System

### Colors

The design follows the specified color palette with HSL values:

- **Primary**: `hsl(173 58% 39%)` - Teal/turquoise for main actions
- **Accent**: `hsl(15 90% 65%)` - Coral/orange for highlights
- **Background**: `hsl(210 20% 98%)` - Light gray background
- **Sidebar**: `hsl(222 47% 11%)` - Dark navy for navigation

### Typography

- **Font**: Heebo (Google Fonts)
- **Weights**: 300, 400, 500, 600, 700, 800
- **Direction**: RTL (Right-to-Left)

### Components

Pre-built utility classes:

- `.card` - Card layout
- `.btn-primary` - Primary button
- `.btn-secondary` - Secondary button
- `.badge-*` - Status badges
- `.input` - Form inputs
- `.table` - Data tables

## Development

### Building for Production

```bash
npm run build
npm run start
```

### Deployment

This project is optimized for deployment on Vercel or any Next.js hosting platform.

#### **Production Environment Variables**

Set these in your hosting platform (Vercel, Netlify, etc.):

```env
# Production backend URL
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1

# Webhook URL (same as API URL for production)
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://api.yourdomain.com/api/v1
```

#### **Vercel Deployment:**

```bash
vercel deploy --prod
```

Then set environment variables in Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WEBHOOK_BASE_URL`
3. Redeploy

#### **Other Platforms:**

For Railway, Render, Netlify, etc.:
1. Set environment variables in platform dashboard
2. Ensure both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WEBHOOK_BASE_URL` point to your production backend
3. Deploy

### Tranzila Webhook Flow

**How payments work:**

1. User initiates payment in frontend
2. Frontend calls backend: `POST /api/v1/customers/payments/initiate_subscription/`
3. Backend creates Payment record and generates Tranzila iframe URL with `callback_url`
4. User completes payment in Tranzila iframe
5. Tranzila sends webhook to `callback_url` (configured via `NEXT_PUBLIC_WEBHOOK_BASE_URL`)
6. Backend processes webhook and updates payment status
7. User is redirected back to frontend

**Important:** The webhook URL must be publicly accessible. Tranzila cannot send webhooks to `localhost`.

Note:
Once Claude writes the migration file, you run python manage.py migrate again and it will apply it.