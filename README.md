# Baseline — Personal Health Intelligence

A Next.js 14 health tracking dashboard that helps you understand your personal health baselines, generate AI-powered insights, and prepare for medical appointments.

## Features

- **Health Dashboard** — View key metrics (sleep, HRV, resting HR, recovery) with sparklines and baseline comparisons
- **Baseline Explorer** — Interactive charts showing 30/90/365-day trends with anomaly detection
- **AI Health Signals** — Claude-powered analysis of metric deviations and health patterns
- **Context Brief** — AI-generated clinical summaries for upcoming medical appointments (PDF export)
- **Ask Baseline** — Streaming chat interface with Claude for health questions based on your data
- **Device Integrations** — Mock adapters for Oura, Apple Health, Whoop, and Garmin

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS (dark theme)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Auth**: Supabase Auth (email + Google OAuth)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Charts**: Recharts
- **PDF**: @react-pdf/renderer

## Getting Started

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in your credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up the database

Run the migration in your Supabase project's SQL editor:

```bash
# Copy and run contents of:
supabase/migrations/001_initial_schema.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```

### 4. Install dependencies

```bash
npm install
```

### 5. Seed demo data (optional)

```bash
npm run seed
```

This creates a demo user (`demo@baseline.app` / `Demo1234!`) with 90 days of realistic mock health data from all four device adapters.

### 6. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── app/
│   ├── (auth)/          # Login, signup, onboarding
│   ├── (app)/           # Protected app routes
│   │   ├── dashboard/   # Main health dashboard
│   │   ├── baseline/    # Metric explorer with charts
│   │   ├── brief/       # Context brief generator
│   │   ├── ask/         # AI chat interface
│   │   └── settings/    # Profile & device settings
│   └── api/             # API routes (sync, signals, brief, ask, export)
├── components/
│   ├── cards/           # MetricCard, SignalCard, AppointmentBanner
│   ├── charts/          # SparkLine, MetricChart, BaselineBand
│   ├── chat/            # MessageList, MessageInput, StreamingMessage
│   ├── brief/           # BriefDocument, BriefPDF
│   └── ui/              # SidebarNav, RefreshButton, etc.
├── lib/
│   ├── adapters/        # Device adapters (Oura, Apple, Whoop, Garmin)
│   ├── baseline/        # Baseline computation & deviation analysis
│   ├── claude/          # AI functions (signals, brief, ask)
│   └── supabase/        # DB client, types, middleware
└── scripts/
    └── seed.ts          # Database seeding script
```

## Device Adapters

All device adapters are **mock implementations** that generate consistent, realistic data using seeded random numbers. They produce the same data for the same date, allowing reproducible demos.

To integrate real device APIs, implement the `DeviceAdapter` interface in `lib/adapters/base.ts`:

```typescript
interface DeviceAdapter {
  name: string
  fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]>
}
```

## Database Schema

Key tables:
- `users` — User profiles (extends Supabase auth)
- `health_metrics` — Time-series metric data from devices
- `baselines` — Computed mean ± 1 SD for each metric type
- `signals` — AI-generated health observations
- `context_briefs` — Generated appointment summaries
- `appointments` — Upcoming medical appointments
- `chat_messages` — Ask Baseline conversation history

All tables have Row Level Security policies ensuring users can only access their own data.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sync` | POST | Run device adapters, store metrics, recompute baselines |
| `/api/signals` | GET/POST | Fetch or generate AI health signals |
| `/api/brief` | POST | Generate context brief via Claude |
| `/api/ask` | POST | Streaming chat with Claude |
| `/api/export` | GET | Export all user data (JSON or CSV) |
| `/api/auth/callback` | GET | Supabase OAuth callback |
