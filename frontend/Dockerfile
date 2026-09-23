# Build from the repo root (docker build -f frontend/Dockerfile .) so the
# compose file's context matches the backend Dockerfile's.
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ .
# Empty (not unset) on purpose — see src/lib/api.js: this makes the build use
# same-origin requests, which the nginx config below then proxies through to
# the backend container. That's what makes /ws/frame come out as wss:// once
# this is served over HTTPS, instead of hardcoding a backend hostname.
ENV REACT_APP_BACKEND_URL=""
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
