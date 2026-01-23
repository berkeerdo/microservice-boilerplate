# Node.js Microservice Scaling Best Practices

This document provides general guidance for scaling Node.js/Fastify microservices in production environments.

## Understanding Node.js Performance

### Event Loop Architecture

```
                 ┌─────────────────────────────────────┐
                 │           Event Loop                │
                 │        (Single Thread)              │
                 │    JavaScript execution here        │
                 └─────────────┬───────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
    ┌────▼────┐          ┌─────▼─────┐         ┌────▼────┐
    │  I/O    │          │  Timers   │         │ Network │
    │ (libuv) │          │           │         │   I/O   │
    └─────────┘          └───────────┘         └─────────┘
    Thread Pool           Event Queue          Non-blocking
    (4-128 threads)
```

### Key Characteristics

| Aspect | Behavior | Impact |
|--------|----------|--------|
| JavaScript | Single-threaded | CPU-bound tasks block event loop |
| Network I/O | Non-blocking | Handles thousands of connections |
| File I/O | Thread pool | Limited by `UV_THREADPOOL_SIZE` |
| DNS lookups | Thread pool | Can be a bottleneck |

### Performance Expectations

| Workload Type | Single Instance RPS | Notes |
|---------------|---------------------|-------|
| Simple JSON API | 10,000-30,000 | No database |
| With database queries | 1,000-5,000 | Depends on query complexity |
| With external API calls | 500-2,000 | Network latency dominant |
| CPU-heavy (bcrypt, crypto) | 100-500 | Consider worker threads |

## Scaling Strategies

### 1. Vertical Scaling (Scale Up)

Increase resources for a single instance.

```yaml
# Kubernetes resource limits
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**When to use:**
- Quick fix for temporary traffic spikes
- Development/staging environments
- Cost-effective for small workloads

**Limitations:**
- Single point of failure
- Hardware limits
- Doesn't improve fault tolerance

### 2. Horizontal Scaling (Scale Out)

Run multiple instances behind a load balancer.

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

**When to use:**
- Production environments
- High availability requirements
- Fault tolerance needed

**Considerations:**
- Stateless application design required
- Session management (use Redis)
- Database connection pooling

### 3. Node.js Cluster Mode

Use all CPU cores on a single machine.

```javascript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  // Start your Fastify server
  startServer();
}
```

**When to use:**
- Single-server deployments
- Maximum CPU utilization needed
- PM2 handles this automatically

## Kubernetes Configuration

### Deployment Template

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

## Common Bottlenecks

### 1. CPU-Bound Operations

**Problem:** Operations like bcrypt, image processing block the event loop.

**Solutions:**
```javascript
// Option 1: Worker Threads
import { Worker } from 'worker_threads';

function runInWorker(task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: task });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// Option 2: Offload to separate service
// Use a dedicated microservice for CPU-heavy tasks
```

### 2. Database Connections

**Problem:** Too many connections overwhelm the database.

**Solution:** Connection pooling via environment variables
```bash
# .env - Connection pool configuration
DB_CONNECTION_LIMIT=100    # Max connections in pool
DB_QUEUE_LIMIT=0           # Max queued requests (0 = unlimited)
DB_CONNECT_TIMEOUT=10000   # Connection timeout (ms)
DB_QUERY_TIMEOUT=30000     # Query timeout (ms)
```

```typescript
// db-bridge handles pooling automatically via MySQLAdapter
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 100,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
});
```

### 3. Memory Leaks

**Detection:**
```javascript
// Add to your health check
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

### 4. DNS Resolution

**Problem:** DNS lookups use the thread pool and can be slow.

**Solution:**
```javascript
// Pre-resolve DNS at startup
import dns from 'dns';

async function preResolveDNS() {
  const hosts = ['mysql.example.com', 'redis.example.com'];
  for (const host of hosts) {
    try {
      const addresses = await dns.promises.resolve4(host);
      console.log(`${host} resolved to ${addresses[0]}`);
    } catch (err) {
      console.error(`Failed to resolve ${host}`);
    }
  }
}
```

## Load Testing

### Tools

| Tool | Best For | Command |
|------|----------|---------|
| Apache Bench (ab) | Quick tests | `ab -n 1000 -c 50 URL` |
| hey | High concurrency | `hey -n 10000 -c 100 URL` |
| k6 | Complex scenarios | `k6 run script.js` |
| Artillery | API testing | `artillery run config.yml` |

### Basic Test Script

```bash
#!/bin/bash

URL="http://localhost:3000/api/endpoint"
PAYLOAD='{"key":"value"}'

echo "=== Warm-up ==="
ab -n 100 -c 10 -p /tmp/payload.json -T "application/json" $URL

echo "=== Light Load ==="
ab -n 1000 -c 10 -p /tmp/payload.json -T "application/json" $URL

echo "=== Medium Load ==="
ab -n 5000 -c 50 -p /tmp/payload.json -T "application/json" $URL

echo "=== Heavy Load ==="
ab -n 10000 -c 100 -p /tmp/payload.json -T "application/json" $URL
```

### Interpreting Results

```
Requests per second:    1000.00 [#/sec] (mean)  <- Throughput
Time per request:       50.000 [ms] (mean)      <- Latency
Failed requests:        0                        <- Error rate

Percentage of the requests served within a certain time (ms)
  50%     45   <- p50 (median)
  75%     52
  90%     65   <- p90
  95%     80   <- p95
  99%    120   <- p99 (important!)
 100%    250   <- max (outliers)
```

## Environment Variables

```bash
# Node.js performance tuning
NODE_ENV=production
UV_THREADPOOL_SIZE=16          # Default is 4
NODE_OPTIONS="--max-old-space-size=512"  # Heap size in MB

# Fastify
FASTIFY_CLOSE_GRACE_DELAY=500  # Graceful shutdown delay

# Connection limits
DB_POOL_MIN=2
DB_POOL_MAX=10
REDIS_MAX_CONNECTIONS=50
```

## Monitoring Checklist

### Metrics to Track

- [ ] Request rate (RPS)
- [ ] Response latency (p50, p95, p99)
- [ ] Error rate (4xx, 5xx)
- [ ] CPU utilization
- [ ] Memory usage (heap, RSS)
- [ ] Event loop lag
- [ ] Active connections
- [ ] Database query time
- [ ] External API call duration

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| p99 latency | > 500ms | > 1s |
| Error rate | > 1% | > 5% |
| CPU | > 70% | > 90% |
| Memory | > 70% | > 90% |
| Event loop lag | > 100ms | > 500ms |

## Best Practices Summary

1. **Design for horizontal scaling** - Stateless, share-nothing architecture
2. **Use connection pooling** - Database, Redis, HTTP clients
3. **Implement health checks** - Liveness and readiness probes
4. **Cache aggressively** - Redis for sessions, API responses
5. **Offload CPU work** - Worker threads or separate services
6. **Monitor everything** - Metrics, logs, traces
7. **Test under load** - Know your limits before production
8. **Graceful shutdown** - Handle SIGTERM properly
9. **Set resource limits** - Prevent runaway memory/CPU
10. **Use async/await** - Never block the event loop

## Further Reading

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [libuv Design Overview](http://docs.libuv.org/en/v1.x/design.html)
