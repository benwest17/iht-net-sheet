# Vercel deployment settings

Use these settings in Vercel:

- Framework Preset: Vite
- Root Directory: repository root
- Install Command: `npm install --include=dev`
- Build Command: `npm run build`
- Output Directory: `dist`

If Vercel shows `Command "vite build"`, a dashboard Build Command override is active. Remove that override or replace it with `npm run build`, then redeploy without the previous build cache.
