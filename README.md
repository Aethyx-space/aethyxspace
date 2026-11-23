# Aethyx

Aethyx’s public website and client portal. The React and TypeScript source is in `src/`. Supabase functions and migrations are in `supabase/`.

## Local development

Install Node.js and npm, then run:

```sh
npm ci
npm run dev
```

Use `.env.example` for the frontend environment variables. Run `npm test` for tests and `npm run build` for the production build and public-page prerendering.

## Deployment

### Cloudflare Pages (recommended)

This repo is configured for **Cloudflare Pages** deployment.

#### 1. Connect via the Cloudflare Dashboard

1. Go to [Cloudflare Pages](https://pages.cloudflare.com/) and click **Create a project → Connect to Git**.
2. Select this repository.
3. Set the following build settings:
   | Setting | Value |
   |---|---|
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
4. Under **Environment variables**, add the variables from `.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
5. Click **Save and Deploy**.

SPA routing (e.g. `/admin/*`, `/portal/*`, `/blog/:slug`) is handled automatically via `public/_redirects`.

#### 2. (Optional) Deploy via Wrangler CLI

```sh
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist
```

The `wrangler.toml` in this repo pre-configures the project name and output directory.

#### 3. Custom domain

In your Cloudflare Pages project go to **Custom domains → Set up a custom domain** and follow the prompts. If your domain's DNS is already on Cloudflare the record will be created automatically.
