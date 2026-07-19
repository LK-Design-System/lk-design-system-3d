import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { STORY_ID_REDIRECTS } from "../apps/docs/.storybook/public/story-id-redirects.mjs";

export const expectedStoryIds = [
  "assets--asset-manifest",
  "lds-3d-assets-validation--overview",
  "lds-3d-assets-validation--invalid-manifest",
  "fixtures--robot-pose",
  "fixtures--floor-hit-projection",
  "foundations--coordinate-system",
  "lds-3d-foundations-three-scene-host--overview",
  "foundations--transform-round-trip",
  "foundations--shifted-origin",
  "lds-3d-primitives--scene-canvas",
  "lds-3d-primitives-selectable--overview",
  "lds-3d-primitives-amr-robot--overview",
  "lds-3d-primitives-goal-marker--overview",
  "lds-3d-primitives-path-ribbon--overview",
  "lds-3d-primitives-marker-layer--overview",
  "lds-3d-primitives-point-cloud-layer--overview",
  "lds-3d-primitives-occupancy-grid-surface--overview",
  "lds-3d-primitives-spatial-editing--overview",
  "lds-3d-primitives-spatial-authoring--overview",
  "lds-3d-primitives-scene-state-marker--overview",
  "lds-3d-primitives-gltf-model--overview",
  "lds-3d-scenes-point-cloud-foundation--lds-integration",
  "lds-3d-scenes-occupancy-grid--overview",
  "lds-3d-scenes-tf-marker--overview",
  "lds-3d-scenes-spatial-editing--overview",
  "lds-3d-scenes-spatial-authoring-foundation--lds-integration",
  "visual-alpha--operational-neutral",
  "visual-alpha--diagnostic-technical",
  "lds-3d-scenes-asset-review--overview",
  "lds-3d-states-goal-and-path--overview",
  "lds-3d-states-renderer-lifecycle--overview",
  "lds-3d-lds-integration-operations-viewer--overview",
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
    "MarkerLayer",
    "PointCloudLayer",
    "PointCloudLayers",
    "OccupancyGridSurface",
    "SectionBox",
    "EditVolume",
    "SpatialStructure",
    "TransformGizmo",
    "SceneStateMarker",
    "GltfModel",
  ].sort(),
);

const PRIMITIVE_STORY_PREFIX = "lds-3d-primitives";
const SCENARIO_STORY_PREFIXES = [
  "visual-alpha--",
  "lds-3d-scenes-",
  "lds-3d-states-",
  "lds-3d-lds-integration-",
];
const STORYBOOK_GROUPS = Object.freeze([
  "Foundations",
  "Assets",
  "Primitives",
  "States",
  "Scenes",
  "LDS Integration",
]);
const STORY_ROLE_PATTERN =
  /^(개요|참조 · .+|사용법 · .+|변형·상태 · .+|상호작용 · .+|반응형 · .+|시나리오 · .+)$/;
const BANNED_PUBLIC_PAGE_LABELS =
  /\b(Visual Alpha|Foundation 0|Actual|Raw|Direction [AB]|MapConvert3D)\b/i;
const PRIMITIVE_GUIDE_MARKERS = [
  "## Storybook review evidence contract",
  "primitive-review-contract.json",
  "lds3dReview",
  "pnpm build-storybook",
];
const PRIMITIVE_STORY_SOURCE_MARKERS = [
  "primitive-review-contract.json",
  "function primitiveReviewParameters",
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
  return new RegExp(`primitiveReviewParameters\\s*\\(\\s*["']${escapedStoryId}["']\\s*\\)`).test(
    source,
  );
}

function isScenarioStoryId(value) {
  return (
    isNonEmptyString(value) && SCENARIO_STORY_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function validateStorybookInformationArchitecture({ actualStoryIds, entries, builtFiles }) {
  const storyEntries = Object.entries(entries).filter(
    ([, entry]) => entry && typeof entry === "object" && entry.type === "story",
  );
  const invalidGroups = [];
  const invalidPageTitles = [];
  const invalidStoryRoles = [];
  const titlesWithOverview = new Set();
  const publicTitles = new Set();

  for (const [storyId, entry] of storyEntries) {
    const title = isNonEmptyString(entry.title) ? entry.title : "";
    const name = isNonEmptyString(entry.name) ? entry.name : "";
    const [, group] = title.split("/");
    publicTitles.add(title);
    if (!title.startsWith("LDS 3D/") || !STORYBOOK_GROUPS.includes(group)) {
      invalidGroups.push(storyId);
    }
    if (BANNED_PUBLIC_PAGE_LABELS.test(title)) invalidPageTitles.push(storyId);
    if (!STORY_ROLE_PATTERN.test(name)) invalidStoryRoles.push(storyId);
    if (name === "개요") titlesWithOverview.add(title);
  }

  const pagesMissingOverview = [...publicTitles].filter((title) => !titlesWithOverview.has(title));
  const legacyStoryIds = Object.keys(STORY_ID_REDIRECTS).sort();
  const redirectTargets = Object.values(STORY_ID_REDIRECTS).sort();
  const missingRedirectTargets = redirectTargets.filter((id) => !actualStoryIds.includes(id));
  const activeLegacyStoryIds = legacyStoryIds.filter((id) => actualStoryIds.includes(id));
  const redirectAssetBuilt = builtFiles.includes("story-id-redirects.mjs");
  const violations = [
    ...invalidGroups.map((id) => `story is outside the approved LDS 3D groups: ${id}`),
    ...invalidPageTitles.map((id) => `public page title contains a process label: ${id}`),
    ...invalidStoryRoles.map((id) => `story name does not use an approved role label: ${id}`),
    ...pagesMissingOverview.map((title) => `public page has no 개요 story: ${title}`),
    ...missingRedirectTargets.map((id) => `legacy redirect target is missing: ${id}`),
    ...activeLegacyStoryIds.map((id) => `legacy story ID is still canonical: ${id}`),
    ...(redirectAssetBuilt ? [] : ["legacy story redirect asset was not built"]),
  ];

  return {
    passed: violations.length === 0,
    groups: STORYBOOK_GROUPS,
    pageCount: publicTitles.size,
    storyCount: storyEntries.length,
    legacyStoryIds,
    redirectTargets,
    invalidGroups,
    invalidPageTitles,
    invalidStoryRoles,
    pagesMissingOverview,
    missingRedirectTargets,
    activeLegacyStoryIds,
    redirectAssetBuilt,
    violations,
  };
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
    const storySourceDirectory = path.join(root, "apps/docs/src");
    const storySourceFiles = (await readdir(storySourceDirectory, { recursive: true })).filter(
      (file) => file.endsWith(".stories.tsx"),
    );
    const [indexSource, primitiveReviewSource, primitiveGuideSource, ...storySources] =
      await Promise.all([
        readFile(path.join(storybookDirectory, "index.json"), "utf8"),
        readFile(path.join(root, "apps/docs/src/primitive-review-contract.json"), "utf8"),
        readFile(path.join(root, "docs/SPATIAL_PRIMITIVES_GUIDE.md"), "utf8"),
        ...storySourceFiles.map((file) => readFile(path.join(storySourceDirectory, file), "utf8")),
      ]);
    const primitiveStorySource = storySources.join("\n");
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
    const informationArchitecture = validateStorybookInformationArchitecture({
      actualStoryIds,
      entries,
      builtFiles: files,
    });

    return {
      passed:
        missingStoryIds.length === 0 &&
        unexpectedStoryIds.length === 0 &&
        primitiveReview.passed &&
        informationArchitecture.passed,
      built: true,
      fileCount: files.length,
      indexHtml: true,
      expectedStoryIds,
      actualStoryIds,
      missingStoryIds,
      unexpectedStoryIds,
      primitiveReview,
      informationArchitecture,
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
      informationArchitecture: {
        passed: false,
        violations: [error instanceof Error ? error.message : String(error)],
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
