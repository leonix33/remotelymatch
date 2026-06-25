FROM node:20-alpine AS frontend-build
WORKDIR /app
ARG VITE_APP_URL=https://remotematch.app
ARG VITE_APP_NAME=RemoteMatch
ARG VITE_CUSTOM_DOMAIN=remotematch.app
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_CUSTOM_DOMAIN=$VITE_CUSTOM_DOMAIN
COPY frontend/package*.json ./frontend/
RUN npm install --prefix frontend
COPY frontend ./frontend
RUN npm run build --prefix frontend

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm install --omit=dev --prefix backend
COPY backend ./backend
COPY agent-data ./agent-data
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV AGENT_HOME=/app/agent-data
EXPOSE 10000
CMD ["npm", "start", "--prefix", "backend"]
