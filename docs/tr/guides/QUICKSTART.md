# Hızlı Başlangıç Rehberi

## Kurulum Seçenekleri

### Seçenek 1: GitHub Template (Önerilen)

GitHub'da **"Use this template"** butonuna tıklayın veya:

```bash
gh repo create my-new-service --template berkeerdo/microservice-boilerplate --clone
cd my-new-service
npm install
```

### Seçenek 2: Degit (Git Geçmişi Olmadan)

```bash
npx degit berkeerdo/microservice-boilerplate my-new-service
cd my-new-service
npm install
```

### Seçenek 3: Git Clone

```bash
git clone https://github.com/berkeerdo/microservice-boilerplate.git my-new-service
cd my-new-service
rm -rf .git && git init
npm install
```

## Yapılandırma

```bash
cp .env.example .env
# .env dosyasını kendi değerlerinizle düzenleyin
```

## Geliştirmeye Başlama

```bash
# Redis & RabbitMQ başlat (opsiyonel)
docker-compose -f docker-compose.dev.yml up -d

# Dev sunucuyu başlat
npm run dev
```

## Erişim Noktaları

- **API**: http://localhost:3000
- **Swagger**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health
- **Readiness**: http://localhost:3000/ready
- **Status**: http://localhost:3000/status
