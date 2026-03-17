# HookLens Web

Next.js 16 frontend for HookLens. Real-time webhook dashboard with live streaming, event inspection, and analytics.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **Tailwind CSS 4** with custom design tokens (warm teal palette)
- **GSAP** for stagger-in, fade-in, and count-up animations
- **Socket.io Client** for live webhook streaming

## Running locally

```bash
npm install
npm run dev     # http://localhost:3001
```

Expects the API running on `http://localhost:3000` (configurable via `NEXT_PUBLIC_API_URL`).

## Pages

| Route | Page |
|-------|------|
| `/login` | Sign in |
| `/signup` | Create account (shows ingress URL on success) |
| `/dashboard` | Live Stream — real-time WebSocket feed |
| `/dashboard/events` | Events list with status filter pills |
| `/dashboard/events/:id` | Event detail — headers, body, forward response, replay |
| `/dashboard/endpoints` | Endpoint CRUD with provider config |
| `/dashboard/stats` | Analytics with animated stat cards and breakdowns |

## Project structure

```
src/
├── app/              Pages and layouts (App Router)
├── components/
│   ├── layout/       Sidebar (icon rail), Topbar
│   └── ui/           Button, Card, Badge, Input, Select, EmptyState
├── hooks/            useWebSocket, useStaggerIn, useFadeIn, useCountUp
└── lib/              API client, AuthContext, ThemeContext
```

## Scripts

```bash
npm run dev       # Dev server with Turbopack
npm run build     # Production build
npm run start     # Serve production build
npm run lint      # ESLint
```
