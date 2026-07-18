# `@lk-robotics/design-system-3d-testing`

Runner-neutral fixtures and contract checks for LK Design System 3D Foundation.

The public API contains plain fixture data and functions that return serializable
violations or reports. It does not import Vitest, Playwright, a renderer, or product
code. Consumers can therefore run the same coordinate, picking, asset-manifest, and
provenance checks from their own test runner.

```ts
import {
  assertNoContractViolations,
  checkCoordinateContract,
  coordinateFixtures,
} from "@lk-robotics/design-system-3d-testing";

const violations = checkCoordinateContract(adapter, Object.values(coordinateFixtures));
assertNoContractViolations(violations);
```

Foundation Alpha.1 performs no raycasting. The authoritative floor-hit fixture starts
with an existing renderer hit and verifies only `render -> core -> product-map` frame
projection.
