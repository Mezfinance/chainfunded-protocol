FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy worker source
COPY . ./

CMD ["node", "index.js"]
