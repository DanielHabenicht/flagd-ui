# Multi-Environment Feature Flag Management - Implementation Plan

## Problem Statement

Managing feature flags across many customer deployments requires:

1. **Quick Environment Switching**: Users must be able to quickly add and switch activation of a feature flag for an environment from flagd-ui
2. **DRY Principle**: Environments should ideally only be defined once (possibly via `$evaluators`) for easy management
3. **Security**: The existence of an environment cannot be leaked during feature flag evaluation, so metadata cannot be used

## Background: flagd Flag Definitions

According to the [flagd schema](../schema/flagd-schema.json), the flag definition format supports:

- **Flags**: Individual feature flags with variants, targeting rules, state, and metadata
- **$evaluators**: Reusable targeting rules that can be referenced with `"$ref": "myRule"` in multiple flags
- **Metadata**: Can be defined at both the flag set level and individual flag level (but cannot be used for environments due to security requirement)

## Proposed Solutions

### Option 1: Environment-Based Variants with $evaluators (RECOMMENDED)

**Concept**: Use environment names as variant keys, with shared `$evaluators` for environment detection logic.

#### Structure

```json
{
  "$schema": "https://flagd.dev/schema/v0/flags.json",
  "$evaluators": {
    "isProduction": {
      "in": [
        { "var": "environment" },
        ["prod", "production"]
      ]
    },
    "isStaging": {
      "in": [
        { "var": "environment" },
        ["staging", "stage"]
      ]
    },
    "isDevelopment": {
      "in": [
        { "var": "environment" },
        ["dev", "development", "local"]
      ]
    }
  },
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": {
        "production": true,
        "staging": true,
        "development": true,
        "off": false
      },
      "defaultVariant": "off",
      "targeting": {
        "if": [
          { "$ref": "isProduction" },
          "production",
          {
            "if": [
              { "$ref": "isStaging" },
              "staging",
              {
                "if": [
                  { "$ref": "isDevelopment" },
                  "development",
                  "off"
                ]
              }
            ]
          }
        ]
      }
    }
  }
}
```

#### UI Changes Required

1. **Environment Management Panel**
   - New UI section to define environments (name, aliases)
   - Stored in `$evaluators` section
   - Simple CRUD operations for environments

2. **Enhanced Flag Editor - "Easy Mode"**
   - Per-environment toggle switches
   - Visual representation showing which environments have the flag enabled
   - Quick enable/disable for each environment
   - Behind the scenes, updates both variants and targeting rules

3. **Backend Changes**
   - Add environment template helpers
   - Validate environment references in targeting
   - Helper functions to generate targeting rules

#### Pros
- ✅ Environments defined once in `$evaluators`
- ✅ No environment leakage (environments resolved via context variable)
- ✅ Clean separation between environment definition and flag activation
- ✅ Easy to add new environments without touching individual flags
- ✅ Reusable across all flags
- ✅ Works with existing flagd without modifications

#### Cons
- ⚠️ Requires passing `environment` in evaluation context
- ⚠️ More complex targeting logic generation
- ⚠️ UI complexity in "easy mode" for managing environment states

---

### Option 2: Multi-File Strategy (One File Per Environment)

**Concept**: Maintain separate flag definition files for each environment (e.g., `production.flagd.json`, `staging.flagd.json`).

#### Structure

```
flags/
  ├── production.flagd.json
  ├── staging.flagd.json
  └── development.flagd.json
```

Each file contains the same flags but with different states:

```json
// production.flagd.json
{
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "on"
    }
  }
}

// staging.flagd.json
{
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "on"
    }
  }
}

// development.flagd.json
{
  "flags": {
    "new-checkout-flow": {
      "state": "DISABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off"
    }
  }
}
```

#### UI Changes Required

1. **Environment Selector**
   - Dropdown to select which environment file to view/edit
   - Visual indicator showing current environment

2. **Multi-Environment View**
   - Table view showing all flags across all environments
   - Quick toggle for each flag in each environment
   - Sync capabilities to copy flags between environments

3. **Backend Changes**
   - Template system to create new environment files
   - Bulk operations for syncing flags across environments

#### Pros
- ✅ Simple concept - one file per environment
- ✅ Clear separation of environment configurations
- ✅ Easy to deploy specific environments
- ✅ No complex targeting logic needed
- ✅ No environment leakage risk

#### Cons
- ❌ Flag definitions duplicated across files (not DRY)
- ❌ Adding a new flag requires updating all environment files
- ❌ Risk of configuration drift between environments
- ❌ More difficult to maintain consistency

---

### Option 3: Hybrid - Template Flags with Environment Overrides

**Concept**: Define flags once in a "template" file, with environment-specific overrides in separate files.

#### Structure

```
flags/
  ├── template.flagd.json          # Base flag definitions
  └── overrides/
      ├── production.json          # Production overrides
      ├── staging.json             # Staging overrides
      └── development.json         # Development overrides
```

```json
// template.flagd.json
{
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off"
    }
  }
}

// overrides/production.json
{
  "new-checkout-flow": {
    "defaultVariant": "on"
  }
}
```

#### UI Changes Required

1. **Template Editor**
   - Edit base flag definitions
   - Mark which properties are overridable per environment

2. **Override Management**
   - Per-environment override toggles
   - Visual diff showing template vs. environment values

3. **Backend Changes**
   - Merging logic to combine template + overrides
   - API to serve merged flag definitions per environment
   - Validation to ensure overrides are valid

#### Pros
- ✅ Flags defined once (mostly DRY)
- ✅ Clear override semantics
- ✅ Easy to see what's different per environment

#### Cons
- ❌ Requires custom merging logic (non-standard flagd feature)
- ❌ More complex backend implementation
- ❌ Not compatible with standard flagd deployment
- ❌ Additional file management complexity

---

### Option 4: Context-Based Targeting (Minimal UI Changes)

**Concept**: Keep simple boolean flags, use targeting rules that check environment context variables.

#### Structure

```json
{
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "targeting": {
        "if": [
          {
            "in": [
              { "var": "environment" },
              ["production", "staging"]
            ]
          },
          "on",
          "off"
        ]
      }
    }
  }
}
```

#### UI Changes Required

1. **Environment Tags in Easy Mode**
   - Add "Enabled for environments" multi-select field
   - Generates simple `in` targeting rule
   - Show which environments flag is enabled for

2. **Minimal Backend Changes**
   - Template helpers for common targeting patterns
   - Validation of environment names

#### Pros
- ✅ Simple implementation
- ✅ Minimal changes to existing UI
- ✅ Standard flagd features
- ✅ No environment leakage

#### Cons
- ❌ Environments not defined in one place
- ❌ Harder to manage environment list consistency
- ❌ Each flag independently lists environments
- ❌ More manual work to add new environments

---

## Recommendation: Option 1 (Environment-Based Variants with $evaluators)

**Option 1** best satisfies all requirements:

1. **Quick switching**: UI provides per-environment toggles in easy mode
2. **DRY**: Environments defined once in `$evaluators`
3. **No leakage**: Uses context variable, not metadata
4. **Standard flagd**: Uses only standard flagd features
5. **Maintainable**: Clear structure, easy to understand

### Implementation Plan for Option 1

#### Phase 1: Backend Support (Rust)

1. **Environment Configuration Structure**
   - Add environment management to flag file content model
   - Helper functions to generate environment-based `$evaluators`
   - API to list/create/update/delete environments

2. **Targeting Rule Generation**
   - Template functions for environment targeting rules
   - Validation that environments referenced in flags exist in `$evaluators`

#### Phase 2: UI Foundation (Angular)

1. **Data Models**
   - Add `Environment` interface
   - Add `EnvironmentState` to `FlagDefinition`
   - Update `FlagFileContent` to parse `$evaluators`

2. **Services**
   - Environment service for CRUD operations
   - Helper to extract environments from `$evaluators`
   - Helper to generate targeting from environment states

#### Phase 3: Environment Management UI

1. **Environment Settings Component**
   - List of environments with add/edit/delete
   - Environment name and aliases
   - Preview of generated `$evaluator`

2. **Integration**
   - Add settings button to project detail view
   - Modal or side panel for environment management

#### Phase 4: Enhanced Flag Editor - Easy Mode

1. **Multi-Environment Toggle**
   - Replace single on/off with per-environment toggles
   - Visual matrix: Flag states across environments
   - Only show when environments are defined

2. **Targeting Generation**
   - Auto-generate targeting rules from environment toggles
   - Preview targeting before saving
   - Validate environment references

#### Phase 5: Advanced Features

1. **Environment-Aware Playground**
   - Select environment in playground
   - Preview flag values per environment

2. **Bulk Operations**
   - Enable/disable flag for all environments
   - Copy flag state between environments
   - Environment-based filtering

#### Phase 6: Documentation & Migration

1. **Documentation**
   - User guide for environment management
   - Migration guide from single environment
   - Best practices

2. **Migration Tool** (optional)
   - Convert existing flags to environment-based
   - Suggest environment names based on targeting

---

## Alternative: Option 2 (Multi-File) as Simpler First Step

If Option 1 is too complex initially, **Option 2** (multi-file strategy) could be implemented first:

### Simplified Implementation Plan for Option 2

#### Phase 1: Backend Support
1. List environment files (already works - files in `flags/` directory)
2. Copy/template API for creating new environment files

#### Phase 2: UI Changes
1. **Environment selector** - dropdown showing all `.flagd.json` files
2. **Multi-environment table** - show flags side-by-side across files
3. **Quick actions** - enable/disable flag across environments

#### Migration Path
Once Option 2 is working, can migrate to Option 1 by:
1. Detecting common patterns across environment files
2. Suggesting environment names
3. Converting to `$evaluators` + targeting format

---

## Security Considerations

All options avoid the metadata leakage issue by:

- **Option 1**: Uses context variables and targeting
- **Option 2**: Separate files, no cross-environment data
- **Option 3**: Merging happens server-side only
- **Option 4**: Uses context variables

The client application controls which environment file to load (Option 2) or which environment context to pass (Options 1, 3, 4), preventing information leakage during evaluation.

---

## Next Steps

1. **Stakeholder Review**: Choose between Option 1 (recommended) or Option 2 (simpler)
2. **Prototype**: Build basic environment management UI
3. **Iterate**: Refine based on feedback
4. **Document**: Update user documentation with environment patterns
5. **Release**: Ship incrementally with feature flags (meta!)

---

## Appendix: Example UI Mockup Concepts

### Environment Management Panel
```
┌─────────────────────────────────────────┐
│ Environments                     [+ Add] │
├─────────────────────────────────────────┤
│ Name          Aliases                   │
│ ────          ───────                   │
│ Production    prod                 [✎] [×]│
│ Staging       stage, stg           [✎] [×]│
│ Development   dev, local           [✎] [×]│
└─────────────────────────────────────────┘
```

### Enhanced Flag Editor - Easy Mode
```
┌─────────────────────────────────────────┐
│ Flag: new-checkout-flow                 │
├─────────────────────────────────────────┤
│ State: ⚫ ENABLED   ⚪ DISABLED          │
├─────────────────────────────────────────┤
│ Environment Activation                  │
│                                         │
│ Production     [●──────] ON             │
│ Staging        [●──────] ON             │
│ Development    [─────○] OFF             │
│                                         │
│ [Preview Targeting]    [Save] [Cancel] │
└─────────────────────────────────────────┘
```

### Multi-Environment Table View (Option 2)
```
┌──────────────────────────────────────────────────────────┐
│ Environment: [Production ▾]                              │
├──────────────┬─────────────┬─────────┬─────────┬────────┤
│ Flag Key     │ Production  │ Staging │ Dev     │ Type   │
├──────────────┼─────────────┼─────────┼─────────┼────────┤
│ new-checkout │ [●─] ON     │ [●─] ON │ [─○] OFF│ bool   │
│ dark-mode    │ [─○] OFF    │ [●─] ON │ [●─] ON │ bool   │
│ api-timeout  │ 5000        │ 3000    │ 1000    │ number │
└──────────────┴─────────────┴─────────┴─────────┴────────┘
```

