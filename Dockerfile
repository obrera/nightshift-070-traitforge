FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm install
COPY . .
RUN npm install
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm install --omit=dev
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
