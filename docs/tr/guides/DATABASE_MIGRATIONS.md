# Veritabanı Migration Rehberi

## Genel Bakış

LobsterLead **monolith veritabanı** mimarisi kullanır ve birden fazla şema içerir. Her mikroservis kendi şemasına sahiptir ancak aynı MySQL örneğini paylaşır. Bu, çakışmaları önlemek için tutarlı bir migration adlandırma kuralı gerektirir.

## Veritabanı Mimarisi

```
MySQL Instance (localhost:3306)
├── lobsterlead_auth      # Auth Service şeması
├── lobsterlead_core      # Core Service şeması
├── lobsterlead_settings  # Settings Service şeması
└── lobsterlead_...       # Diğer servis şemaları
```

## Migration Adlandırma Kuralı

### Format
```
{servis_prefix}_{timestamp}_{aciklama}.ts
```

### Bileşenler
| Bileşen | Açıklama | Örnek |
|---------|----------|-------|
| `servis_prefix` | Kısa servis tanımlayıcısı | `auth`, `core`, `settings`, `blog` |
| `timestamp` | YYYYMMDDHHMMSS formatı | `20250101000000` |
| `aciklama` | Snake_case açıklama | `initial_schema`, `add_users_table` |

### Örnekler

```
# Auth Service
auth_20250101000000_initial_schema.ts
auth_20250101000001_seed_data.ts
auth_20250115120000_add_2fa_columns.ts

# Core Service
core_20250101000000_initial_schema.ts
core_20250101000001_seed_data.ts
```

## Neden Servis Prefix?

### Problem: Prefix Olmadan
```
# Auth Service
20250101000000_initial_schema.ts

# Core Service (ÇAKIŞMA!)
20250101000000_initial_schema.ts  ← Aynı isim, farklı servis
```

Knex migration'ları çalıştırırken dosya adlarını `knex_migrations` tablosunda takip eder. Prefix olmadan:
- Migration isimleri servisler arasında çakışabilir
- Bir migration'ın hangi servise ait olduğunu belirlemek zor
- Rollback işlemleri karmaşık hale gelir

### Çözüm: Prefix ile
```
# Auth Service
auth_20250101000000_initial_schema.ts

# Core Service (Çakışma yok)
core_20250101000000_initial_schema.ts
```

Faydaları:
- ✅ Tüm servisler arasında benzersiz migration isimleri
- ✅ Servis sahipliğini kolayca belirleme
- ✅ Alfabetik olarak servise göre gruplama
- ✅ Güvenli rollback işlemleri

## Yeni Migration Oluşturma

### 1. Timestamp oluşturun
```bash
# YYYYMMDDHHMMSS formatında mevcut timestamp
date +"%Y%m%d%H%M%S"
# Çıktı: 20250108143022
```

### 2. Migration dosyası oluşturun
```bash
# Format: {prefix}_{timestamp}_{aciklama}.ts
touch src/infra/db/migrations/service_20250108143022_add_new_table.ts
```

### 3. Migration'ı yazın
```typescript
import type { Knex } from 'knex';

/**
 * Migration: Yeni tablo ekle
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('new_table', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('new_table');
}
```

### 4. Migration'ı çalıştırın
```bash
npm run migrate
```

## Migration Komutları

```bash
# Bekleyen tüm migration'ları çalıştır
npm run migrate

# Son batch'i geri al
npm run migrate:rollback

# Migration durumunu kontrol et
npm run migrate:status

# Veritabanını sıfırla (tüm tabloları siler)
npm run migrate:fresh
```

## En İyi Uygulamalar

### YAPILMASI GEREKEN ✅
- Her zaman servis prefix kullanın
- Açıklayıcı isimler kullanın
- Hem `up` hem `down` fonksiyonlarını ekleyin
- Dağıtımdan önce rollback'i test edin

### YAPILMAMASI GEREKEN ❌
- Zaten dağıtılmış mevcut migration'ları değiştirmeyin
- Birden fazla migration için aynı timestamp kullanmayın
- Migration'lara iş mantığı koymayın
- Servis prefix'ini atlamayın
