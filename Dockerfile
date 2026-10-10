# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build: compile the library (dist/web-commandpalette.js)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Pin to the latest npm before installing anything. The npm bundled in the base
# image can lag by weeks; newer npm ships fixes and stricter registry handling
# that reduce exposure to supply-chain attacks. Kept as its own cached layer so
# it only re-runs when the base image changes.
RUN npm install -g npm@latest

# Install exactly what the lockfile pins (every dependency resolves from the npm
# registry — no local sibling paths). Copy only the manifests first so this layer
# is cached until the dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Bring in the source and build. `npm run build` = clean:dist → check:vars:strict →
# cem analyze → vite build, producing dist/. The palette CSS is compiled from
# @keenmate/pure-admin-core's SCSS (installed above) and inlined into the bundle.
# Host node_modules/ and dist/ are excluded via .dockerignore for a clean build.
COPY . .
RUN npm run build

# Stamp the landing page's version badge with the real package version and the
# build time. On the static site the badge's `import { version } from
# './package.json'` never resolves (that's a Vite-only transform), so it renders
# blank; here we bake the value in. BUILD_TIME can be passed for a reproducible
# stamp (e.g. --build-arg BUILD_TIME=$(date -u +%FT%RZ) from CI); it defaults to
# the moment this layer builds.
ARG BUILD_TIME
RUN VERSION="$(node -p "require('./package.json').version")"; \
    BT="${BUILD_TIME:-$(date -u +'%Y-%m-%dT%H:%MZ')}"; \
    STAMP="v${VERSION} (built ${BT})"; \
    sed -i "s|id=\"version-badge\"></span>|id=\"version-badge\" title=\"Built ${BT}\">${STAMP}</span>|" index.html; \
    sed -i "s|import { version } from './package.json'|const version = '${VERSION} (built ${BT})'|" index.html

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — serve: static example site (examples-*.html + compiled library)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve

# Replace the stock server block with one that serves the static examples and
# silently drops vulnerability-scanner traffic (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The served root needs the HTML pages, the shared stylesheet, the shared example
# scripts (chapter-nav, copy-link, controls-store) + the demo data module
# (examples-data.js), the docs, and the compiled dist/. The scripts are a glob so a
# newly-added examples-*.js is served automatically — a missing one 404s at import
# and aborts the page's inline module.
COPY --from=build /app/*.html              /usr/share/nginx/html/
COPY --from=build /app/examples-shared.css /usr/share/nginx/html/
COPY --from=build /app/examples-*.js       /usr/share/nginx/html/
COPY --from=build /app/docs                /usr/share/nginx/html/docs/
COPY --from=build /app/dist                /usr/share/nginx/html/dist/

# The example pages load the library dev entry via `<script src="/src/index.ts">`,
# which only works under `vite dev` (it transpiles TS on the fly). A static nginx
# server has no src/ tree and can't transform TS, so those requests 404. Rewrite
# the dev entry to the compiled ES bundle in the served copies; the repo HTML is
# left untouched so `vite dev` keeps working locally.
RUN sed -i 's#/src/index\.ts#/dist/web-commandpalette.js#g' /usr/share/nginx/html/*.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
