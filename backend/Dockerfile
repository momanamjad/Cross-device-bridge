FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY prisma ./prisma
COPY dist ./dist
RUN npx prisma generate
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/server.js"]
