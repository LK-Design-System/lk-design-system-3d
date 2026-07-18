import { Button } from "@lk-robotics/design-system-core/components/buttons/Button";
import { StatusBadge } from "@lk-robotics/design-system-core/components/content/StatusBadge";
import { CanvasEditorShell } from "@lk-robotics/design-system-core/components/editor/CanvasEditorShell";
import { SelectionInspector } from "@lk-robotics/design-system-core/components/editor/SelectionInspector";
import { ViewportStatusBar } from "@lk-robotics/design-system-core/components/editor/ViewportStatusBar";
import { Icon } from "@lk-robotics/design-system-core/components/icon/Icon";
import { Container } from "@lk-robotics/design-system-core/components/layout/Container";
import { Drawer } from "@lk-robotics/design-system-core/components/overlay/Drawer";
import { Scene3DFrame } from "@lk-robotics/design-system-core/components/viz/Scene3DFrame";
import {
  ViewerToolbar,
  ViewerToolbarButton,
} from "@lk-robotics/design-system-core/components/viz/ViewerToolbar";
import {
  useEffect,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { StoryGuide } from "./components";

export type VisualProfile = "operational" | "diagnostic";
export type VisualCameraMode = "home" | "top" | "focus";
export type VisualRuntimeState = "ready" | "loading" | "error" | "empty";

export interface SelectedAssetDetails {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: "live" | "warning" | "error" | "idle";
  readonly pose: readonly [number, number, number];
  readonly battery?: number;
  readonly task?: string;
  readonly source?: string;
  readonly frame?: string;
  readonly timestamp?: string;
}

export interface LdsFocusedViewerPageProps extends PropsWithChildren {
  readonly pageTitle: string;
  readonly sceneTitle: string;
  readonly description?: string;
  readonly eyebrow?: string;
  readonly profile: VisualProfile;
  readonly runtimeState?: VisualRuntimeState;
  readonly cameraMode: VisualCameraMode;
  readonly selected?: SelectedAssetDetails;
  readonly onCameraModeChange: (mode: VisualCameraMode) => void;
  readonly onRetry?: () => void;
  readonly onClearSelection?: () => void;
  readonly reviewControls?: ReactNode;
  readonly storyMeta?: ReactNode;
}

const NARROW_VIEWER_QUERY = "(max-width: 991px)";

const RUNTIME_COPY: Readonly<
  Record<
    VisualRuntimeState,
    {
      readonly state: NonNullable<ComponentProps<typeof Scene3DFrame>["state"]>;
      readonly label: string;
      readonly description?: string;
    }
  >
> = Object.freeze({
  ready: { state: "live", label: "Live" },
  loading: {
    state: "loading",
    label: "Preparing spatial scene",
    description: "Validating asset manifests and allocating the WebGL renderer.",
  },
  error: {
    state: "error",
    label: "3D scene unavailable",
    description: "Retry the renderer without losing the current scene context.",
  },
  empty: {
    state: "no-source",
    label: "No spatial entities",
    description: "The renderer is ready, but this view contains no spatial entities.",
  },
});

function useNarrowViewer(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_VIEWER_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_VIEWER_QUERY);
    const update = (): void => setNarrow(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return narrow;
}

function inspectorTone(
  status: SelectedAssetDetails["status"],
): NonNullable<ComponentProps<typeof StatusBadge>["tone"]> {
  switch (status) {
    case "live":
      return "positive";
    case "warning":
      return "cautionary";
    case "error":
      return "negative";
    case "idle":
      return "offline";
  }
}

function inspectorSections(
  selected: SelectedAssetDetails | undefined,
  profile: VisualProfile,
): NonNullable<ComponentProps<typeof SelectionInspector>["sections"]> {
  if (selected === undefined) return [];
  const sections: NonNullable<ComponentProps<typeof SelectionInspector>["sections"]> = [
    {
      title: "Spatial identity",
      fields: [
        { label: "Entity ID", value: selected.id },
        {
          label: "Position",
          value: selected.pose.map((value) => value.toFixed(2)).join(" · "),
          unit: "m",
          align: "right",
        },
      ],
    },
  ];

  if (selected.battery !== undefined || selected.task !== undefined) {
    sections.push({
      title: "Operations",
      fields: [
        ...(selected.battery === undefined
          ? []
          : [{ label: "Battery", value: selected.battery, unit: "%", align: "right" as const }]),
        ...(selected.task === undefined ? [] : [{ label: "Task", value: selected.task }]),
      ],
    });
  }

  if (profile === "diagnostic") {
    sections.push({
      title: "Diagnostics",
      fields: [
        { label: "Frame", value: selected.frame ?? "lk-map" },
        { label: "Source", value: selected.source ?? "fixture/visual-alpha" },
        { label: "Timestamp", value: selected.timestamp ?? "T+08:42.120" },
      ],
    });
  }
  return sections;
}

function SelectionDetails({
  selected,
  profile,
  onClearSelection,
}: {
  readonly selected: SelectedAssetDetails | undefined;
  readonly profile: VisualProfile;
  readonly onClearSelection: (() => void) | undefined;
}): ReactNode {
  return (
    <SelectionInspector
      clearSelectionAriaLabel="Clear selection"
      clearSelectionLabel="Clear selection"
      emptyLabel="Select a robot, facility asset, goal, or path in the WebGL scene."
      item={
        selected === undefined
          ? null
          : {
              label: selected.name,
              kind: selected.kind,
              status: selected.status.toUpperCase(),
              statusTone: inspectorTone(selected.status),
            }
      }
      sections={inspectorSections(selected, profile)}
      title="Selected spatial entity"
      {...(selected !== undefined && onClearSelection !== undefined
        ? { onClearSelection }
        : {})}
    />
  );
}

export function LdsFocusedViewerPage({
  pageTitle,
  sceneTitle,
  description,
  eyebrow = "LDS 3D / Scene",
  profile,
  runtimeState = "ready",
  cameraMode,
  selected,
  onCameraModeChange,
  onRetry,
  onClearSelection,
  reviewControls,
  storyMeta = (
    <>
      <span>Visual Alpha V0</span>
      <span aria-hidden="true">·</span>
      <span>6 GLB assets</span>
    </>
  ),
  children,
}: LdsFocusedViewerPageProps): ReactNode {
  const runtime = RUNTIME_COPY[runtimeState];
  const selectedCount = selected === undefined ? 0 : 1;
  const appearance = profile === "diagnostic" ? "dark" : "light";
  const isNarrow = useNarrowViewer();
  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(300);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeDockWidth = !isNarrow && dockOpen ? dockWidth : 0;
  const toolbarEndMargin = isNarrow
    ? undefined
    : dockOpen
      ? `calc(${String(dockWidth)}px + var(--space-6))`
      : "var(--space-6)";

  useEffect(() => {
    if (!isNarrow) {
      setDrawerOpen(false);
    }
  }, [isNarrow]);

  const resolvedDescription =
    description ??
    (profile === "diagnostic"
      ? "Read-only diagnostics for renderer, frame, source, and selected spatial entities."
      : "Read-only spatial operations view for scene selection and inspection.");
  const profileLabel = profile === "diagnostic" ? "Diagnostic Technical" : "Operational Neutral";

  const inspector = (
    <SelectionDetails
      selected={selected}
      profile={profile}
      onClearSelection={onClearSelection}
    />
  );

  const sceneFrame = (
    <Scene3DFrame
      appearance={appearance}
      variant={isNarrow ? "standalone" : "embedded"}
      hud={
        <ViewportStatusBar
          data-testid="lds-viewport-status"
          items={[
            {
              key: "selection",
              label: "Selected",
              value: selectedCount,
              priority: "high",
            },
            {
              key: "camera",
              label: "Camera",
              value: cameraMode.toUpperCase(),
            },
            {
              key: "frame",
              label: "Frame",
              value: "lk-map",
              mono: true,
              priority: "low",
            },
          ]}
        />
      }
      label={`${sceneTitle} interactive 3D viewport`}
      state={runtime.state}
      stateLabel={runtime.label}
      status="WebGL · R3F · meters"
      style={{ height: "100%", minHeight: 480 }}
      title={sceneTitle}
      toolbar={
        <ViewerToolbar
          appearance={profile === "diagnostic" ? "on-dark" : "surface"}
          label="Camera and viewport controls"
          orientation="horizontal"
          style={toolbarEndMargin === undefined ? undefined : { marginInlineEnd: toolbarEndMargin }}
        >
          <ViewerToolbarButton
            kind="toggle"
            label="Home view"
            pressed={cameraMode === "home"}
            onClick={() => onCameraModeChange("home")}
          >
            <Icon aria-hidden="true" name="home" size={16} />
          </ViewerToolbarButton>
          <ViewerToolbarButton
            kind="toggle"
            label="Top view"
            pressed={cameraMode === "top"}
            onClick={() => onCameraModeChange("top")}
          >
            <Icon aria-hidden="true" name="map" size={16} />
          </ViewerToolbarButton>
          <ViewerToolbarButton
            disabled={selected === undefined}
            kind="toggle"
            label="Focus selected entity"
            pressed={cameraMode === "focus"}
            onClick={() => onCameraModeChange("focus")}
          >
            <Icon aria-hidden="true" name="crosshair" size={16} />
          </ViewerToolbarButton>
          {isNarrow ? (
            <ViewerToolbarButton
              label="Open selected entity details"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon aria-hidden="true" name="circle-info" size={16} />
            </ViewerToolbarButton>
          ) : null}
        </ViewerToolbar>
      }
      {...(runtime.description === undefined
        ? {}
        : { stateDescription: runtime.description })}
      {...(runtimeState === "error" && onRetry !== undefined
        ? {
            stateAction: (
              <Button type="button" onClick={onRetry}>
                Retry renderer
              </Button>
            ),
          }
        : {})}
    >
      <div className="visual-canvas-slot">{children}</div>
    </Scene3DFrame>
  );

  return (
    <main
      className={`lds3d-focused-viewer-page is-${profile}`}
      data-lds3d-composition="actual"
      data-lds-core-version="0.1.0"
      data-lkds3d-profile={
        profile === "diagnostic" ? "diagnostic-technical" : "operational-neutral"
      }
      data-theme={profile === "diagnostic" ? "dark" : "light"}
      aria-label={`${pageTitle} 3D workspace`}
      style={
        {
          "--lds3d-inspector-width": `${String(activeDockWidth)}px`,
        } as CSSProperties
      }
    >
      <Container className="lds3d-focused-viewer-container" size="wide">
        <StoryGuide
          description={resolvedDescription}
          eyebrow={eyebrow}
          meta={storyMeta}
          size="sm"
          status={
            <StatusBadge tone={profile === "diagnostic" ? "signal" : "positive"}>
              {profileLabel}
            </StatusBadge>
          }
          title={pageTitle}
        />

        {reviewControls === undefined ? null : (
          <section className="lds3d-review-controls" aria-label="Story fixture controls">
            {reviewControls}
          </section>
        )}

        <h2 className="lds3d-visually-hidden">{sceneTitle} workspace</h2>

        <div className="lds3d-focused-viewer-layout" data-layout={isNarrow ? "narrow" : "wide"}>
          {isNarrow ? (
            sceneFrame
          ) : (
            <CanvasEditorShell
              aria-label={`${sceneTitle} spatial inspection workspace`}
              panel={inspector}
              panelLabel="Selected entity details"
              panelMaxWidth={420}
              panelMinWidth={280}
              panelMode="drawer"
              panelOpen={dockOpen}
              panelWidth={dockWidth}
              resizablePanels
              onPanelOpenChange={setDockOpen}
              onPanelWidthChange={setDockWidth}
            >
              {sceneFrame}
            </CanvasEditorShell>
          )}
        </div>
      </Container>

      {isNarrow ? (
        <Drawer
          ariaLabel="Selected entity details"
          closeLabel="Close selected entity details"
          open={drawerOpen}
          side="right"
          title="Selected entity details"
          width={380}
          onClose={() => setDrawerOpen(false)}
        >
          {inspector}
        </Drawer>
      ) : null}
    </main>
  );
}
