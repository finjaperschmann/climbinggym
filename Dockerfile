FROM node:24-alpine

WORKDIR /app

COPY docker/entrypoint.sh /usr/local/bin/boulderhalle-entrypoint
RUN chmod +x /usr/local/bin/boulderhalle-entrypoint

ENV PORT=8080 \
    DATA_DIR=/data \
    NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

EXPOSE 8080

LABEL org.opencontainers.image.title="Boulderhalle" \
      org.opencontainers.image.description="Laufzeit für die Boulderhalle. Der Quellcode wird per Volume eingehängt." \
      org.opencontainers.image.source="https://github.com/finjaperschmann/climbinggym"

ENTRYPOINT ["/usr/local/bin/boulderhalle-entrypoint"]
