FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

RUN chown -R pptruser:pptruser /app

COPY package.json package-lock.json* ./

USER root

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \         
    libegl1-mesa \            
    libgles2-mesa \           
    libnss3 \                 
    && rm -rf /var/lib/apt/lists/*

# RUN apt-get update && apt-get install -y \
#     libx11-xcb-dev \
#     libxrandr2 \
#     libxss1 \
#     libasound2 \
#     libatk1.0-0 \
#     libnss3 \
#     libgdk-pixbuf2.0-0 \
#     libpangocairo-1.0-0 \
#     libpango-1.0-0 \
#     libgdk-pixbuf2.0-0 \
#     libatspi2.0-0 \
#     libgtk-3-0 \
#     libgl1-mesa-glx \
#     libegl1-mesa \
#     && rm -rf /var/lib/apt/lists/*

# RUN apt-get update && apt-get install -y \
#     libgl1-mesa-swrast \
#     libglu1-mesa


# RUN apt-get update && apt-get install -y \
#     xvfb \
#     libegl1-mesa \
#     libgles2-mesa \
#     libgbm-dev \
#     libx11-xcb-dev \
#     libnss3 \
#     libatk1.0-0 \
#     libxrandr2 \
#     libdrm2 \
#     && rm -rf /var/lib/apt/lists/*

RUN npm install --unsafe-perm=true --allow-root
RUN npx puppeteer browsers install chrome

USER pptruser

COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
# CMD xvfb-run --server-args="-screen 0 1920x1080" npm start
