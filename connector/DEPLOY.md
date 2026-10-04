# Deploying the connector to Cloud Run (europe-west2)

Target: `https://toolkit.commonos.ai`, serving `/mcp` (MCP, Streamable HTTP), `/healthz` and the product
pages. Stateless, nothing stored, no secrets. Cloud Build builds the image from `Dockerfile`, so Docker
is not needed on your machine. Run every command from this `connector/` folder.

## 1. One-off setup (Jason's Google account)

```bash
gcloud auth login
gcloud projects create commonos-toolkit --name="CommonOS Toolkit"   # or use an existing project
gcloud config set project commonos-toolkit
gcloud billing projects link commonos-toolkit --billing-account=BILLING_ACCOUNT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
# Optional, least privilege: a runtime identity with no roles (the app calls no Google APIs).
gcloud iam service-accounts create toolkit-run --display-name="Community Manager Toolkit (no roles)"
```

## 2. Prepare the upload

```bash
npm ci
npm run fonts:stage   # copies the CommonOS fonts into ./brand-fonts (gitignored); skip it to use system fonts
npm run build         # copies ../docs into ./site, compiles, bundles the three views
npm test && npm run smoke
```

What the upload contains is decided by `.gcloudignore` (tracked), not `.gitignore`:
- `site/` is a build-time copy of `../docs`. The image serves it. If it is missing, the Cloud Build
  step stops with a clear message. Never edit `site/`; edit `../docs` and rebuild.
- `brand-fonts/` holds the Switzer and IBM Plex Mono files and their licences. They go only to our
  own Cloud Build, where `npm run build` embeds them in the views (`BRAND_FONTS_DIR=/app/brand-fonts` in
  the Dockerfile). They are never committed: the Switzer licence (ITF FFL) forbids making the font
  files available to others, and the repo is public. Without the folder, the views use system fonts.

## 3. Deploy

```bash
gcloud run deploy community-manager-toolkit \
  --source . \
  --region europe-west2 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 60 \
  --port 8080 \
  --service-account toolkit-run@commonos-toolkit.iam.gserviceaccount.com \
  --set-env-vars PUBLIC_MCP_URL=https://toolkit.commonos.ai/mcp,RATE_LIMIT_PER_MIN=60,TRUSTED_PROXY_HOPS=1
```

`--min-instances 0` scales to zero. Drop `--service-account` if you skipped the optional step. The
command prints the service URL (`https://community-manager-toolkit-…-nw.a.run.app`).

### Environment variables (none secret)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 8787 locally; Cloud Run sets 8080 | Listening port |
| `PUBLIC_MCP_URL` | `https://toolkit.commonos.ai/mcp` | Must equal the URL people add in Claude. Claude derives the views' sandbox domain from it; if they differ, the views won't render in Claude (the tools still work). While testing on the `run.app` URL, set it to that URL's `/mcp`. |
| `RATE_LIMIT_PER_MIN` | 60 | Requests per client IP per minute, in memory, per instance |
| `TRUSTED_PROXY_HOPS` | 1 | Proxies that append to `X-Forwarded-For`: 1 for Cloud Run directly, 2 behind Firebase Hosting |
| `CMT_LOG` | on | `off` silences the app's own logs |
| `SITE_DIR` | `./site` | Override the pages folder |
| `BRAND_FONTS_DIR` | build time only | Where the build reads fonts (Dockerfile sets `/app/brand-fonts`) |

Change a variable without rebuilding:
`gcloud run services update community-manager-toolkit --region europe-west2 --update-env-vars RATE_LIMIT_PER_MIN=300`

## 4. Verify

```bash
URL=https://community-manager-toolkit-XXXX-nw.a.run.app   # or https://toolkit.commonos.ai once the domain works
curl -s $URL/healthz
npm run smoke -- $URL     # pages, 7 tools, 3 ui:// views, one call per tool
```

MCP Inspector (UI):

```bash
npx @modelcontextprotocol/inspector
```

Open the address it prints. Set Transport type to **Streamable HTTP** and URL to `$URL/mcp`, then click
Connect. Under **Tools**, choose List Tools and expect 7, each marked read-only, then run each one. Under
**Resources**, List Resources should show three `ui://community-manager-toolkit/…` views; read one and
expect `text/html;profile=mcp-app`.

Inspector CLI, if you prefer (check the flags against the Inspector README for your version):
`npx @modelcontextprotocol/inspector --cli $URL/mcp --transport http --method tools/list`

Then add it to Claude: Settings → Connectors → Add custom connector → `https://toolkit.commonos.ai/mcp`
(no authentication).

## 5. Custom domain: toolkit.commonos.ai

Both options are free apart from normal usage. A paid external HTTPS load balancer is deliberately not
used. **Both need Jono to add DNS records** for `commonos.ai`.

### Option A: Cloud Run domain mapping (only if europe-west2 supports it)

Domain mapping is available only in some regions, and europe-west2 was not on Google's list when this
was written. Try it; if the region is unsupported the command errors and you use Option B.

```bash
gcloud domains verify commonos.ai     # once; the deploying account must be a verified owner in Search Console
gcloud beta run domain-mappings create --service community-manager-toolkit --domain toolkit.commonos.ai --region europe-west2
gcloud beta run domain-mappings describe --domain toolkit.commonos.ai --region europe-west2   # shows the DNS records
```

**Jono:** add the verification TXT record Search Console shows (if `commonos.ai` is not verified yet), and
`toolkit  CNAME  ghs.googlehosted.com.` (use exactly the records `describe` prints). The certificate
issues automatically, usually within an hour.

### Option B: Firebase Hosting rewrite (works with any region)

```bash
npx firebase-tools login
npx firebase-tools projects:addfirebase commonos-toolkit
mkdir -p firebase-hosting/public && cd firebase-hosting
cat > firebase.json <<'JSON'
{
  "hosting": {
    "public": "public",
    "rewrites": [{ "source": "**", "run": { "serviceId": "community-manager-toolkit", "region": "europe-west2" } }]
  }
}
JSON
npx firebase-tools deploy --only hosting --project commonos-toolkit
```

Keep `public/` empty (no `index.html`) so every path, including `/`, reaches Cloud Run. Then, in the
Firebase console, go to Hosting → Add custom domain → `toolkit.commonos.ai`.

**Jono:** add the records the console shows (a TXT record for ownership, then the A or CNAME records it
lists).

Afterwards, run `gcloud run services update community-manager-toolkit --region europe-west2 --update-env-vars TRUSTED_PROXY_HOPS=2`.

Notes for this option:
- Firebase Hosting allows 60 seconds per request, which is plenty: tools answer in milliseconds, and `/mcp`
  returns plain JSON rather than a stream.
- `/mcp` responses carry `Cache-Control: no-store`. Pages are cacheable for 5 minutes and images for a day.

After either option: `npm run smoke -- https://toolkit.commonos.ai`, and keep `PUBLIC_MCP_URL` as
`https://toolkit.commonos.ai/mcp`.

## 6. Operating notes

- **Logs.** The app logs only event type, route or tool name, latency, record counts and status: never
  inputs, outputs or IP addresses. Cloud Run's own request logs in Cloud Logging do record IP address,
  user agent and URL (default retention 30 days). The privacy policy must say so, or you can add a
  log exclusion for `run.googleapis.com/requests`.
- **Rate limit.** 60 requests per minute per IP, in memory, per instance (up to 2 instances). Claude
  and ChatGPT call connectors from their own servers, so many users can share an IP. If users see
  "Rate limit exceeded", raise `RATE_LIMIT_PER_MIN` with the update command above.
- **Rollback:** `gcloud run revisions list --service community-manager-toolkit --region europe-west2`, then
  `gcloud run services update-traffic community-manager-toolkit --region europe-west2 --to-revisions=REVISION=100`.
- **Updating the pages:** edit `../docs`, then `npm run build` and redeploy (the image carries its own copy).
