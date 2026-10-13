# Deploy TAG without running anything on your laptop

GitHub and Cloudflare do the building for you in the cloud. You only click and drag.

## 1. Put the code on GitHub (browser only)

1. Unzip `tag-nextjs.zip`. GitHub does **not** unzip files for you.
2. On github.com click **New repository**, name it `tag-it-on`, create it.
3. On the empty repo page click **uploading an existing file**.
4. Open the unzipped folder and drag its **contents** into the page: `app`, `components`, `lib`, `package.json`, `tsconfig.json`, `next.config.mjs`, `.node-version`, and the rest. Do not drag the outer `tag-nextjs` folder itself, or the project ends up nested one level down.
5. Click **Commit changes**.

(If `.node-version` or `.gitignore` are hidden on your computer, skip them. On Mac, press Cmd+Shift+. to show hidden files.)

## 2. Build and host on Cloudflare

1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**. Pick the `tag-it-on` repo.
2. Build settings:
   - Framework preset: **Next.js (Static HTML Export)**
   - Build command: `npx next build`
   - Build output directory: `out`
3. **Save and Deploy.** The build runs in the cloud (a few minutes). You get a `something.pages.dev` link.

Every time you upload a change to GitHub, Cloudflare rebuilds and redeploys by itself.

## 3. Use your own subdomain

In the Pages project open **Custom domains** > **Set up a custom domain** and type the subdomain you want, for example `tag.yourdomain.com`. Your domain is already on Cloudflare, so it creates the DNS record for you.

Put that final link in the proposal PDF.

## Why Cloudflare instead of Vercel

Vercel's free plan is for personal, non-commercial use only, and a site pitched to a company is arguably commercial. Cloudflare's free plan does not have that restriction, as far as I can find, and your domain is already there.

## If the build fails

Open the failed deployment, copy the build log, and send it to me. This project could not be test-built when it was written, so one small fix on the first run is possible.

## Editing later

Change a file on GitHub (open it, click the pencil icon, edit, commit). Cloudflare redeploys. Most edits are in `lib/scents.ts` (fragrances) and `app/globals.css` (look and feel).

## Optional: run it on your laptop

Install Node.js 20+, then in the project folder: `npm install` then `npm run dev`, and open http://localhost:3000.
