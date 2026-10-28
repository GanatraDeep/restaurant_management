# No dependencies: talks to the Docker Engine API over the mounted socket.
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
EXPOSE 8080
CMD ["node", "server.js"]
