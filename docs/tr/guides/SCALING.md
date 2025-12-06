# Node.js Microservice Ölçekleme Best Practice'leri

Bu doküman, Node.js/Fastify microservice'lerinin production ortamında ölçeklenmesi için genel rehberlik sağlar.

## Node.js Performansını Anlamak

### Event Loop Mimarisi

```
                 ┌─────────────────────────────────────┐
                 │           Event Loop                │
                 │        (Tek Thread)                 │
                 │    JavaScript burada çalışır       │
                 └─────────────┬───────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
    ┌────▼────┐          ┌─────▼─────┐         ┌────▼────┐
    │  I/O    │          │  Timers   │         │ Network │
    │ (libuv) │          │           │         │   I/O   │
    └─────────┘          └───────────┘         └─────────┘
    Thread Pool           Event Queue          Non-blocking
    (4-128 thread)
```

### Temel Özellikler

| Özellik | Davranış | Etki |
|---------|----------|------|
| JavaScript | Tek thread | CPU-bound işlemler event loop'u bloklar |
| Network I/O | Non-blocking | Binlerce bağlantıyı yönetebilir |
| File I/O | Thread pool | `UV_THREADPOOL_SIZE` ile sınırlı |
| DNS sorguları | Thread pool | Darboğaz olabilir |

### Performans Beklentileri

| İş Yükü Türü | Tek Instance RPS | Notlar |
|--------------|------------------|--------|
| Basit JSON API | 10,000-30,000 | Veritabanı yok |
| Veritabanı sorgularıyla | 1,000-5,000 | Sorgu karmaşıklığına bağlı |
| Harici API çağrılarıyla | 500-2,000 | Network gecikmesi baskın |
| CPU-yoğun (bcrypt, crypto) | 100-500 | Worker thread'ler düşünülmeli |

## Ölçekleme Stratejileri

### 1. Dikey Ölçekleme (Scale Up)

Tek bir instance için kaynakları artırma.

```yaml
# Kubernetes kaynak limitleri
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Ne zaman kullanılmalı:**
- Geçici trafik artışları için hızlı çözüm
- Development/staging ortamları
- Küçük iş yükleri için maliyet etkin

**Sınırlamalar:**
- Tek hata noktası
- Donanım limitleri
- Hata toleransını iyileştirmez

### 2. Yatay Ölçekleme (Scale Out)

Load balancer arkasında birden fazla instance çalıştırma.

```
                    Load Balancer
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐
    │  Pod 1  │    │   Pod 2   │   │   Pod 3   │
    │ (Node)  │    │  (Node)   │   │  (Node)   │
    └─────────┘    └───────────┘   └───────────┘
```

**Ne zaman kullanılmalı:**
- Production ortamları
- Yüksek erişilebilirlik gereksinimleri
- Hata toleransı gerekli

**Dikkat edilmesi gerekenler:**
- Stateless uygulama tasarımı gerekli
- Session yönetimi (Redis kullanın)
- Veritabanı bağlantı havuzu

### 3. Node.js Cluster Modu

Tek bir makinede tüm CPU çekirdeklerini kullanma.

```javascript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} öldü, yeniden başlatılıyor...`);
    cluster.fork();
  });
} else {
  // Fastify sunucunuzu başlatın
  startServer();
}
```

**Ne zaman kullanılmalı:**
- Tek sunucu deployment'ları
- Maksimum CPU kullanımı gerekli
- PM2 bunu otomatik olarak yönetir

## Kubernetes Yapılandırması

### Deployment Şablonu

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-microservice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-microservice
  template:
    metadata:
      labels:
        app: my-microservice
    spec:
      containers:
      - name: my-microservice
        image: my-microservice:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
        - name: NODE_ENV
          value: "production"
        - name: UV_THREADPOOL_SIZE
          value: "16"
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-microservice-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-microservice
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 2
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

## Yaygın Darboğazlar

### 1. CPU-Bound İşlemler

**Problem:** bcrypt, görüntü işleme gibi işlemler event loop'u bloklar.

**Çözümler:**
```javascript
// Seçenek 1: Worker Thread'ler
import { Worker } from 'worker_threads';

function runInWorker(task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: task });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// Seçenek 2: Ayrı servise yönlendirme
// CPU-yoğun işlemler için ayrı bir microservice kullanın
```

### 2. Veritabanı Bağlantıları

**Problem:** Çok fazla bağlantı veritabanını bunaltır.

**Çözüm:** Bağlantı havuzu
```javascript
// knex.js örneği
const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 2,
    max: 10,           // DB limitlerına göre ayarlayın
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
});
```

### 3. Memory Leak'ler

**Tespit:**
```javascript
// Health check'inize ekleyin
app.get('/health/memory', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(used.external / 1024 / 1024)} MB`,
  });
});
```

### 4. DNS Çözümleme

**Problem:** DNS sorguları thread pool kullanır ve yavaş olabilir.

**Çözüm:**
```javascript
// Başlangıçta DNS'i önceden çözümleyin
import dns from 'dns';

async function preResolveDNS() {
  const hosts = ['mysql.example.com', 'redis.example.com'];
  for (const host of hosts) {
    try {
      const addresses = await dns.promises.resolve4(host);
      console.log(`${host} -> ${addresses[0]}`);
    } catch (err) {
      console.error(`${host} çözümlenemedi`);
    }
  }
}
```

## Yük Testi

### Araçlar

| Araç | En İyi Kullanım | Komut |
|------|-----------------|-------|
| Apache Bench (ab) | Hızlı testler | `ab -n 1000 -c 50 URL` |
| hey | Yüksek eşzamanlılık | `hey -n 10000 -c 100 URL` |
| k6 | Karmaşık senaryolar | `k6 run script.js` |
| Artillery | API testi | `artillery run config.yml` |

### Temel Test Script'i

```bash
#!/bin/bash

URL="http://localhost:3000/api/endpoint"
PAYLOAD='{"key":"value"}'

echo "=== Isınma ==="
ab -n 100 -c 10 -p /tmp/payload.json -T "application/json" $URL

echo "=== Hafif Yük ==="
ab -n 1000 -c 10 -p /tmp/payload.json -T "application/json" $URL

echo "=== Orta Yük ==="
ab -n 5000 -c 50 -p /tmp/payload.json -T "application/json" $URL

echo "=== Ağır Yük ==="
ab -n 10000 -c 100 -p /tmp/payload.json -T "application/json" $URL
```

### Sonuçları Yorumlama

```
Requests per second:    1000.00 [#/sec] (mean)  <- Throughput
Time per request:       50.000 [ms] (mean)      <- Gecikme
Failed requests:        0                        <- Hata oranı

Percentage of the requests served within a certain time (ms)
  50%     45   <- p50 (medyan)
  75%     52
  90%     65   <- p90
  95%     80   <- p95
  99%    120   <- p99 (önemli!)
 100%    250   <- max (outlier'lar)
```

## Ortam Değişkenleri

```bash
# Node.js performans ayarları
NODE_ENV=production
UV_THREADPOOL_SIZE=16          # Varsayılan 4
NODE_OPTIONS="--max-old-space-size=512"  # Heap boyutu MB cinsinden

# Fastify
FASTIFY_CLOSE_GRACE_DELAY=500  # Graceful shutdown gecikmesi

# Bağlantı limitleri
DB_POOL_MIN=2
DB_POOL_MAX=10
REDIS_MAX_CONNECTIONS=50
```

## İzleme Kontrol Listesi

### İzlenecek Metrikler

- [ ] İstek oranı (RPS)
- [ ] Yanıt gecikmesi (p50, p95, p99)
- [ ] Hata oranı (4xx, 5xx)
- [ ] CPU kullanımı
- [ ] Memory kullanımı (heap, RSS)
- [ ] Event loop gecikmesi
- [ ] Aktif bağlantılar
- [ ] Veritabanı sorgu süresi
- [ ] Harici API çağrı süresi

### Uyarı Eşikleri

| Metrik | Uyarı | Kritik |
|--------|-------|--------|
| p99 gecikme | > 500ms | > 1s |
| Hata oranı | > %1 | > %5 |
| CPU | > %70 | > %90 |
| Memory | > %70 | > %90 |
| Event loop gecikmesi | > 100ms | > 500ms |

## Best Practice'ler Özeti

1. **Yatay ölçekleme için tasarlayın** - Stateless, share-nothing mimari
2. **Bağlantı havuzu kullanın** - Veritabanı, Redis, HTTP client'lar
3. **Health check'ler uygulayın** - Liveness ve readiness probe'ları
4. **Agresif cache'leyin** - Session'lar ve API yanıtları için Redis
5. **CPU işlerini dışarı alın** - Worker thread'ler veya ayrı servisler
6. **Her şeyi izleyin** - Metrikler, loglar, trace'ler
7. **Yük altında test edin** - Production'dan önce limitlerınızı bilin
8. **Graceful shutdown** - SIGTERM'i düzgün yönetin
9. **Kaynak limitleri belirleyin** - Kaçak memory/CPU'yu önleyin
10. **async/await kullanın** - Event loop'u asla bloklamamalısınız

## Daha Fazla Okuma

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Fastify Dokümantasyonu](https://www.fastify.io/docs/latest/)
- [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [libuv Tasarım Genel Bakışı](http://docs.libuv.org/en/v1.x/design.html)
