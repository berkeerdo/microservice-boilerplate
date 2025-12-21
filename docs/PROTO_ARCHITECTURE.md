# Proto Architecture Guide

> LobsterLead Microservices - gRPC Proto Standards
> Last Updated: 2025-12-20

---

## Proto File Standards

### 1. Maximum Line Limits

| Category | Max Lines | Example |
|----------|-----------|---------|
| Small proto | 100 | health.proto, settings.proto |
| Medium proto | 300 | dataset.proto, social-media.proto |
| Large proto | 500 | auth.proto (single domain) |
| **Absolute Max** | **500** | Split if exceeds |

### 2. Naming Conventions

```
{domain}.proto          # Main domain proto
{domain}-{subdomain}.proto  # If split needed
health.proto            # Standard health check (shared)
```

**Examples:**
- `auth.proto` - Authentication & user management
- `workspace.proto` - Workspace CRUD only
- `workspace-team.proto` - Team operations
- `workspace-invite.proto` - Invite operations

### 3. Directory Structure

```
src/
└── grpc/
    └── protos/
        ├── health.proto          # Standard health check
        ├── {service}.proto       # Main service proto
        └── {service}-{sub}.proto # Split protos if needed
```

### 4. Proto File Organization

Each proto file should follow this structure:

```protobuf
syntax = "proto3";

package lobsterlead.{domain};

// ============================================
// SERVICE DEFINITION
// ============================================
service {ServiceName} {
  // Group RPCs by functionality

  // --- CRUD Operations ---
  rpc Create... (...) returns (...);
  rpc Get... (...) returns (...);
  rpc Update... (...) returns (...);
  rpc Delete... (...) returns (...);

  // --- Business Operations ---
  rpc DoSomething... (...) returns (...);
}

// ============================================
// REQUEST MESSAGES
// ============================================
message CreateRequest { ... }
message GetRequest { ... }

// ============================================
// RESPONSE MESSAGES
// ============================================
message CreateResponse { ... }
message GetResponse { ... }

// ============================================
// DATA MESSAGES (Shared)
// ============================================
message EntityData { ... }
```

### 5. Splitting Strategy

When a proto exceeds 500 lines, split by **domain/entity**:

**workspace.proto (956 lines) → Split into:**
```
workspace.proto         (~200 lines) - Workspace CRUD, settings
workspace-team.proto    (~150 lines) - Team CRUD, members
workspace-invite.proto  (~150 lines) - Invite operations
workspace-role.proto    (~150 lines) - Role & permission
workspace-brand.proto   (~200 lines) - Brand & variants
workspace-deletion.proto(~100 lines) - Deletion operations
```

### 6. Shared Messages

For messages used across multiple services, consider:

1. **Option A**: Duplicate in each proto (simple, no dependencies)
2. **Option B**: Create `common.proto` with shared types

**Recommended: Option A** for simplicity, unless types are truly shared.

### 7. Service-Proto Mapping

| Service | Owns Proto | Consumes Proto |
|---------|------------|----------------|
| auth-service | auth.proto | - |
| workspace-service | workspace*.proto | auth.proto (validate) |
| notification-service | notification.proto | auth.proto (validate) |
| gateway | - | All (client) |

### 8. Version Control

- Proto changes should be backward compatible
- Use `optional` for new fields
- Never remove/rename existing fields in production
- Deprecate with comments: `// DEPRECATED: Use field_x instead`

---

## Current Status (2025-12-20)

### Compliant ✅
- auth.proto (732 lines) - Single domain, acceptable
- dataset.proto (277 lines)
- social-media.proto (385 lines)
- health.proto (29 lines) - Standard
- notification-service/auth.proto (732 lines) - ✅ Synced from auth-service

### Acceptable Exceptions ⚠️
- workspace.proto (956 lines) - 8 services, well-organized by domain
  - Split would add complexity (handler/proxy changes)
  - Keep as single file unless grows significantly

### Needs Review (Future)
- notification-service/service.proto (1095 lines) → Consider splitting

---

## Migration Plan

### Phase 1: Sync Outdated Protos ✅ COMPLETED
1. ✅ Updated notification-service/auth.proto (1293 → 732 lines)
2. ✅ Gateway auth.proto synced with auth-service

### Phase 2: Future Improvements (Low Priority)
1. Review notification-service/service.proto (1095 lines)
2. workspace.proto kept as-is (well-organized, split adds complexity)

### Phase 3: Ongoing Maintenance
1. Follow standards for new proto files (max 500 lines)
2. Sync protos when source service changes
3. Run build tests after proto changes

---

## Proto Sync Commands

```bash
# Sync auth.proto from auth-service to other services
cp lobsterlead-auth-service/src/grpc/protos/auth.proto \
   lobsterlead-gateway/src/grpc/protos/auth.proto

cp lobsterlead-auth-service/src/grpc/protos/auth.proto \
   lobsterlead-notification-service/src/grpc/protos/auth.proto

# Sync workspace.proto from workspace-service to gateway
cp lobsterlead-workspace-service/src/grpc/protos/workspace.proto \
   lobsterlead-gateway/src/grpc/protos/workspace.proto
```
