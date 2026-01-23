# Quick Start Guide

## Installation Options

### Option 1: GitHub Template (Recommended)

Click **"Use this template"** on GitHub, or:

```bash
gh repo create my-new-service --template berkeerdo/microservice-boilerplate --clone
cd my-new-service
npm install
```

### Option 2: Degit (No Git History)

```bash
npx degit berkeerdo/microservice-boilerplate my-new-service
cd my-new-service
npm install
```

### Option 3: Git Clone

```bash
git clone https://github.com/berkeerdo/microservice-boilerplate.git my-new-service
cd my-new-service
rm -rf .git && git init
npm install
```

## Configure

```bash
cp .env.example .env
# Edit .env with your values
```

## Start Development

```bash
# Start Redis & RabbitMQ (optional)
docker-compose -f docker-compose.dev.yml up -d

# Start dev server
npm run dev
```

## Access Points

- **API**: http://localhost:3000
- **Swagger**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health
- **Readiness**: http://localhost:3000/ready
- **Status**: http://localhost:3000/status
