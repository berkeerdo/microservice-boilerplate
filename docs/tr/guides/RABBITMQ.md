# RabbitMQ Entegrasyon Rehberi

LobsterLead mikroservisleri için endüstri standardı RabbitMQ implementasyonu.

## Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RabbitMQ Broker                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Exchange   │───▶│    Queue     │───▶│  Dead Letter │          │
│  │ (topic/fanout)│    │   + Retry    │    │    Queue     │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
         ▲                     │
         │                     ▼
┌────────┴────────┐    ┌──────────────────┐
│   Publisher     │    │    Consumer       │
│  (Confirm Mode) │    │ (Circuit Breaker) │
└─────────────────┘    └──────────────────┘
```

## Özellikler

### QueueConnection
- Exponential backoff ve jitter ile **otomatik yeniden bağlanma**
- Sağlık izleme için **bağlantı heartbeat**
- Consumer başına **özel kanallar** (engellemeyi önler)
- Publisher'lar için **confirm kanalları** (garantili teslimat)
- **Graceful shutdown** yönetimi

### BaseConsumer
- Exponential backoff ile **otomatik retry** (yapılandırılabilir max retry)
- Başarısız mesajlar için **Dead Letter Queue (DLQ)**
- Hata toleransı için **circuit breaker** pattern
- İzleme için korelasyon ID'leri ile **mesaj context'i**
- Throughput yönetimi için **prefetch kontrolü**

### BasePublisher
- Garantili teslimat için **publisher confirms**
- Exponential backoff ile **retry mantığı**
- **Circuit breaker** entegrasyonu
- **Sonuç takibi** (başarı/hata ve retry sayısı)

### CircuitBreaker
- Üç durum: CLOSED, OPEN, HALF_OPEN
- Yapılandırılabilir hata eşiği
- Otomatik kurtarma testi
- Kaskad hataları önler

## Hızlı Başlangıç

### 1. Bağlantı Oluşturma

```typescript
import { QueueConnection } from './infra/queue';

const connection = new QueueConnection({
  host: config.RABBITMQ_HOST,
  port: config.RABBITMQ_PORT,
  username: config.RABBITMQ_USERNAME,
  password: config.RABBITMQ_PASSWORD,
  vhost: config.RABBITMQ_VHOST,
  connectionName: 'my-service',
  prefetch: 10,
});

await connection.connect();
```

### 2. Publisher Oluşturma

```typescript
import { BasePublisher } from './infra/queue';

class MyEventPublisher extends BasePublisher {
  constructor(connection: QueueConnection) {
    super(connection, {
      exchangeName: 'my-service.events',
      exchangeType: 'topic',
      useConfirms: true,
      maxRetries: 3,
    });
  }

  async publishUserCreated(userId: number) {
    return this.publish('user.created', {
      userId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Kullanım
const publisher = new MyEventPublisher(connection);
await publisher.initialize();
const result = await publisher.publishUserCreated(123);
if (!result.success) {
  console.error('Hata:', result.error);
}
```

### 3. Consumer Oluşturma

```typescript
import { BaseConsumer, MessageContext } from './infra/queue';

class UserEventConsumer extends BaseConsumer {
  constructor(connection: QueueConnection) {
    super(connection, {
      queueName: 'my-service.user-events',
      exchangeName: 'user-service.events',
      routingKeys: ['user.created', 'user.updated'],
      prefetch: 5,
      maxRetries: 3,
    });
  }

  protected async processMessage(
    content: unknown,
    context: MessageContext
  ): Promise<void> {
    const { routingKey, correlationId } = context;

    switch (routingKey) {
      case 'user.created':
        await this.handleUserCreated(content);
        break;
      case 'user.updated':
        await this.handleUserUpdated(content);
        break;
    }
  }

  private async handleUserCreated(event: unknown) {
    // Event işleme...
  }
}

// Kullanım
const consumer = new UserEventConsumer(connection);
await consumer.initialize();
await consumer.startConsuming();
```

## Yapılandırma

### Ortam Değişkenleri

```bash
# RabbitMQ Etkin/Devre Dışı
RABBITMQ_ENABLED=true

# Bağlantı
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# Performans
RABBITMQ_PREFETCH=10
```

### Consumer Seçenekleri

```typescript
interface ConsumerOptions {
  queueName: string;           // Tüketilecek kuyruk
  exchangeName: string;        // Bağlanılacak exchange
  routingKeys: string[];       // Routing pattern'leri
  prefetch?: number;           // Önceden alınacak mesaj sayısı (varsayılan: 10)
  maxRetries?: number;         // Maksimum retry sayısı (varsayılan: 3)
  initialRetryDelayMs?: number;// İlk retry gecikmesi (varsayılan: 1000)
  maxRetryDelayMs?: number;    // Maksimum retry gecikmesi (varsayılan: 30000)
  useCircuitBreaker?: boolean; // Circuit breaker etkin (varsayılan: true)
  circuitBreakerThreshold?: number; // Açılmadan önceki hata sayısı (varsayılan: 5)
  exchangeType?: string;       // Exchange tipi (varsayılan: topic)
}
```

### Publisher Seçenekleri

```typescript
interface PublisherOptions {
  exchangeName: string;        // Yayınlanacak exchange
  exchangeType?: string;       // Exchange tipi (varsayılan: topic)
  useConfirms?: boolean;       // Publisher confirms kullan (varsayılan: true)
  maxRetries?: number;         // Maksimum retry sayısı (varsayılan: 3)
  initialRetryDelayMs?: number;// İlk retry gecikmesi (varsayılan: 100)
  maxRetryDelayMs?: number;    // Maksimum retry gecikmesi (varsayılan: 5000)
  useCircuitBreaker?: boolean; // Circuit breaker etkin (varsayılan: true)
}
```

## Mesaj Akışı

### Yayınlama (Publishing)

```
1. Publisher.publish()
     │
     ▼
2. Circuit Breaker kontrolü
     │ (açıksa, hızlı hata)
     ▼
3. Mesajı JSON'a serialize et
     │
     ▼
4. Exchange'e yayınla (confirms ile)
     │
     ├─▶ Başarı: PublishResult { success: true } döndür
     │
     └─▶ Hata: Backoff ile retry
           │
           ├─▶ Max retries: { success: false, error } döndür
           │
           └─▶ Retry: Bekle, adım 3'e git
```

### Tüketme (Consuming)

```
1. Kuyruktan mesaj alındı
     │
     ▼
2. Mesaj içeriğini parse et
     │
     ▼
3. Circuit Breaker kontrolü
     │ (açıksa, sonraya kuyruğa al)
     ▼
4. processMessage() çağır
     │
     ├─▶ Başarı: Mesajı ACK'le
     │
     └─▶ Hata: Retry sayısını kontrol et
           │
           ├─▶ Max altında: Backoff ile retry planla
           │
           └─▶ Max'ta: NACK → DLQ
```

## Retry Stratejisi

Jitter ile exponential backoff:

```
gecikme = min(başlangıçGecikme × 2^(retrySayısı-1), maxGecikme) + random(0, gecikme×0.25)
```

Varsayılanlarla örnek:
- Retry 1: ~1000ms
- Retry 2: ~2000ms
- Retry 3: ~4000ms

## Dead Letter Queue (DLQ)

Max retry sonrası başarısız mesajlar DLQ'ya gider:

```
Kuyruk: my-service.user-events
  │
  ▼ (3 hatadan sonra)
DLQ: my-service.user-events.dlq
```

DLQ mesajlarına eklenen header'lar:
- `x-retry-count`: Denenen retry sayısı
- `x-first-failure-time`: İlk hata zamanı
- `x-last-error`: Son hata mesajı
- `x-original-routing-key`: Orijinal routing key

## Circuit Breaker

Kaskad hataları önler:

```
CLOSED ──(hatalar > eşik)──▶ OPEN
   ▲                           │
   │                     (resetTimeout)
   │                           ▼
   └────(başarılar > eşik)── HALF_OPEN
```

Durumlar:
- **CLOSED**: Normal çalışma, tüm istekler geçer
- **OPEN**: Tüm istekler anında hata verir (hızlı hata)
- **HALF_OPEN**: Kurtarma testi, sınırlı istek

## Sağlık İzleme

```typescript
import { QueueHealthService } from './infra/queue';

// Tüm bağlantıları kontrol et
const status = QueueHealthService.getOverallStatus();
// 'healthy' | 'degraded' | 'dead' | 'not_configured'

// Bireysel durumları al
const statuses = QueueHealthService.getAllStatuses();
// { 'my-connection': 'connected', ... }
```

## En İyi Pratikler

### 1. Consumer Başına Bir Kanal
Her consumer engellemeyi önlemek için kendi kanalını alır:
```typescript
// BaseConsumer bunu otomatik yapar
this.channel = await this.queueConnection.createChannel();
```

### 2. Kritik Mesajlar İçin Confirm Channel
```typescript
const publisher = new BasePublisher(connection, {
  useConfirms: true, // Garantili teslimat
});
```

### 3. Uygun Prefetch Ayarla
```typescript
// Yüksek throughput, hafif işleme
prefetch: 50

// Düşük throughput, ağır işleme
prefetch: 1
```

### 4. Hataları Zarif Şekilde Yönet
```typescript
protected async processMessage(content: unknown, context: MessageContext) {
  try {
    await this.doWork(content);
  } catch (error) {
    if (this.isTemporaryError(error)) {
      throw error; // Retry yapılacak
    }
    // Kalıcı hata - logla ve retry yapma
    logger.error({ error }, 'Kalıcı hata');
  }
}
```

### 5. Korelasyon ID'leri Kullan
```typescript
// Publisher
await publisher.publish('event', data, { correlationId: requestId });

// Consumer
processMessage(content, context) {
  const { correlationId } = context;
  logger.info({ correlationId }, 'İşleniyor');
}
```

## Graceful Shutdown

```typescript
// Shutdown handler'ları kaydet
gracefulShutdown.register('queue-connection', async () => {
  await consumer.close();
  await connection.close();
});
```

## Sorun Giderme

### Bağlantı Sorunları
```
Hata: RabbitMQ'ya bağlanılamadı
```
- RabbitMQ'nun çalıştığını kontrol et
- Kimlik bilgilerini ve host/port'u doğrula
- Firewall kurallarını kontrol et

### Mesaj İşleme Hataları
```
Uyarı: Mesaj max retry'ı aştı, DLQ'ya gönderiliyor
```
- Başarısız mesajlar için DLQ'yu kontrol et
- `x-last-error` header'ındaki hatayı incele
- İşleme mantığını düzelt ve DLQ'dan tekrar oynat

### Circuit Breaker Açık
```
Bilgi: Circuit breaker durumu CLOSED'dan OPEN'a değişti
```
- Downstream servis sağlığını kontrol et
- Reset timeout'u bekle
- Hataların kök nedenini araştır
