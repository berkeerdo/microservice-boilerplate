# Deployment Rehberi

Bu rehber, microservice'in Docker, Docker Compose ve Kubernetes ile deploy edilmesini kapsar.

## Docker

### Multi-Stage Dockerfile

Boilerplate, optimize edilmiş production image'ları için multi-stage Dockerfile kullanır:

```dockerfile
# Build aşaması - dev dependency'leri içerir
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production aşaması - minimal image
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Güvenlik: Non-root kullanıcı olarak çalış
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000 50051

# Container orchestration için health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Image Build Etme

```bash
# Production image build et
docker build -t myservice:latest .

# Belirli tag ile build et
docker build -t myservice:1.0.0 .

# Farklı platformlar için build et (multi-arch)
docker buildx build --platform linux/amd64,linux/arm64 -t myservice:latest .
```

### Container Çalıştırma

```bash
# Environment variable'larla çalıştır
docker run -d \
  --name myservice \
  -p 3000:3000 \
  -p 50051:50051 \
  -e NODE_ENV=production \
  -e DB_HOST=db.example.com \
  -e DB_USERNAME=user \
  -e DB_PASSWORD=secret \
  myservice:latest

# Env dosyası ile çalıştır
docker run -d \
  --name myservice \
  --env-file .env.production \
  -p 3000:3000 \
  myservice:latest
```

## Docker Compose

### Development Ortamı

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_dev_data:/var/lib/rabbitmq

volumes:
  redis_dev_data:
  rabbitmq_dev_data:
```

```bash
# Development bağımlılıklarını başlat
docker-compose -f docker-compose.dev.yml up -d

# Durdur ve kaldır
docker-compose -f docker-compose.dev.yml down
```

### Production Ortamı

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "${PORT:-3000}:3000"
      - "${GRPC_PORT:-50051}:50051"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - GRPC_PORT=50051
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT:-3306}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - REDIS_SERVER=${REDIS_SERVER}
      - REDIS_PORT=${REDIS_PORT:-6379}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
```

## Kubernetes

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: microservice
  labels:
    name: microservice
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: microservice-config
  namespace: microservice
data:
  NODE_ENV: "production"
  PORT: "3000"
  GRPC_PORT: "50051"
  LOG_LEVEL: "info"
  OTEL_ENABLED: "true"
  OTEL_SERVICE_NAME: "microservice"
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: microservice-secrets
  namespace: microservice
type: Opaque
stringData:
  DB_HOST: "mysql.database.svc.cluster.local"
  DB_USERNAME: "app_user"
  DB_PASSWORD: "supersecret"
  DB_NAME: "app_db"
  REDIS_SERVER: "redis.cache.svc.cluster.local"
  SENTRY_DSN: "https://xxx@sentry.io/123"
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: microservice
  namespace: microservice
  labels:
    app: microservice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: microservice
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: microservice
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: microservice
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: microservice
          image: myservice:1.0.0
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
            - name: grpc
              containerPort: 50051
              protocol: TCP
          envFrom:
            - configMapRef:
                name: microservice-config
            - secretRef:
                name: microservice-secrets
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
      terminationGracePeriodSeconds: 30
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: microservice
                topologyKey: kubernetes.io/hostname
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: microservice
  namespace: microservice
  labels:
    app: microservice
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
    - name: grpc
      port: 50051
      targetPort: grpc
      protocol: TCP
  selector:
    app: microservice
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: microservice
  namespace: microservice
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  tls:
    - hosts:
        - api.example.com
      secretName: microservice-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: microservice
                port:
                  number: 80
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: microservice
  namespace: microservice
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: microservice
  minReplicas: 3
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
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

### Pod Disruption Budget

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: microservice
  namespace: microservice
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: microservice
```

### ServiceAccount & RBAC

```yaml
# k8s/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: microservice
  namespace: microservice
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: microservice
  namespace: microservice
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: microservice
  namespace: microservice
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: microservice
subjects:
  - kind: ServiceAccount
    name: microservice
    namespace: microservice
```

## Deployment Komutları

```bash
# Tüm Kubernetes manifest'lerini uygula
kubectl apply -f k8s/

# Deployment durumunu kontrol et
kubectl -n microservice get pods
kubectl -n microservice get deployments
kubectl -n microservice get services

# Log'ları görüntüle
kubectl -n microservice logs -f deployment/microservice

# Manuel ölçeklendirme
kubectl -n microservice scale deployment microservice --replicas=5

# Rolling restart
kubectl -n microservice rollout restart deployment/microservice

# Rollout durumunu kontrol et
kubectl -n microservice rollout status deployment/microservice

# Önceki versiyona geri dön
kubectl -n microservice rollout undo deployment/microservice
```

## Health Endpoint'leri

| Endpoint | Amaç | Kullanım |
|----------|------|----------|
| `/health` | Liveness check | K8s liveness probe |
| `/ready` | Readiness check | K8s readiness probe |
| `/metrics` | Prometheus metrikleri | Monitoring |

## En İyi Pratikler

### 1. Image Tag'leme
- Semantic versioning kullanın (v1.0.0)
- Production'da asla `latest` kullanmayın
- İzlenebilirlik için git commit SHA ekleyin

### 2. Resource Limitleri
- Her zaman CPU/memory request ve limit ayarlayın
- Konservatif başlayın ve metriklere göre ayarlayın
- Optimizasyon için VPA (Vertical Pod Autoscaler) kullanın

### 3. Güvenlik
- Non-root kullanıcı olarak çalıştırın
- Mümkünse read-only root filesystem kullanın
- Image'ları güvenlik açıkları için tarayın (Trivy, Snyk)
- Trafiği kısıtlamak için network policy kullanın

### 4. Yüksek Erişilebilirlik
- Production için minimum 3 replika
- Node'lara yaymak için pod anti-affinity kullanın
- PodDisruptionBudget yapılandırın
- Birden fazla availability zone kullanın

### 5. Graceful Shutdown
- SIGTERM sinyallerini düzgün işleyin
- Sleep ile preStop hook implement edin
- Uygun terminationGracePeriodSeconds ayarlayın

## Kaynaklar

- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Kubernetes Deployment Stratejileri](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
- [Production Best Practices](https://learnk8s.io/production-best-practices)
- [12 Factor App](https://12factor.net/)
