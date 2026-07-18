# Creation Platform — cloud image.
# Includes everything the platform uses: Node (server), Python +
# Flask (live preview of generated apps), FFmpeg (movie assembly).

FROM node:20-slim

# Python + FFmpeg for the preview runner and video studio
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
  && pip3 install --no-cache-dir --break-system-packages flask \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better build caching)
COPY package.json ./
RUN npm install --omit=dev && npm install --no-save tsx typescript

# App source
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# Render/Railway/Fly set PORT automatically; default for local docker
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
