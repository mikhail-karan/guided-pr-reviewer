FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Explicitly rebuild better-sqlite3 to ensure native bindings are compiled
RUN pnpm rebuild better-sqlite3
RUN pnpm run build

FROM base
COPY --from=build /usr/src/app /app
RUN chmod +x /app/docker/entrypoint.sh
WORKDIR /app
RUN mkdir -p data
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "build"]

