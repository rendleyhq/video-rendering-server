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

RUN npm install --unsafe-perm=true --allow-root
RUN npx puppeteer browsers install chrome

USER pptruser

COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
