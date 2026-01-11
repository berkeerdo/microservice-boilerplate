# Modular Architecture Guide

> Last Updated: 2025-12-21
> Based on: Google Protocol Buffers Best Practices & Node.js DI Patterns

---

## 1. Proto File Organization (1-1-1 Pattern)

### Best Practice: One Service Per File

**Google'ın Resmi Önerisi:**
> "One proto_library, One source .proto file, One top-level entity"

### Before (Monolithic)
```
protos/
└── workspace.proto  # 1070 satır, 9 servis
```

### After (Modular)
```
protos/
├── common/
│   └── messages.proto          # Shared types (GenericResponse, etc.)
├── workspace/
│   ├── workspace_service.proto # WorkspaceService only
│   ├── team_service.proto      # TeamService only
│   ├── invite_service.proto    # InviteService only
│   ├── role_service.proto      # RoleService only
│   ├── permission_service.proto
│   ├── deletion_service.proto  # Workspace deletion
│   └── brand/
│       ├── brand_service.proto
│       ├── brand_variant_service.proto
│       └── brand_deletion_service.proto
└── health.proto                # Health check (standalone)
```

### Benefits
- **Kolay refactoring** - Her servis bağımsız
- **Daha iyi build performansı** - Gereksiz dependency yok
- **Breaking change izolasyonu** - Bir servis değişikliği diğerlerini etkilemez
- **Versiyonlama** - `package workspace.v2;` ile paralel deployment

### Implementation Checklist
- [ ] `common/messages.proto` oluştur (GenericResponse, etc.)
- [ ] Her servis için ayrı proto dosyası
- [ ] Import'ları düzenle
- [ ] Handler'ları güncelle
- [ ] Gateway client'ları güncelle
- [ ] Test et

---

## 2. DI Container Modularization

### Best Practice: Feature-Based Modules

**Önerilen Pattern:**
> "Organize services and components by feature or domain logic"

### Before (Monolithic)
```
src/
└── container.ts  # 780+ satır, tüm kayıtlar tek dosyada
```

### After (Modular)
```
src/
└── container/
    ├── index.ts              # Ana container export
    ├── types.ts              # Cradle interface, TOKENS
    ├── infrastructure.ts     # Database, Redis, Logger
    └── modules/
        ├── brand.module.ts
        ├── workspace.module.ts
        ├── team.module.ts
        ├── invite.module.ts
        ├── role.module.ts
        ├── permission.module.ts
        └── deletion.module.ts
```

### Module Structure
```typescript
// src/container/modules/brand.module.ts
import { asClass, asFunction, AwilixContainer } from 'awilix';
import { BrandRepository } from '../../infra/db/repositories/brand/BrandRepository.js';
import { CreateBrandUseCase, GetBrandUseCase, ... } from '../../application/useCases/index.js';

export function registerBrandModule(container: AwilixContainer): void {
  container.register({
    // Repository
    brandRepository: asClass(BrandRepository).singleton(),

    // Use Cases
    createBrandUseCase: asFunction(
      ({ brandRepository, logger }) => new CreateBrandUseCase(brandRepository, logger)
    ).transient(),
    // ...
  });
}
```

### Main Container
```typescript
// src/container/index.ts
import { createContainer, InjectionMode } from 'awilix';
import { registerInfrastructure } from './infrastructure.js';
import { registerBrandModule } from './modules/brand.module.js';
import { registerWorkspaceModule } from './modules/workspace.module.js';
// ...

export function createAppContainer() {
  const container = createContainer({ injectionMode: InjectionMode.CLASSIC });

  // Infrastructure first
  registerInfrastructure(container);

  // Domain modules
  registerBrandModule(container);
  registerWorkspaceModule(container);
  // ...

  return container;
}
```

### Benefits
- **Kolay navigasyon** - Her modül kendi dosyasında
- **Dependency görünürlüğü** - Modül bağımlılıkları net
- **Reusability** - Modüller arası paylaşım kolay
- **Testability** - Modül bazlı mock'lama

---

## 3. File Size Guidelines

| Dosya Tipi | Max Satır | Aksiyon |
|------------|-----------|---------|
| Proto (per service) | 200 | Split if > 200 |
| Container module | 100 | Split by feature |
| Use Case | 200 | Single responsibility |
| Handler | 350 | Split by domain |
| Repository | 400 | Delegation pattern |

---

## 4. Migration Strategy

### Phase 1: Proto Files (High Impact)
1. `common/messages.proto` oluştur
2. Her servis için ayrı dosya
3. Import'ları düzenle
4. Handler'ları güncelle

### Phase 2: Container Modularization
1. `container/` klasörü oluştur
2. `types.ts` ile interface'leri ayır
3. Modül bazlı dosyalar oluştur
4. Ana container'ı güncelle

### Phase 3: Validation
1. Build test
2. Unit test
3. Integration test
4. gRPC endpoint test

---

## 5. Priority Matrix

| Service | Proto Size | Container Size | Priority |
|---------|------------|----------------|----------|
| workspace-service | 1070 | 782 | HIGH |
| notification-service | 1095 | 192 | HIGH (proto) |
| auth-service | 732 | 6 | MEDIUM |
| dataset-service | 277 | 209 | LOW |
| gateway | - | 108 | LOW |

---

## Sources

- [Protocol Buffers 1-1-1 Best Practice](https://protobuf.dev/best-practices/1-1-1/)
- [gRPC Proto Files Best Practices](https://dev.to/sonny_ad/grpc-proto-files-best-practices-2aab)
- [TypeScript DI Best Practices](https://codezup.com/dependency-injection-in-typescript-best-practices/)
- [Node.js DI Patterns](https://vrize.com/insights/blogs/dependency-injection-in-nodejs-typescript)
