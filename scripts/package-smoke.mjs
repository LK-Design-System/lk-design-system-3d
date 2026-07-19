import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const artifactDirectory = path.join(root, "artifacts", "package-smoke");
const evidenceDirectory = path.join(root, "evidence", "m2", "consumer-pack-smoke");
const packageSpecs = [
  ["core", "@lk-robotics/design-system-3d-core"],
  ["assets", "@lk-robotics/design-system-3d-assets"],
  ["testing", "@lk-robotics/design-system-3d-testing"],
  ["pointcloud", "@lk-robotics/design-system-3d-pointcloud"],
  ["tf", "@lk-robotics/design-system-3d-tf"],
  ["markers", "@lk-robotics/design-system-3d-markers"],
  ["three", "@lk-robotics/design-system-3d-three"],
  ["r3f", "@lk-robotics/design-system-3d-r3f"],
].map(([directoryName, packageName]) => ({
  directoryName,
  packageName,
  directory: path.join(root, "packages", directoryName),
}));
const steps = [];
const pnpmCli = process.env.npm_execpath;

if (pnpmCli === undefined) {
  throw new Error("Run this smoke through the `pnpm package-smoke` workspace script.");
}

function run(command, args, cwd, id) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, CI: "1" },
  });
  steps.push({
    id,
    command: [command, ...args].join(" "),
    passed: result.status === 0,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) throw new Error(`${id} failed with exit code ${result.status}`);
}

function runPnpm(args, cwd, id) {
  run(process.execPath, [pnpmCli, ...args], cwd, id);
}

await rm(artifactDirectory, { recursive: true, force: true });
await Promise.all([
  mkdir(artifactDirectory, { recursive: true }),
  mkdir(evidenceDirectory, { recursive: true }),
]);

let consumerDirectory;
let failure;
try {
  runPnpm(["build"], root, "build-packages");
  runPnpm(["publint"], root, "publint");
  runPnpm(["attw"], root, "package-type-resolution");

  for (const { directory: packageDirectory, directoryName } of packageSpecs) {
    runPnpm(
      ["pack", "--pack-destination", artifactDirectory],
      packageDirectory,
      `pack-${directoryName}`,
    );
  }

  const tarballs = (await readdir(artifactDirectory))
    .filter((name) => name.endsWith(".tgz"))
    .sort();
  if (tarballs.length !== packageSpecs.length) {
    throw new Error(`Expected ${packageSpecs.length} tarballs, found ${tarballs.length}.`);
  }

  const tarballByPackage = Object.fromEntries(
    packageSpecs.map(({ directoryName, packageName }) => {
      const matches = tarballs.filter((name) => name.includes(`-${directoryName}-`));
      if (matches.length !== 1) {
        throw new Error(
          `Expected one ${packageName} tarball containing -${directoryName}-, found ${matches.length}.`,
        );
      }
      const tarball = matches[0];
      if (tarball === undefined) throw new Error(`Missing tarball for ${packageName}.`);
      return [packageName, `file:${path.join(artifactDirectory, tarball).replaceAll("\\", "/")}`];
    }),
  );

  const r3fManifest = JSON.parse(
    await readFile(path.join(root, "packages", "r3f", "package.json"), "utf8"),
  );
  const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const r3fDevelopmentDependencies = r3fManifest.devDependencies ?? {};
  const rootDevelopmentDependencies = rootManifest.devDependencies ?? {};
  const rendererPeerDependencies = {
    "@react-three/fiber": r3fDevelopmentDependencies["@react-three/fiber"],
    react: r3fDevelopmentDependencies.react,
    "react-dom": r3fDevelopmentDependencies.react,
    three: r3fDevelopmentDependencies.three,
  };
  for (const [name, version] of Object.entries(rendererPeerDependencies)) {
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(`Cannot resolve an exact consumer smoke version for ${name}.`);
    }
  }
  const consumerDevelopmentDependencies = {
    "@types/react": r3fDevelopmentDependencies["@types/react"],
    "@types/react-dom": rootDevelopmentDependencies["@types/react-dom"],
    "@types/three": r3fDevelopmentDependencies["@types/three"],
    typescript: rootDevelopmentDependencies.typescript,
  };
  for (const [name, version] of Object.entries(consumerDevelopmentDependencies)) {
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(`Cannot resolve an exact consumer smoke version for ${name}.`);
    }
  }

  consumerDirectory = await mkdtemp(path.join(os.tmpdir(), "lkds3d-visual-alpha-consumer-"));
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "lkds3d-visual-alpha-package-smoke",
        private: true,
        type: "module",
        dependencies: { ...tarballByPackage, ...rendererPeerDependencies },
        devDependencies: consumerDevelopmentDependencies,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(consumerDirectory, "pnpm-workspace.yaml"),
    `packages:\n  - .\noverrides:\n${Object.entries(tarballByPackage)
      .map(([name, target]) => `  '${name}': '${target}'`)
      .join("\n")}\n`,
  );
  await writeFile(
    path.join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          verbatimModuleSyntax: true,
          skipLibCheck: false,
        },
        include: ["smoke.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(consumerDirectory, "smoke.ts"),
    `import { clockId, entityId, frameId, identityTransform, layerId, pose3, rigidTransform3, timestamp } from "@lk-robotics/design-system-3d-core";
import { createAssetReport } from "@lk-robotics/design-system-3d-assets";
import { Y_UP_GLB_MANIFEST_FIXTURE, checkTransformRoundTrip } from "@lk-robotics/design-system-3d-testing";
import { createPointCloudSnapshot } from "@lk-robotics/design-system-3d-pointcloud";
import { createFrameGraph, lookupFrameTransform } from "@lk-robotics/design-system-3d-tf";
import { createMarkerLayerSnapshot, resolveMarkerLayerRenderState } from "@lk-robotics/design-system-3d-markers";
import { createGltfAssetLoader, type ThreeSceneHostOptions } from "@lk-robotics/design-system-3d-three";
import { coreToThreePosition as coreToImperativeThreePosition } from "@lk-robotics/design-system-3d-three/coordinates";
import { cloneThreeSceneInstance } from "@lk-robotics/design-system-3d-three/r3f-bridge";
import type { ThreeResolvedAsset } from "@lk-robotics/design-system-3d-three/r3f-bridge";
import type { SceneCanvasProps } from "@lk-robotics/design-system-3d-r3f";
import { coreToThreePosition } from "@lk-robotics/design-system-3d-r3f/coordinates";
import { OPERATIONAL_NEUTRAL_THEME } from "@lk-robotics/design-system-3d-r3f/themes";

const transform = identityTransform(frameId("consumer-map"));
const validation = createAssetReport(Y_UP_GLB_MANIFEST_FIXTURE);
const violations = checkTransformRoundTrip(transform);
const renderPosition = coreToThreePosition([1, 2, 3]);
const imperativePosition = coreToImperativeThreePosition([1, 2, 3]);
const rawThreeContract: Pick<ThreeSceneHostOptions, "renderMode"> = { renderMode: "demand" };
const rawThreeLoader = createGltfAssetLoader();
const rawThreeBridge: typeof cloneThreeSceneInstance = cloneThreeSceneInstance;
const rawThreeResolvedAsset: ThreeResolvedAsset | undefined = undefined;
const pointCloud = createPointCloudSnapshot({ frame: frameId("consumer-map"), positions: new Float32Array([0, 0, 0]), revision: 1 });
const markerTime = timestamp(clockId("consumer-time"), 1, 0);
const sensorFrame = frameId("consumer-sensor");
const markerGraph = createFrameGraph([{ transform: rigidTransform3(sensorFrame, transform.targetFrame, [0, 0, 1], [0, 0, 0, 1]), timestamp: markerTime }]);
const markerTransform = lookupFrameTransform(markerGraph, sensorFrame, transform.targetFrame, markerTime, { staleAfterSeconds: 0 });
if (markerTransform.kind !== "ready") throw new Error("TF smoke lookup failed");
const markerLayer = createMarkerLayerSnapshot({ id: layerId("consumer-markers"), frame: sensorFrame, timestamp: markerTime, sourceToScene: markerTransform.transform, markers: [{ kind: "arrow", id: entityId("consumer-heading"), pose: pose3(sensorFrame, [0, 0, 0], [0, 0, 0, 1]), scale: [1, 0.1, 0.2] }] });
const markerState = resolveMarkerLayerRenderState(markerLayer, transform.targetFrame, 10);
const canvasContract: Pick<SceneCanvasProps, "frame" | "profile" | "cameraMode"> = { frame: frameId("consumer-map"), profile: "operational-neutral", cameraMode: "home" };
if (transform.sourceFrame !== transform.targetFrame || !validation.valid || violations.length !== 0 || renderPosition.join(",") !== "-2,3,-1" || imperativePosition.join(",") !== "-2,3,-1" || rawThreeContract.renderMode !== "demand" || typeof rawThreeLoader.load !== "function" || typeof rawThreeBridge !== "function" || rawThreeResolvedAsset !== undefined || OPERATIONAL_NEUTRAL_THEME.id !== "operational-neutral" || pointCloud.pointCount !== 1 || markerState.kind !== "ready" || canvasContract.cameraMode !== "home") {
  throw new Error("Visual Alpha public contract smoke failed");
}
console.log(JSON.stringify({ validation: validation.valid, roundTrip: violations.length === 0, rawThree: true, renderer: true }));
`,
  );
  await writeFile(
    path.join(consumerDirectory, "runtime.mjs"),
    `import { clockId, entityId, frameId, identityTransform, layerId, pose3, rigidTransform3, timestamp } from "@lk-robotics/design-system-3d-core";
import { createAssetReport } from "@lk-robotics/design-system-3d-assets";
import { Y_UP_GLB_MANIFEST_FIXTURE, checkTransformRoundTrip } from "@lk-robotics/design-system-3d-testing";
import { createPointCloudSnapshot } from "@lk-robotics/design-system-3d-pointcloud";
import { createFrameGraph, lookupFrameTransform } from "@lk-robotics/design-system-3d-tf";
import { createMarkerLayerSnapshot, resolveMarkerLayerRenderState } from "@lk-robotics/design-system-3d-markers";
import { createGltfAssetLoader } from "@lk-robotics/design-system-3d-three";
import { coreToThreePosition as coreToImperativeThreePosition } from "@lk-robotics/design-system-3d-three/coordinates";
import { cloneThreeSceneInstance } from "@lk-robotics/design-system-3d-three/r3f-bridge";
import { coreToThreePosition } from "@lk-robotics/design-system-3d-r3f/coordinates";
import { OPERATIONAL_NEUTRAL_THEME } from "@lk-robotics/design-system-3d-r3f/themes";
const transform = identityTransform(frameId("runtime-map"));
const pointCloud = createPointCloudSnapshot({ frame: frameId("runtime-map"), positions: new Float32Array([0, 0, 0]), revision: 1 });
const markerTime = timestamp(clockId("runtime-time"), 1, 0);
const sensorFrame = frameId("runtime-sensor");
const markerGraph = createFrameGraph([{ transform: rigidTransform3(sensorFrame, transform.targetFrame, [0, 0, 1], [0, 0, 0, 1]), timestamp: markerTime }]);
const markerTransform = lookupFrameTransform(markerGraph, sensorFrame, transform.targetFrame, markerTime, { staleAfterSeconds: 0 });
if (markerTransform.kind !== "ready") throw new Error("TF runtime smoke lookup failed");
const markerLayer = createMarkerLayerSnapshot({ id: layerId("runtime-markers"), frame: sensorFrame, timestamp: markerTime, sourceToScene: markerTransform.transform, markers: [{ kind: "pose", id: entityId("runtime-pose"), pose: pose3(sensorFrame, [0, 0, 0], [0, 0, 0, 1]), axisLength: 0.5 }] });
const markerState = resolveMarkerLayerRenderState(markerLayer, transform.targetFrame, 10);
const result = { esm: transform.sourceFrame === transform.targetFrame, asset: createAssetReport(Y_UP_GLB_MANIFEST_FIXTURE).valid, roundTrip: checkTransformRoundTrip(transform).length === 0, pointCloud: pointCloud.pointCount === 1, tf: markerTransform.kind === "ready", markers: markerState.kind === "ready", rawThree: coreToImperativeThreePosition([1, 2, 3]).join(",") === "-2,3,-1" && typeof createGltfAssetLoader().load === "function" && typeof cloneThreeSceneInstance === "function", renderer: coreToThreePosition([1, 2, 3]).join(",") === "-2,3,-1", theme: OPERATIONAL_NEUTRAL_THEME.id === "operational-neutral" };
if (!Object.values(result).every(Boolean)) throw new Error(JSON.stringify(result));
console.log(JSON.stringify(result));
`,
  );

  runPnpm(
    ["install", "--offline", "--frozen-lockfile=false"],
    consumerDirectory,
    "consumer-install",
  );
  runPnpm(["exec", "tsc", "--noEmit"], consumerDirectory, "consumer-typecheck");
  run(process.execPath, ["runtime.mjs"], consumerDirectory, "consumer-esm-runtime");
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    passed: failure === undefined,
    milestone: "visual-alpha-v0",
    registryPublished: false,
    packageSourceImports: false,
    packages: packageSpecs.map(({ packageName }) => packageName),
    artifactDirectory: path.relative(root, artifactDirectory),
    consumerDirectory,
    failure,
    steps,
  };
  await writeFile(
    path.join(evidenceDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

if (failure !== undefined) {
  console.error(failure);
  process.exit(1);
}

console.log("Tarball install, TypeScript consumer and ESM runtime smoke passed.");
