# Quick Start Guide: Environment-Based Feature Flags (Option 1)

This guide shows how to use the recommended multi-environment approach with `$evaluators`.

## Overview

This approach allows you to:
- Define environments once in the `$evaluators` section
- Toggle features per environment via targeting rules
- Maintain a single flag definition file
- Scale to many environments easily

## Step 1: Define Environments

Add an `$evaluators` section to your flag file to define all environments:

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
  "flags": {}
}
```

**Explanation:**
- Each evaluator checks if the `environment` context variable matches any of the environment names
- You can use aliases (e.g., "prod" or "production") for flexibility
- These evaluators can be referenced by any flag

## Step 2: Create Environment-Aware Flags

For each feature flag, create variants for each environment:

```json
{
  "$evaluators": { /* ... from step 1 ... */ },
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": {
        "production": true,
        "staging": true,
        "development": false,
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

**Explanation:**
- **variants**: Define a variant for each environment (plus an "off" variant as fallback)
- **targeting**: Nested if-else chain that checks each environment
- **defaultVariant**: Fallback when no environment matches
- Each environment evaluator is referenced with `{ "$ref": "evaluatorName" }`

## Step 3: Pass Environment Context During Evaluation

When evaluating flags in your application, pass the environment as context:

### JavaScript/TypeScript Example

```typescript
import { OpenFeature } from '@openfeature/web-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';

// Configure the provider
await OpenFeature.setProvider(new FlagdWebProvider({
  host: 'http://localhost:8013',
  pathPrefix: '/api/flagd',
}));

const client = OpenFeature.getClient();

// Evaluate flag with environment context
const isEnabled = await client.getBooleanValue(
  'new-checkout-flow',
  false,
  {
    environment: 'production', // 👈 Pass environment here
  }
);

console.log('New checkout flow enabled:', isEnabled); // true in production
```

### Python Example

```python
from openfeature import api
from openfeature.providers.flagd import FlagdProvider

# Configure the provider
api.set_provider(FlagdProvider())
client = api.get_client()

# Evaluate flag with environment context
is_enabled = client.get_boolean_value(
    flag_key='new-checkout-flow',
    default_value=False,
    evaluation_context={
        'environment': 'staging',  # 👈 Pass environment here
    }
)

print(f'New checkout flow enabled: {is_enabled}')  # True in staging
```

## Step 4: Managing Environment States

### Enabling a Flag in Production

Update the variant and ensure targeting includes the environment:

```json
{
  "new-checkout-flow": {
    "variants": {
      "production": true,  // ✅ Set to true
      "staging": true,
      "development": false
    },
    "targeting": { /* ... includes isProduction check ... */ }
  }
}
```

### Disabling a Flag in Development

```json
{
  "new-checkout-flow": {
    "variants": {
      "production": true,
      "staging": true,
      "development": false  // ✅ Set to false
    }
  }
}
```

### Adding a New Environment

1. Add the evaluator:
```json
{
  "$evaluators": {
    "isQA": {
      "in": [{ "var": "environment" }, ["qa", "test"]]
    }
  }
}
```

2. Add the variant and update targeting for each flag:
```json
{
  "new-checkout-flow": {
    "variants": {
      "production": true,
      "staging": true,
      "qa": true,           // ✅ New variant
      "development": false
    },
    "targeting": {
      "if": [
        { "$ref": "isProduction" }, "production",
        {
          "if": [
            { "$ref": "isStaging" }, "staging",
            {
              "if": [
                { "$ref": "isQA" }, "qa",  // ✅ New check
                {
                  "if": [
                    { "$ref": "isDevelopment" }, "development",
                    "off"
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

## Common Patterns

### Pattern 1: Enable Everywhere Except Production

```json
{
  "experimental-feature": {
    "variants": {
      "production": false,
      "staging": true,
      "development": true,
      "off": false
    },
    "targeting": {
      "if": [
        { "$ref": "isProduction" }, "production",
        {
          "if": [
            { "or": [
              { "$ref": "isStaging" },
              { "$ref": "isDevelopment" }
            ]},
            "staging",  // or development - both return true
            "off"
          ]
        }
      ]
    }
  }
}
```

### Pattern 2: Gradual Rollout (Prod → Staging → Dev)

```json
{
  "rollout-feature": {
    "variants": {
      "production": true,   // ✅ Enabled
      "staging": false,     // ⏳ Not yet
      "development": false  // ⏳ Not yet
    }
  }
}
```

Then enable in staging:
```json
{
  "rollout-feature": {
    "variants": {
      "production": true,
      "staging": true,      // ✅ Now enabled
      "development": false
    }
  }
}
```

### Pattern 3: Different Values Per Environment

For non-boolean flags (e.g., API timeouts):

```json
{
  "api-timeout-ms": {
    "state": "ENABLED",
    "variants": {
      "production": 5000,
      "staging": 3000,
      "development": 1000,
      "default": 5000
    },
    "defaultVariant": "default",
    "targeting": {
      "if": [
        { "$ref": "isProduction" }, "production",
        {
          "if": [
            { "$ref": "isStaging" }, "staging",
            {
              "if": [
                { "$ref": "isDevelopment" }, "development",
                "default"
              ]
            }
          ]
        }
      ]
    }
  }
}
```

Usage:
```typescript
const timeout = await client.getNumberValue(
  'api-timeout-ms',
  5000,
  { environment: 'development' }
);
console.log(timeout); // 1000 in development
```

## Best Practices

### 1. Consistent Environment Names
- Use lowercase names: `production`, `staging`, `development`
- Define aliases for common variations: `prod`, `stage`, `dev`
- Document your environment naming convention

### 2. Always Include Fallback
```json
{
  "variants": {
    /* ... environment variants ... */,
    "off": false  // ✅ Always include fallback
  },
  "defaultVariant": "off"
}
```

### 3. Order Evaluators by Priority
Place most-used environments first in targeting for better performance:
```json
{
  "targeting": {
    "if": [
      { "$ref": "isProduction" }, "production",    // Most traffic
      {
        "if": [
          { "$ref": "isStaging" }, "staging",      // Less traffic
          /* ... */
        ]
      }
    ]
  }
}
```

### 4. Validate Environment Context
In your application, ensure the environment is always set:

```typescript
const environment = process.env.NODE_ENV || 'development';

const value = await client.getBooleanValue(
  'my-flag',
  false,
  { environment }  // Always provide environment
);
```

## Troubleshooting

### Flag Always Returns Default Value

**Problem**: Flag evaluation returns the default value regardless of environment.

**Solution**: Ensure you're passing the `environment` in the evaluation context:
```typescript
// ❌ Wrong - missing environment
const value = await client.getBooleanValue('my-flag', false);

// ✅ Correct - includes environment
const value = await client.getBooleanValue('my-flag', false, { environment: 'production' });
```

### Environment Not Matching

**Problem**: Environment evaluator not matching despite passing correct value.

**Solution**: Check the evaluator aliases:
```json
{
  "$evaluators": {
    "isProduction": {
      "in": [
        { "var": "environment" },
        ["prod", "production"]  // ✅ Add all possible names
      ]
    }
  }
}
```

### Targeting Not Working

**Problem**: Targeting rule not returning expected variant.

**Solution**: Verify targeting structure and variant names match:
```json
{
  "variants": {
    "production": true,  // Variant name
    /* ... */
  },
  "targeting": {
    "if": [
      { "$ref": "isProduction" },
      "production",  // ✅ Must match variant name exactly
      /* ... */
    ]
  }
}
```

## Next Steps

- **Manual Setup**: Use this guide to manually configure environment-based flags
- **UI Support**: The flagd-ui will provide a UI for managing environments (see implementation plan)
- **Testing**: Use the flagd playground to test flag evaluation with different environments
- **Migration**: Convert existing flags to use this pattern

## Related Documentation

- [Multi-Environment Implementation Plan](./multi-environment-implementation-plan.md) - Full implementation plan
- [Options Summary](./multi-environment-options-summary.md) - Comparison of all approaches
- [flagd Documentation](https://flagd.dev/) - Official flagd documentation
- [OpenFeature Documentation](https://openfeature.dev/) - OpenFeature specification

