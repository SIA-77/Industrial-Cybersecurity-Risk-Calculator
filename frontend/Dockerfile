FROM node:18

# ---- proxy for build ----
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
