# Feature Flag Examples

This directory contains example flag definition files demonstrating different patterns and use cases.

## Files

### `demo.flagd.json`
Basic demonstration of flagd features including:
- Simple boolean and string flags
- Time-based targeting
- Metadata usage

### `multi-environment-example.flagd.json` ⭐ NEW
Demonstrates the recommended approach for managing flags across multiple environments:
- **Environment definitions** using `$evaluators`
- **Per-environment flag states** using variants and targeting
- **Different value types** (boolean, number, string)
- Examples of:
  - Feature enabled in production and staging only
  - Feature enabled everywhere except production
  - Different timeout values per environment
  - Different UI colors per environment

## Using the Multi-Environment Example

### 1. View in flagd-ui
```bash
docker compose up --build
```
Then open http://localhost:3000 and navigate to the "multi-environment-example" project.

### 2. Evaluate Flags with Environment Context

#### Using curl with flagd:
```bash
# Production environment
curl -X POST http://localhost:8013/flagd.evaluation.v1.Service/ResolveBoolean \
  -H "Content-Type: application/json" \
  -d '{
    "flagKey": "new-checkout-flow",
    "context": {
      "environment": "production"
    }
  }'

# Development environment
curl -X POST http://localhost:8013/flagd.evaluation.v1.Service/ResolveBoolean \
  -H "Content-Type: application/json" \
  -d '{
    "flagKey": "new-checkout-flow",
    "context": {
      "environment": "development"
    }
  }'
```

#### Using OpenFeature SDK:
```typescript
import { OpenFeature } from '@openfeature/web-sdk';

const client = OpenFeature.getClient();

// Production
const prodValue = await client.getBooleanValue(
  'new-checkout-flow',
  false,
  { environment: 'production' }
);

// Development
const devValue = await client.getBooleanValue(
  'new-checkout-flow',
  false,
  { environment: 'development' }
);
```

## Environment Definitions

The multi-environment example defines these environments in `$evaluators`:

- **Production**: Matches `environment: "prod"` or `environment: "production"`
- **Staging**: Matches `environment: "staging"` or `environment: "stage"`
- **Development**: Matches `environment: "dev"`, `environment: "development"`, or `environment: "local"`

## Flag Examples

### `new-checkout-flow`
- **Type**: Boolean
- **Production**: ✅ Enabled (true)
- **Staging**: ✅ Enabled (true)
- **Development**: ❌ Disabled (false)

Use case: New feature being rolled out to production and staging for testing.

### `experimental-ai-features`
- **Type**: Boolean
- **Production**: ❌ Disabled (false)
- **Staging**: ✅ Enabled (true)
- **Development**: ✅ Enabled (true)

Use case: Experimental feature being tested in non-production environments.

### `api-timeout-ms`
- **Type**: Number
- **Production**: 5000ms
- **Staging**: 3000ms
- **Development**: 1000ms

Use case: Different timeout values per environment for testing and debugging.

### `background-color`
- **Type**: String (color hex)
- **Production**: Red (#FF0000)
- **Staging**: Yellow (#FFFF00)
- **Development**: Green (#00FF00)

Use case: Visual indicator of which environment you're in.

## Creating Your Own Multi-Environment Flags

Follow the pattern in `multi-environment-example.flagd.json`:

1. **Define your environments** in `$evaluators`
2. **Create variants** for each environment in your flag
3. **Add targeting** that references the evaluators
4. **Set a default variant** as fallback

See [docs/multi-environment-quick-start.md](../docs/multi-environment-quick-start.md) for detailed instructions.

## References

- [Multi-Environment Options Summary](../docs/multi-environment-options-summary.md)
- [Multi-Environment Quick Start](../docs/multi-environment-quick-start.md)
- [Multi-Environment Implementation Plan](../docs/multi-environment-implementation-plan.md)
- [flagd Documentation](https://flagd.dev/)
- [OpenFeature Documentation](https://openfeature.dev/)
