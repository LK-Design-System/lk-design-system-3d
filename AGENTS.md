# Repository Working Rules

## Repository Mission And Authority

- This repository is the official 3D sibling of LK Design System (LDS). It is a
  spatial/rendering extension of LDS, not a second UI design system and not a
  product application.
- LDS is the canonical owner of brand assets, DOM UI tokens, buttons, headers,
  toolbars, panels, drawers, dialogs, status presentation, focus behavior, and
  other application chrome.
- LDS3D owns coordinate and frame contracts, camera and picking semantics,
  renderer adapters, spatial primitives, 3D asset contracts, and renderer
  lifecycle behavior.
- Product repositories own transport, commands, permissions, workflow state,
  routes, storage, and final product composition.
- Existing code is not authority by itself. A current implementation, passing
  test, screenshot, or previous agent decision does not justify a visual or
  architectural difference from LDS.

## Concurrent Work And Startup

- Assume other contributors may be editing the same worktree. Before editing,
  inspect the current branch and worktree status, then re-read every target
  file immediately before patching it.
- Treat unexpected changes as another contributor's work. Do not reset,
  overwrite, mass-format, regenerate, or remove them merely because they were
  not present at task start.
- When delegating work, assign narrow, non-overlapping file ownership. If
  concurrent changes overlap and cannot be merged confidently, stop and report
  the conflict instead of silently selecting one version.
- Identify the repository's current default branch before branch work. Do not
  create, switch, delete, merge, or publish a branch unless the user requests it
  or the task explicitly requires it.
- Before handoff, inspect the final diff/status and re-read the changed files.
  Do not make completion claims from a stale snapshot.

## LDS Baseline Audit (MANDATORY For UI Work)

Before changing any DOM UI, Storybook composition, visual token mapping, or
reusable interaction pattern:

1. Locate the sibling LDS checkout and record its Git commit, package name,
   package version, and worktree status.
2. Inspect the closest LDS public components, their type declarations, prompt
   files, Storybook stories, and relevant token definitions.
3. Inspect the LDS Storybook version, addons, preview decorators, information
   architecture, manager branding, backgrounds, and story ordering rules.
4. Write a page-anatomy map, component mapping, and visual-delta inventory before
   coding. Compare landmark and reading order, region ownership, viewport
   dominance, width allocation, density, nesting, responsive transitions,
   control size, spacing, typography, radius, border, fill, elevation,
   iconography, hover, focus, pressed, disabled, loading, and error behavior.
5. Classify every surface as one of:
   - LDS-owned DOM UI;
   - LDS3D-owned spatial/rendering behavior;
   - product-owned workflow composition;
   - a documented exception requiring review.

Missing LDS source evidence means `unverified`, never "close enough" or
"supported by composition."

## LDS Public API And Dependency Boundary (MANDATORY)

- Consume LDS only through its package's public exports and official CSS entry.
  Do not import sibling `src/`, `components/`, `.storybook/`, stories, or other
  internal files through relative filesystem paths.
- A documented public component subpath is allowed. An internal source alias is
  not.
- Import the official LDS stylesheet before LDS3D composition styles. LDS3D
  styles may position components and style scene-specific overlays; they must
  not recreate or override an LDS component's visual language.
- Do not copy LDS token values or component CSS into LDS3D. Resolve LDS semantic
  tokens in the docs/product composition layer and pass renderer-specific values
  across an explicit theme contract.
- `core`, `assets`, `testing`, `three`, `r3f`, and other renderer packages must
  not depend on any LDS DOM UI package: `@lk-robotics/lds-core`, `lds-theme`,
  `lds-product`, `lds-robotics-ui`, or the legacy
  `@lk-robotics/design-system-core` facade.
- Only a composition consumer such as `apps/docs` or a product application may
  depend on both LDS and LDS3D.
- LDS must never depend on LDS3D. Preserve the one-way sibling relationship.
- A local sibling `link:` dependency is acceptable for local visual review only.
  CI and release work must use an explicit checkout/pin or a verified package
  artifact and must not claim portability from a local link alone.

## DOM UI Ownership Gate (MANDATORY)

All non-spatial application chrome must use the closest actual LDS public
component. The default mapping is:

| Surface                        | Required LDS owner                                                |
| ------------------------------ | ----------------------------------------------------------------- |
| LK ROBOTICS logo or mark       | `Lockup` or an official LDS brand asset                           |
| Page/application heading       | `PageHeader` or the approved LDS shell                            |
| 3D viewport frame              | `Scene3DFrame`                                                    |
| Camera/view controls           | `SegmentedControl`, `ViewerToolbar`, and/or `ViewerToolbarButton` |
| Persistent side inspector      | `DockPanel` containing `SelectionInspector`                       |
| Temporary/modal side inspector | `Drawer` containing `SelectionInspector`                          |
| Viewport readout               | `ViewportStatusBar`                                               |
| Runtime/entity state           | `StatusBadge` and the LDS status grammar                          |
| Actions                        | `Button`, `IconButton`, or another matching LDS action component  |

- Do not hand-draw or typeset an LK logo when `Lockup` or an official brand asset
  exists.
- Do not create a custom header, button, segmented control, drawer, dock panel,
  inspector shell, close control, badge, or status bar when LDS provides the
  pattern.
- Raw interactive HTML such as `<button>` is prohibited in LDS-integrated docs
  and public composition when an LDS equivalent exists.
- Wrapping an LDS component in a custom shell does not establish parity. The
  wrapper's surface, dimensions, divider, elevation, close behavior, focus
  behavior, and responsive behavior must also come from LDS or be justified as
  layout-only composition.
- Do not override LDS component classes to make them match a custom mock. Use
  supported props, variants, tokens, and composition slots.
- If LDS lacks a necessary reusable DOM pattern, stop before creating an ad hoc
  substitute. Document the gap and choose explicitly among:
  1. an additive LDS component/change;
  2. a product-owned composition;
  3. a narrowly scoped LDS3D scene overlay with written justification.
- A different product area, profile name, or component name is not sufficient
  justification for different styling.

## LDS Page Composition Gate (MANDATORY)

Using LDS components individually is not sufficient. The complete page must use
the nearest LDS composition grammar for anatomy, information hierarchy, region
ownership, density, landmarks, and responsive behavior.

- Classify the surface before implementation:
  - a focused viewer uses `Scene3DFrame` as the dominant region inside the
    smallest appropriate product/page shell;
  - a spatial editor uses `CanvasEditorShell` for document header, modes, tool
    rail, structural panel, dominant viewport, properties panel, and passive
    status;
  - a dashboard or route-level product page uses `DashboardShell`, approved
    navigation, `Container`, and `PageHeader` as appropriate;
  - a technical contract Story remains a technical fixture and must not imitate
    a product page with custom chrome.
- Start with the closest LDS shell and remove unused regions. Do not start from a
  blank grid and restyle independent boxes until they resemble LDS.
- Preserve one clear dominant region. In a 3D operations page, the viewport is
  primary; navigation, page identity, tools, inspector, and status are supporting
  regions and must not compete with it as equal cards.
- Use the LDS page margin, max-width, grid, spacing, surface, divider, and
  elevation contracts through their owning layout components first. Semantic
  tokens are allowed only for unsupported layout glue with a documented reason;
  tokens alone are not permission to reconstruct an LDS shell. Do not invent a
  parallel page grid, arbitrary header height, inspector width, or card rhythm
  without evidence.
- Nested owning surfaces are allowed when they represent different semantic
  regions, such as `Scene3DFrame` and `DockPanel` inside `CanvasEditorShell`.
  Do not add duplicate card/panel treatment to the same region. A
  `SelectionInspector` inside `DockPanel` must not add a second custom drawer
  surface, border, radius, header, or shadow.
- Place controls by scope:
  - route/page identity and page actions belong to `PageHeader` or the approved
    application shell;
  - document history, save, import, and export belong to the editor shell header;
  - workspace modes belong to the shell subheader;
  - edit modes belong to the tool rail;
  - orbit, pan, zoom, home, focus, camera, and display controls belong to the
    `Scene3DFrame` toolbar;
  - selection-specific actions belong to the owning inspector;
  - passive frame, unit, selection, and renderer data belong to status regions.
- Preserve the application-chrome scope hierarchy when those scopes actually
  exist:
  - `DashboardShell` + `TopBar` own global brand, account, application actions,
    and primary navigation;
  - `PageHeader` owns route/page identity, description, status, and page actions;
  - `CanvasEditorShell` header owns document identity and document commands;
  - `Scene3DFrame` owns source/scene identity, viewport-local controls, and
    renderer status.
    Do not insert a custom context bar between these layers. Do not render every
    layer by default; include a layer only when it represents a distinct scope.
- Do not repeat page identity or runtime state in multiple stacked headers. A
  page shell and `Scene3DFrame` may each have identity only when they describe
  distinct scopes; document that distinction and avoid duplicate titles/badges.
- Use semantic landmark and keyboard order that matches visual order. A composed
  page must have one main landmark, a working skip target when a persistent shell
  is present, named navigation/regions where needed, and no nested duplicate
  banner or complementary landmarks.
- Design wide and narrow compositions explicitly. Do not obtain narrow behavior
  by merely shrinking the desktop grid:
  - preserve one primary region at a time on narrow editor/viewer surfaces;
  - use `CanvasEditorShell.mobileActiveRegion` with `responsiveNavigation` for
    narrow editor switching among canvas, layers, and properties;
  - keep repeated desktop editing in a docked `DockPanel` and use
    `CanvasEditorShell panelMode="drawer"` only for lightweight viewport context;
  - use `Drawer` for a page-level modal/focus-trapped secondary task, not as a
    generic replacement for persistent editor regions;
  - in `DashboardShell`, provide an approved `narrowNavigation` when the wide
    navigation cannot remain; otherwise keep the available navigation before
    main content rather than letting it disappear;
  - preserve focus return, Escape behavior, safe-area handling, and access to all
    critical information and actions.
- Keep the shell stable across scene `loading`, `ready`, `stale`, `degraded`,
  `unavailable`, and `error` states. Let `Scene3DFrame` own viewport state
  placement; do not add a second custom page-level status treatment for the same
  renderer state.
- For route/dashboard `loading`, `empty`, and `error`, keep the application shell,
  navigation, and `PageHeader` stable and place the appropriate LDS
  `ResourceState`/`EmptyState` treatment inside the main content region. Treat
  "no selection" separately as the inspector's empty state; it is not a page or
  renderer error.
- Validate representative real content, not placeholder rectangles. Include long
  titles, several statuses, no selection, dense selection metadata, errors,
  disabled actions, and constrained widths.
- If no LDS shell fits, document the proposed anatomy, reading order, responsive
  transition, and ownership gaps before coding. Treat a new reusable page shell
  as an LDS or product design decision, not an LDS3D styling shortcut.
- Do not move product workflows, routing, permissions, data fetching, or command
  policy into an LDS3D page merely to demonstrate the shell.

## Headless Renderer Boundary (MANDATORY)

- Renderer packages are headless with respect to application chrome. They may
  create a canvas, WebGL resources, scene objects, hit regions, and
  renderer/accessibility events; they must not own branded headers, drawers,
  application buttons, or product controls.
- `SceneCanvas` and equivalent hosts must expose state, events, commands, and
  render/overlay slots. LDS-integrated consumers render LDS controls in those
  slots or adjacent composition.
- A renderer package must not import LDS to solve this boundary. Move the UI to
  the composition consumer instead.
- Interactive default overlays in renderer packages require explicit review.
  Prefer non-interactive diagnostics or caller-provided slots over raw buttons.
- HTML overlays are allowed for spatial labels, annotations, measurements, and
  accessible summaries when they remain tied to real WebGL geometry. They may
  not substitute for required 3D meshes, depth, occlusion, raycasting, or
  picking.
- Scene-specific labels may use a renderer theme contract, but must not invent a
  second application chrome language. General actions inside a label use LDS at
  the composition boundary.

## Visual Delta And Reference Gate (MANDATORY)

- Before a new reusable 3D primitive, interaction pattern, or material redesign,
  inspect the closest LDS pattern and research at least two authoritative
  external references when suitable sources exist. Prefer official vendor
  documentation, standards, accessibility guidance, and established spatial or
  robotics tools.
- Record what each reference changed in the design decision. Do not collect
  references that do not influence implementation.
- Every retained difference from the closest LDS sibling must be justified by
  one of:
  - a spatial/depth requirement;
  - a renderer limitation documented with evidence;
  - a safety or accessibility requirement;
  - an established LDS token/component convention;
  - authoritative external category evidence.
- Remove unjustified differences. "Looks more 3D," "more technical," and
  "already implemented" are not evidence.
- For composed UI, define the intended reading and keyboard order before coding.
  Keep identity, status, metadata, diagnostics, and actions in explicit role
  groups.

## Storybook Contract (MANDATORY)

- Storybook is the review and contract surface for actual LDS3D foundations,
  assets, primitives, scenes, states, and LDS integration. Do not add planning
  pages, audit dashboards, coverage reports, or implementation status pages when
  Markdown/JSON/script evidence is sufficient.
- Audit and document the audience-facing information architecture before
  changing public Storybook navigation. Prefer an approved `LDS 3D/...`
  namespace that clearly groups foundations, assets, primitives, scenes,
  states, and LDS integration. Flat top-level titles such as `Visual Alpha`,
  `Fixtures`, or `Foundations` require an explicit audited rationale rather than
  becoming a precedent by default.
- Treat a repository-wide story rename or navigation restructuring as scope
  escalation. Obtain user approval and preserve redirects/contracts where
  relevant instead of making the rename incidentally during a component task.
- Follow the LDS story authoring sequence where applicable: overview, usage,
  variants/states, interaction, responsive behavior, and scenario.
- Reproduce the public LDS StoryGuide contract and navigation behavior without
  importing LDS internal story or `.storybook` source files.
- Audit Storybook version compatibility and align the required addons, docs
  behavior, theme decorator, backgrounds, story sort, and manager branding with
  the LDS baseline. Exact major-version equality is not required when behavior
  and package compatibility are verified and the difference is documented.
  Treat a Storybook major migration as a separate dependency decision, not an
  incidental visual-parity edit.
- Foundation stories that intentionally build without LDS must remain technical
  contract stories. They must not present custom UI chrome as an LDS visual
  example.
- LDS integration stories must install and use the real pinned LDS public
  package and official CSS. A lookalike composition is not an integration story.
- Do not use DOM/SVG stand-ins as evidence for a finished 3D result. Final scene
  stories must exercise actual WebGL, actual assets, depth, and picking.

## Required Visual Parity Review

Before claiming LDS visual integration or parity:

1. Render the LDS3D surface and its closest LDS Storybook siblings side by side.
2. Compare the same light/dark appearance, normal/narrow width, and equivalent
   component states.
3. Inspect page anatomy, landmark/reading order, dominant-region hierarchy,
   region ownership, width allocation, grid, density, nested surfaces, and the
   wide-to-narrow transition.
4. Inspect logo geometry, typography, spacing, control sizes, radius, borders,
   elevation, dividers, focus, hover, pressed, disabled, loading, error, drawer
   behavior, and responsive behavior.
5. Audit the rendered DOM for raw interactive elements, handwritten brand marks,
   copied component CSS, and custom shells around LDS-owned surfaces.
6. Capture current evidence and record every intentional delta with its owner and
   reason.
7. Have a reviewer independently challenge retained differences. The author,
   implementation, and prompt wording are not evidence on their own.

Passing type checks, accessibility checks, interaction tests, runtime WebGL QA,
or screenshot generation does not prove visual parity.

## 3D Scene And Asset Gate

- Finished 3D stories must use a real WebGL canvas. DOM, SVG, screenshots, or
  CSS perspective must not replace the 3D result.
- Reusable visual assets must be actual glTF 2.0/GLB resources with a manifest,
  explicit coordinate metadata, core-frame bounds, units, integrity hash, and
  provenance.
- Keep public spatial math right-handed, Z-up, meters, radians, and normalized
  `[x, y, z, w]` quaternions. Renderer conversion belongs at an adapter boundary.
- Keep asset loading, ownership transfer, cancellation, disposal, context loss,
  and recovery explicit and testable.
- Camera, hover, focus, picking, persistent selection, goal, path, loading,
  empty, error, retry, and reduced-motion behavior must be directly reviewable
  in Storybook when they are in scope.
- State must not rely on color alone. Use geometry, pattern, icon/glyph, label,
  outline, and/or an LDS DOM summary as appropriate.
- Record whether runtime QA used software WebGL or physical GPU hardware. Do not
  present software-renderer success as GPU performance evidence.

## Accessibility And Interaction

- Canvas interaction must have an accessible name and a DOM summary for selected
  or critical information. The DOM summary complements real WebGL; it does not
  replace it.
- LDS owns DOM focus, keyboard, button, drawer, and status behavior. Reuse that
  behavior rather than recreating it in R3F.
- Camera presets and primary viewport actions must be keyboard operable.
- Hover is transient; selection is persistent. Do not make hover the only way to
  reveal critical information.
- Respect `prefers-reduced-motion`; remove repeated pulse and forced camera
  flight without losing information.
- Verify text contrast, non-text contrast, focus visibility, high contrast, and
  status comprehension in representative dense scenes.
- Normal scene selection must not create robot commands or other product side
  effects.

## Product And Release Scope

- Product repositories and package registries are read-only unless the user
  explicitly authorizes changes or publishing in the current task.
- Read-only product inspection is allowed when needed to establish evidence.
  Record the repository revision before making support or migration claims.
- Do not add product routes, stores, transport, command logic, permissions,
  backend schemas, or full workflows to LDS3D packages.
- Do not publish, tag, push, open a PR, or mutate a product checkout merely
  because package validation passed.
- Local package smoke tests are not registry publication.

## Current Debt Is Not A Baseline

The following known patterns are provisional debt and must not be copied or used
as proof of LDS parity:

- handwritten `.visual-brand-mark` branding;
- custom `.visual-contextbar` application chrome;
- a custom `.visual-inspector` shell around `SelectionInspector`;
- the current bespoke page grid, duplicated viewer/page identity, and equal-card
  treatment of viewport chrome without an LDS shell anatomy review;
- raw interactive buttons in renderer default overlays;
- legacy custom button/inspector CSS in the docs app;
- a Storybook configuration or information architecture that differs from the
  audited LDS baseline without a recorded reason.

Functional Visual Alpha runtime evidence remains useful for WebGL, asset, and
interaction behavior. It does not grandfather the current DOM chrome.

## Verification Cadence

- During implementation, run the smallest focused checks that cover the files
  and contracts being changed. Do not rerun every repository-wide suite after
  each small edit.
- For UI work, perform focused render and parity review before the full suite.
  Automated checks do not replace visual inspection.
- At the final checkpoint, run the applicable repository gates:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build-storybook
pnpm visual-alpha:runtime-qa
pnpm package-smoke
pnpm evidence
```

- Build Storybook before runtime QA. Regenerate evidence only after the final
  build being reviewed.
- Validate publishable package roots and public subpaths with the existing API,
  export, `publint`, and Are The Types Wrong checks when package surfaces change.
- A failing unrelated area is not authorization to modify it. Report unrelated
  failures separately.

## Completion And Handoff Gate

Do not declare work complete until all applicable statements are true:

- the current LDS commit/version and public APIs were audited and recorded;
- UI ownership and component mapping were completed;
- page anatomy, information hierarchy, region ownership, and wide/narrow
  composition were mapped to the closest LDS shell or explicitly approved;
- no unjustified custom LDS-owned chrome remains in the changed surface;
- renderer packages remain independent of LDS and product code;
- actual WebGL/GLB behavior is preserved and directly reviewable;
- Storybook follows the approved LDS3D information architecture and audited LDS
  authoring conventions;
- side-by-side visual parity was reviewed at representative appearances, states,
  and widths;
- accessibility, interaction, package, and runtime gates appropriate to the
  change passed;
- evidence corresponds to the final source/build;
- product repositories and registries were not changed without authorization;
- remaining risks and intentional deviations are stated explicitly.

Use precise completion language:

- "uses LDS public components" means only that the imports are real;
- "LDS composition integrated" additionally requires correct ownership and
  state wiring;
- "LDS visual parity" requires the side-by-side review and zero unexplained
  deltas;
- "better than the current product" requires comparative user/task evidence and
  must not be inferred from implementation quality.

## Scope Escalation

- A request to fix one story or component does not authorize repository-wide UI
  replacement, LDS changes, product mutations, shared token value changes, or
  publication.
- Stop and ask before changing a shared LDS token value, adding a new reusable
  LDS component, restructuring public APIs, mass-editing stories, or expanding a
  binary quality gate to expose unrelated violations.
- When a missing LDS primitive blocks parity, present the ownership decision and
  blast radius instead of silently creating a local substitute.

## Documentation Changes

- Before adding a new Markdown file, inspect the existing documentation index
  and nearest owner document. Prefer updating an existing document when the
  content shares its lifecycle.
- Keep source evidence and design decisions in `docs/` or `evidence/`, not in
  Storybook-only audit pages.
- Link any justified new document from the nearest README or documentation index.
