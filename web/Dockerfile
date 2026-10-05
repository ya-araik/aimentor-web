FROM node:24-alpine AS build

WORKDIR /repo/web
COPY web/package*.json ./
RUN npm ci

COPY project-plan/contracts/aimmentor.openapi.json /repo/project-plan/contracts/aimmentor.openapi.json
COPY web/ ./
RUN npm run generate:api && npm run build

FROM nginx:stable-alpine

COPY --chmod=755 web/docker-entrypoint.d/19-configure-upstream.envsh /docker-entrypoint.d/19-configure-upstream.envsh
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/web/dist/ /usr/share/nginx/html/
EXPOSE 80
