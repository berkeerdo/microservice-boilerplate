# Commit Konvansiyonu Rehberi

Bu proje [Conventional Commits](https://www.conventionalcommits.org/) spesifikasyonunu takip eder. Tüm commit'ler **commitlint** ve **Husky** git hook'ları ile otomatik olarak doğrulanır.

## Commit Mesajı Formatı

```
<type>(<scope>): <description>

<body>

<footer>
```

### Yapı

| Parça | Zorunlu | Kurallar |
|-------|---------|----------|
| type | ✅ Evet | İzin verilen tiplerden biri olmalı |
| scope | ⚠️ Önerilen | Küçük harf, etkilenen alanı tanımlar |
| description | ✅ Evet | Küçük harf, emir kipi, nokta yok, max 50 karakter |
| body | ❌ Opsiyonel | Öncesinde boş satır, satır başı max 100 karakter |
| footer | ❌ Opsiyonel | BREAKING CHANGE veya issue referansları için |

## Commit Tipleri

| Tip | Açıklama | Örnek |
|-----|----------|-------|
| `feat` | Kullanıcı için yeni özellik | `feat(auth): add jwt refresh token support` |
| `fix` | Kullanıcı için bug düzeltmesi | `fix(api): resolve null pointer in user handler` |
| `docs` | Sadece dokümantasyon değişikliği | `docs(readme): update installation instructions` |
| `style` | Formatlama, kod değişikliği yok | `style(lint): fix eslint warnings` |
| `refactor` | Kod yeniden yapılandırma | `refactor(db): simplify query builder logic` |
| `perf` | Performans iyileştirmeleri | `perf(cache): optimize redis key generation` |
| `test` | Test ekleme veya güncelleme | `test(auth): add unit tests for jwt service` |
| `build` | Build sistemi veya bağımlılıklar | `build(deps): upgrade fastify to v5` |
| `ci` | CI/CD yapılandırması | `ci(github): add node 22 to test matrix` |
| `chore` | Bakım görevleri | `chore(deps): update dev dependencies` |
| `revert` | Önceki commit'i geri al | `revert: revert "feat(auth): add oauth"` |

## Önerilen Scope'lar

| Scope | Açıklama |
|-------|----------|
| `api` | HTTP API route'ları ve handler'lar |
| `auth` | Kimlik doğrulama ve yetkilendirme |
| `db` | Veritabanı ile ilgili değişiklikler |
| `cache` | Redis cache işlemleri |
| `queue` | RabbitMQ mesaj kuyruğu |
| `config` | Yapılandırma ve environment |
| `middleware` | Fastify middleware'leri |
| `grpc` | gRPC servis tanımları |
| `docs` | Dokümantasyon |
| `deps` | Bağımlılıklar |

## Kurallar Özeti

### Header (İlk Satır)
- **Toplam max 72 karakter**
- **Description max 50 karakter**
- **Küçük harf** her şey
- **Emir kipi** ("add" not "added" veya "adds")
- **Nokta yok** sonunda

### Body
- Body'den önce **boş satır** (zorunlu)
- Satır başına **max 100 karakter**
- **Madde işaretleri** `-` ile başlasın
- **Ne** ve **neden** açıklayın, nasıl değil
- Uzun satırları **düzgün kaydırın**

### Footer
- Footer'dan önce **boş satır**
- `BREAKING CHANGE:` notları için kullanın
- Issue referansı: `Closes #123`

## Örnekler

### Basit Commit (Body Yok)

```
feat(auth): add password reset endpoint
```

### Body'li Commit

```
fix(db): resolve connection pool exhaustion

- increase max connections from 10 to 100
- add connection timeout handling
- implement retry logic for transient failures
```

### Breaking Change ile Commit

```
feat(api): change response format to json:api spec

- update all endpoint responses to follow json:api format
- add meta information to paginated responses

BREAKING CHANGE: all API responses now follow json:api specification.
Clients need to update their response parsing logic.
```

### Çok Satırlı Body (Satır Kaydırma)

❌ **Yanlış** - Satır çok uzun:
```
- delete outdated standalone service modules including content creation, image generation, and orchestration
```

✅ **Doğru** - Düzgün kaydırılmış:
```
- delete outdated standalone service modules including content creation,
  image generation, and orchestration
```

## Git Hook'ları

### Pre-commit Hook
**lint-staged** çalıştırır:
- Stage'lenmiş `.ts` dosyalarında ESLint `--fix` ile çalışır
- Stage'lenmiş `.ts` dosyalarında Prettier `--write` ile çalışır

### Commit-msg Hook
Commit mesajını commitlint kurallarına göre doğrular.

## Commit Mesajını Test Etme

```bash
# Commit mesajını test et
echo "feat(api): add new endpoint" | npx commitlint

# Tüm kuralları gör
npx commitlint --print-config
```

## IDE Entegrasyonu

### VS Code
Commit mesajı şablonları için [Conventional Commits](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) eklentisini yükleyin.

### JetBrains IDE'leri
[Conventional Commit](https://plugins.jetbrains.com/plugin/13389-conventional-commit) eklentisini yükleyin.

## Hızlı Referans

```
feat(scope): add something new          # Yeni özellik
fix(scope): resolve the bug             # Bug düzeltme
docs(scope): update the readme          # Dokümantasyon
style(scope): format the code           # Formatlama
refactor(scope): simplify the logic     # Yeniden yapılandırma
perf(scope): optimize the query         # Performans
test(scope): add unit tests             # Testler
build(scope): upgrade dependencies      # Build/bağımlılıklar
ci(scope): update github actions        # CI/CD
chore(scope): clean up old files        # Bakım
revert: revert "previous commit"        # Geri al
```

## Sık Yapılan Hatalar

| Hata | Doğrusu |
|------|---------|
| `Feat: Add login` | `feat: add login` (küçük harf) |
| `feat: Added login` | `feat: add login` (emir kipi) |
| `feat: add login.` | `feat: add login` (nokta yok) |
| `feat: add a very long description that exceeds the limit` | Kısalt! Max 50 karakter |
| Body'de 100+ karakter satır | Satırı kaydır |
