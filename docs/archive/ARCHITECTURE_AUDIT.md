# Mkan Architecture Compliance Audit Report

**Date**: 2025-10-15
**Project**: Mkan Rental Marketplace
**Compliance Score**: 35%

## Executive Summary

The Mkan project requires significant architectural refactoring to achieve full compliance with the mirror-pattern architecture and internationalization standards. The most critical issue is that the entire application currently bypasses the internationalization system despite having a complete i18n infrastructure in place.

## Critical Issues (Blocking)

### 1. Missing [lang] Route Integration ⛔
**Severity**: CRITICAL
**Current State**:
- Root layout at `src/app/layout.tsx` does not use locale parameter
- All routes bypass i18n system (no `/en/` or `/ar/` prefix)
- Middleware redirects to `[lang]` but routes don't exist there

**Expected State**:
```
src/app/[lang]/
├── (auth)/
├── (dashboard)/
├── (site)/
├── (nondashboard)/
├── host/
└── hosting/
```

**Impact**:
- 78+ pages have NO internationalization
- Breaks locale detection and routing
- Middleware conflicts with current structure

**Fix Priority**: **IMMEDIATE** (blocks all i18n functionality)

### 2. Duplicate Root Layout ⛔
**Severity**: CRITICAL
**Files**:
- `src/app/layout.tsx` (root, no i18n)
- `src/app/[lang]/layout.tsx` (i18n-ready, unused)

**Issue**: Two conflicting root layouts exist

**Fix**: Remove root layout, move all routes under [lang]

## High Priority Issues

### 3. Inconsistent File Naming ⚠️
**Severity**: HIGH

**Non-Compliant Files**:
- `managers/newproperty/page.tsx` → should be `new-property`
- `searching/[id]/new-page.tsx` → unclear naming (old/new?)

**Standard**: Use kebab-case for all directory names

### 4. Components in App Directory ⚠️
**Severity**: HIGH

**Violating Files**:
```
app/(nondashboard)/landing/
├── CallToActionSection.tsx  ❌
├── DiscoverSection.tsx      ❌
├── FeaturesSection.tsx      ❌
└── FooterSection.tsx        ❌

app/(nondashboard)/searching/
├── FiltersBar.tsx           ❌
├── FiltersFull.tsx          ❌
├── Listings.tsx             ❌
└── Map.tsx                  ❌

app/(nondashboard)/searching/[id]/
├── ApplicationModal.tsx     ❌
├── ContactWidget.tsx        ❌
├── ImagePreviews.tsx        ❌
├── PropertyDetails.tsx      ❌
├── PropertyLocation.tsx     ❌
└── PropertyOverview.tsx     ❌
```

**Standard**: Only `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts` allowed in app/

**Expected Location**: `src/components/[feature-name]/`

## Medium Priority Issues

### 5. Server Actions Location 🟡
**Severity**: MEDIUM

**Current**: Centralized in `lib/actions/`
```
lib/actions/
├── user-actions.ts
├── application-actions.ts
└── index.ts
```

**Expected**: Feature-specific locations
```
components/auth/actions.ts
components/application/actions.ts
components/dashboard/actions.ts
```

### 6. Component Directory Organization 🟡
**Severity**: MEDIUM

**Issues**:
- `components/atom/` - Mixed concerns, needs consolidation
- `components/row/` - Legacy naming convention
- `components/airbnb/` - Empty directory
- `components/airbnb-onbording/` - Typo + unclear purpose

**Recommendation**: Follow feature-based organization

## Compliance Breakdown

| Category | Score | Status |
|----------|-------|--------|
| Internationalization | 0% | ❌ Not integrated |
| File Naming | 65% | ⚠️ Some issues |
| Component Location | 40% | ⚠️ Many violations |
| API Routes | 100% | ✅ Compliant |
| Server Actions | 20% | ❌ Needs refactor |
| Route Groups | 90% | ✅ Mostly good |
| **OVERALL** | **35%** | ❌ **Needs Work** |

## Refactoring Implementation Plan

### Phase 1: Critical Fixes (Week 1)
**Priority**: BLOCKING

1. **Move all routes under [lang]**
   - Create `app/[lang]/(auth)/`, `app/[lang]/(dashboard)/`, etc.
   - Move all existing pages
   - Update imports
   - Test locale routing

2. **Remove root layout**
   - Delete `app/layout.tsx`
   - Ensure `app/[lang]/layout.tsx` is the only root

3. **Update middleware**
   - Verify middleware works with new structure
   - Test redirects

### Phase 2: High Priority Fixes (Week 2)

4. **Extract components from app/**
   - Move landing sections to `components/landing/`
   - Move search components to `components/search/`
   - Move property details to `components/property/`

5. **Standardize file naming**
   - Rename `newproperty` → `new-property`
   - Clean up any other inconsistencies

### Phase 3: Medium Priority Fixes (Week 3)

6. **Reorganize server actions**
   - Move to feature-specific locations
   - Update imports across codebase

7. **Consolidate component directories**
   - Review and reorganize `atom/` and `row/`
   - Remove empty directories
   - Follow feature-based structure

### Phase 4: Validation (Week 4)

8. **Compliance testing**
   - Automated checks for file naming
   - Verify all routes have i18n
   - Test RTL/LTR switching
   - Manual QA of all features

9. **Documentation**
   - Update CLAUDE.md with new structure
   - Document architecture patterns
   - Create contribution guidelines

## Recommended Next Steps

1. ✅ **APPROVED**: Begin Phase 1 immediately
2. ⏳ **BLOCKING**: Cannot proceed with other phases until [lang] integration complete
3. 📋 **PREPARE**: Document current imports for batch updates
4. 🧪 **TEST**: Set up testing environment for validation

## Risk Assessment

### High Risk
- Moving all routes under [lang] may break existing links
- Large number of import updates required
- Potential for routing conflicts during migration

### Mitigation Strategy
- Work in feature branches
- Test each route group independently
- Maintain backward compatibility temporarily
- Comprehensive testing before merge

## Success Criteria

✅ All routes accessible via `/en/` and `/ar/` prefixes
✅ No components in `app/` except page files
✅ Consistent kebab-case naming
✅ Server actions in feature folders
✅ Clean component directory structure
✅ 95%+ compliance score

---

**Status**: Ready for implementation
**Estimated Effort**: 4 weeks
**Priority**: HIGH - Start immediately
