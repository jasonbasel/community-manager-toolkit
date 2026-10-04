# Community Manager Toolkit by CommonOS: hosted MCP connector (stateless; nothing stored).
# Built by Cloud Build from `gcloud run deploy --source .` (no local Docker needed). Context = this folder.
# site/ (copy of ../docs) and brand-fonts/ (licensed fonts, gitignored) arrive via .gcloudignore; see DEPLOY.md.
FROM node:22-slim AS build
WORKDIR /app
ENV BRAND_FONTS_DIR=/app/brand-fonts
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Fails loudly if site/ is missing (run `npm run build` locally before deploying). Fonts are optional.
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/site ./site
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
