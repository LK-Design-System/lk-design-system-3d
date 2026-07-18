import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const expectedStoryIds = [
  "assets--asset-manifest",
  "assets--validation-report",
  "assets--invalid-manifest-cases",
  "fixtures--robot-pose",
  "fixtures--floor-hit-projection",
  "foundations--coordinate-system",
  "foundations--raw-three-scene-host",
  "foundations--transform-round-trip",
  "foundations--shifted-origin",
  "lds-3d-primitives--scene-canvas",
  "lds-3d-primitives--selection",
  "lds-3d-primitives--amr-robot",
  "lds-3d-primitives--goal-marker",
  "lds-3d-primitives--path-ribbon",
  "lds-3d-primitives--point-cloud-layer",
  "lds-3d-primitives--runtime-states",
  "lds-3d-primitives--gltf-model",
  "lds-3d-scenes-point-cloud-foundation--lds-integration",
  "visual-alpha--operational-neutral",
  "visual-alpha--diagnostic-technical",
  "visual-alpha--asset-catalog",
  "visual-alpha--goal-and-path-states",
  "visual-alpha--loading-error-empty",
  "visual-alpha--actual-lds-composition",
].sort();

export const requiredPrimitiveReviewStages = Object.freeze([
  "overview",
  "usage",
  "variants-states",
  "interaction",
  "accessibility-motion",
  "responsive",
  "scenario",
]);

export const requiredPrimitiveAtoms = Object.freeze(
  [
    "SceneCanvas",
    "CameraRig",
    "CoreSpace",
    "SceneEnvironment",
    "GroundPlane",
    "GroundGrid",
    "Selectable",
    "AmrRobot",
    "GoalMarker",
    "PathRibbon",
    "PointCloudLayer",
    "SceneStateMarker",
    "GltfModel",
  ].sort(),
);

const PRIMITIVE_STORY_PREFIX = "lds-3d-primitives--";
const SCENARIO_STORY_PREFIXES = ["visual-alpha--", "lds-3d-scenes-"];
const PRIMITIVE_GUIDE_MARKERS = [
  "## Storybook review evidence contract",
  "primitive-review-contract.json",
  "lds3dReview",
  "pnpm build-storybook",
];
const PRIMITIVE_STORY_SOURCE_MARKERS = [
  "primitive-review-contract.json",
  "function reviewParameters",
  "function PrimitiveReviewEvidence",
  "<SceneCanvasPrimitive",
];

function asRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value;
}

function sameStringSequence(actual, expected) {
  return (
    actual.length === expected.length && actual.every((item, index) => item === expected[index])
  );
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reviewBindingExists(source, storyId) {
  const escapedStoryId = escapeRegularExpression(storyId);
  return new RegExp(`reviewParameters\\s*\\(\\s*["']${escapedStoryId}["']\\s*\\)`).test(source);
}

function isScenarioStoryId(value) {
  return (
    isNonEmptyString(value) && SCENARIO_STORY_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function validatePrimitiveReviewContract({
  actualStoryIds,
  contract,
  guideSource,
  primitiveStorySource,
}) {
  const expectedPrimitiveStoryIds = expectedStoryIds.filter((id) =>
    id.startsWith(PRIMITIVE_STORY_PREFIX),
  );
  const contractRecord = asRecord(contract);
  const stories = asRecord(contractRecord?.stories) ?? {};
  const contractStoryIds = Object.keys(stories).sort();
  const missingContractStoryIds = expectedPrimitiveStoryIds.filter(
    (id) => !contractStoryIds.includes(id),
  );
  const unexpectedContractStoryIds = contractStoryIds.filter(
    (id) => !expectedPrimitiveStoryIds.includes(id),
  );
  const declaredStages = stringArray(contractRecord?.requiredStages) ?? [];
  const invalidRequiredStages = !sameStringSequence(declaredStages, requiredPrimitiveReviewStages);
  const sourceMissingMarkers = PRIMITIVE_STORY_SOURCE_MARKERS.filter(
    (marker) => !primitiveStorySource.includes(marker),
  );
  const guideMissingMarkers = PRIMITIVE_GUIDE_MARKERS.filter(
    (marker) => !guideSource.includes(marker),
  );
  const unboundStoryIds = expectedPrimitiveStoryIds.filter(
    (storyId) => !reviewBindingExists(primitiveStorySource, storyId),
  );
  const malformedStoryIds = [];
  const missingActualWebglStoryIds = [];
  const missingStagesByStory = {};
  const invalidScenarioReferences = [];
  const atomCoverage = new Map();
  const unexpectedAtoms = new Set();

  for (const storyId of expectedPrimitiveStoryIds) {
    const review = asRecord(stories[storyId]);
    if (review === null) {
      malformedStoryIds.push(storyId);
      continue;
    }

    if (review.actualWebgl !== true) missingActualWebglStoryIds.push(storyId);
    const stages = asRecord(review.stages);
    const missingStages = requiredPrimitiveReviewStages.filter(
      (stage) => !isNonEmptyString(stages?.[stage]),
    );
    if (missingStages.length > 0) missingStagesByStory[storyId] = missingStages;

    const scenarioStoryId = review.scenarioStoryId;
    if (!isScenarioStoryId(scenarioStoryId) || !actualStoryIds.includes(scenarioStoryId)) {
      invalidScenarioReferences.push(storyId);
    }

    const atoms = stringArray(review.atoms);
    if (atoms === null || atoms.length === 0) {
      malformedStoryIds.push(storyId);
      continue;
    }
    for (const atom of atoms) {
      if (!requiredPrimitiveAtoms.includes(atom)) {
        unexpectedAtoms.add(atom);
        continue;
      }
      atomCoverage.set(atom, [...(atomCoverage.get(atom) ?? []), storyId]);
    }
  }

  const missingAtoms = requiredPrimitiveAtoms.filter((atom) => !atomCoverage.has(atom));
  const duplicateAtoms = [...atomCoverage.entries()]
    .filter(([, storyIds]) => storyIds.length !== 1)
    .map(([atom]) => atom)
    .sort();
  const violations = [
    ...(invalidRequiredStages
      ? ["required primitive review stages differ from the approved sequence"]
      : []),
    ...missingContractStoryIds.map((storyId) => `missing primitive review contract: ${storyId}`),
    ...unexpectedContractStoryIds.map(
      (storyId) => `unexpected primitive review contract: ${storyId}`,
    ),
    ...malformedStoryIds.map((storyId) => `malformed primitive review contract: ${storyId}`),
    ...missingActualWebglStoryIds.map((storyId) => `missing actual WebGL declaration: ${storyId}`),
    ...Object.entries(missingStagesByStory).map(
      ([storyId, stages]) => `missing review stages for ${storyId}: ${stages.join(", ")}`,
    ),
    ...invalidScenarioReferences.map((storyId) => `invalid scenario reference: ${storyId}`),
    ...missingAtoms.map((atom) => `uncovered public spatial atom: ${atom}`),
    ...duplicateAtoms.map((atom) => `ambiguous primary review story for atom: ${atom}`),
    ...[...unexpectedAtoms].sort().map((atom) => `unexpected contracted atom: ${atom}`),
    ...unboundStoryIds.map((storyId) => `story is not bound to review metadata: ${storyId}`),
    ...sourceMissingMarkers.map((marker) => `primitive story source marker missing: ${marker}`),
    ...guideMissingMarkers.map((marker) => `primitive guide marker missing: ${marker}`),
  ];

  return {
    passed: violations.length === 0,
    expectedPrimitiveStoryIds,
    contractStoryIds,
    declaredStages,
    invalidRequiredStages,
    missingContractStoryIds,
    unexpectedContractStoryIds,
    malformedStoryIds,
    missingActualWebglStoryIds,
    missingStagesByStory,
    invalidScenarioReferences,
    missingAtoms,
    duplicateAtoms,
    unexpectedAtoms: [...unexpectedAtoms].sort(),
    unboundStoryIds,
    sourceMissingMarkers,
    guideMissingMarkers,
    violations,
  };
}

export async function checkStorybookContract(root) {
  const storybookDirectory = path.join(root, "storybook-static");
  try {
    await access(path.join(storybookDirectory, "index.html"));
    const [indexSource, primitiveReviewSource, primitiveStorySource, primitiveGuideSource] =
      await Promise.all([
        readFile(path.join(storybookDirectory, "index.json"), "utf8"),
        readFile(path.join(root, "apps/docs/src/primitive-review-contract.json"), "utf8"),
        readFile(path.join(root, "apps/docs/src/primitives.stories.tsx"), "utf8"),
        readFile(path.join(root, "docs/SPATIAL_PRIMITIVES_GUIDE.md"), "utf8"),
      ]);
    const index = JSON.parse(indexSource);
    const primitiveReviewContract = JSON.parse(primitiveReviewSource);
    const entries = index.entries && typeof index.entries === "object" ? index.entries : {};
    const actualStoryIds = Object.entries(entries)
      .filter(([, entry]) => entry && typeof entry === "object" && entry.type === "story")
      .map(([id]) => id)
      .sort();
    const missingStoryIds = expectedStoryIds.filter((id) => !actualStoryIds.includes(id));
    const unexpectedStoryIds = actualStoryIds.filter((id) => !expectedStoryIds.includes(id));
    const files = await readdir(storybookDirectory, { recursive: true });
    const primitiveReview = validatePrimitiveReviewContract({
      actualStoryIds,
      contract: primitiveReviewContract,
      guideSource: primitiveGuideSource,
      primitiveStorySource,
    });

    return {
      passed:
        missingStoryIds.length === 0 && unexpectedStoryIds.length === 0 && primitiveReview.passed,
      built: true,
      fileCount: files.length,
      indexHtml: true,
      expectedStoryIds,
      actualStoryIds,
      missingStoryIds,
      unexpectedStoryIds,
      primitiveReview,
    };
  } catch (error) {
    return {
      passed: false,
      built: false,
      fileCount: 0,
      indexHtml: false,
      expectedStoryIds,
      actualStoryIds: [],
      missingStoryIds: expectedStoryIds,
      unexpectedStoryIds: [],
      primitiveReview: {
        passed: false,
        violations: [error instanceof Error ? error.message : String(error)],
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
