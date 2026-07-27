import { Button } from "@lk-robotics/lds-core/components/buttons/Button";
import { StatusBadge } from "@lk-robotics/lds-core/components/content/StatusBadge";
import { SelectionInspector } from "@lk-robotics/lds-product/components/editor/SelectionInspector";
import { ViewportStatusBar } from "@lk-robotics/lds-product/components/editor/ViewportStatusBar";
import { Icon } from "@lk-robotics/lds-core/components/icon/Icon";
import { Container } from "@lk-robotics/lds-core/components/layout/Container";
import { DockPanel } from "@lk-robotics/lds-product/components/layout/DockPanel";
import { Drawer } from "@lk-robotics/lds-product/components/overlay/Drawer";
import { Scene3DFrame } from "@lk-robotics/lds-product/components/viz/Scene3DFrame";
import {
  ViewerToolbar,
  ViewerToolbarButton,
} from "@lk-robotics/lds-product/components/viz/ViewerToolbar";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { StoryGuide } from "./components";

export type VisualProfile = "operational" | "diagnostic";
export type VisualCameraMode = "home" | "top" | "focus";
export type VisualRuntimeState = "ready" | "loading" | "retrying" | "error" | "empty";

export interface SelectedAssetDetails {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: "live" | "warning" | "error" | "idle";
  readonly statusLabel?: string;
  readonly statusTone?: NonNullable<
    NonNullable<ComponentProps<typeof SelectionInspector>["item"]>["statusTone"]
  >;
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
  readonly emptySelectionLabel?: ReactNode;
  readonly inspectorActions?: ReactNode;
  readonly reviewControls?: ReactNode;
  readonly sceneDetails?: ReactNode;
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
  ready: { state: "live", label: "실시간" },
  loading: {
    state: "loading",
    label: "3D 장면 준비 중 · 58%",
    description: "자산 manifest를 검증하고 WebGL 렌더러를 준비하고 있습니다.",
  },
  retrying: {
    state: "loading",
    label: "렌더러 재시도 중 · 32%",
    description: "렌더러를 다시 초기화하고 자산 manifest를 재검증하고 있습니다.",
  },
  error: {
    state: "error",
    label: "자산 로딩 실패",
    description:
      "렌더러 복구 동작을 확인하기 위한 오류입니다. 현재 장면 맥락을 유지한 채 다시 시도하세요.",
  },
  empty: {
    state: "no-source",
    label: "공간 객체 없음",
    description: "렌더러는 준비되었지만 이 뷰에 표시할 공간 객체가 없습니다.",
  },
});

function inspectorStatusLabel(status: SelectedAssetDetails["status"]): string {
  switch (status) {
    case "live":
      return "실시간";
    case "warning":
      return "주의";
    case "error":
      return "오류";
    case "idle":
      return "대기";
  }
}

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
): NonNullable<NonNullable<ComponentProps<typeof SelectionInspector>["item"]>["statusTone"]> {
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
      title: "공간 식별 정보",
      fields: [
        { label: "객체 ID", value: selected.id },
        {
          label: "위치",
          value: selected.pose.map((value) => value.toFixed(2)).join(" · "),
          unit: "m",
          align: "right",
        },
      ],
    },
  ];

  if (selected.battery !== undefined || selected.task !== undefined) {
    sections.push({
      title: "운영 정보",
      fields: [
        ...(selected.battery === undefined
          ? []
          : [{ label: "배터리", value: selected.battery, unit: "%", align: "right" as const }]),
        ...(selected.task === undefined ? [] : [{ label: "작업", value: selected.task }]),
      ],
    });
  }

  if (profile === "diagnostic") {
    sections.push({
      title: "진단 정보",
      fields: [
        { label: "프레임", value: selected.frame ?? "lk-map" },
        { label: "소스", value: selected.source ?? "fixture/visual-alpha" },
        { label: "관측 시각", value: selected.timestamp ?? "T+08:42.120" },
      ],
    });
  }
  return sections;
}

function SelectionDetails({
  selected,
  profile,
  onClearSelection,
  emptySelectionLabel,
  actions,
}: {
  readonly selected: SelectedAssetDetails | undefined;
  readonly profile: VisualProfile;
  readonly onClearSelection: (() => void) | undefined;
  readonly emptySelectionLabel: ReactNode | undefined;
  readonly actions: ReactNode | undefined;
}): ReactNode {
  return (
    <SelectionInspector
      clearSelectionAriaLabel="선택 해제"
      clearSelectionLabel="선택 해제"
      emptyLabel={
        emptySelectionLabel ??
        "WebGL 장면에서 로봇, 시설 자산, 목표 또는 경로를 선택하세요."
      }
      item={
        selected === undefined
          ? null
          : {
              label: selected.name,
              kind: selected.kind,
              status: selected.statusLabel ?? inspectorStatusLabel(selected.status),
              statusTone: selected.statusTone ?? inspectorTone(selected.status),
            }
      }
      actions={actions}
      sections={inspectorSections(selected, profile)}
      title="선택한 공간 객체"
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
  eyebrow = "LDS 3D / 장면",
  profile,
  runtimeState = "ready",
  cameraMode,
  selected,
  onCameraModeChange,
  onRetry,
  onClearSelection,
  emptySelectionLabel,
  inspectorActions,
  reviewControls,
  sceneDetails,
  storyMeta = (
    <>
      <span>AMR 운영</span>
      <span aria-hidden="true">·</span>
      <span>GLB 자산 6개</span>
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
  const retryFrameRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (runtimeState !== "ready" || retryFrameRef.current === null) return;
    const frame = retryFrameRef.current;
    retryFrameRef.current = null;
    const focusTarget = frame.querySelector<HTMLElement>(
      '[data-viewer-toolbar] [data-lk-viewer-toolbar-item]:not([disabled]):not([aria-disabled="true"])',
    );
    focusTarget?.focus({ preventScroll: true });
  }, [runtimeState]);

  const resolvedDescription =
    description ??
    (profile === "diagnostic"
      ? "렌더러, 프레임, 소스와 선택한 공간 객체를 읽기 전용으로 진단합니다."
      : "장면을 선택하고 검사하는 읽기 전용 공간 운영 뷰입니다.");
  const profileLabel = profile === "diagnostic" ? "진단 중심" : "운영 중심";

  const inspector = (
    <SelectionDetails
      selected={selected}
      profile={profile}
      onClearSelection={onClearSelection}
      emptySelectionLabel={emptySelectionLabel}
      actions={selected === undefined ? undefined : inspectorActions}
    />
  );

  const sceneFrame = (
    <Scene3DFrame
      appearance={appearance}
      variant="standalone"
      hud={
        <ViewportStatusBar
          data-testid="lds-viewport-status"
          items={[
            {
              key: "selection",
              label: "선택",
              value: selectedCount,
              priority: "high",
            },
            {
              key: "camera",
              label: "카메라",
              value: cameraMode === "home" ? "기본" : cameraMode === "top" ? "상단" : "초점",
            },
            {
              key: "frame",
              label: "프레임",
              value: "lk-map",
              mono: true,
              priority: "low",
            },
          ]}
        />
      }
      label={`${sceneTitle} 인터랙티브 3D 뷰포트`}
      state={runtime.state}
      stateLabel={runtime.label}
      status="WebGL · R3F · 미터"
      style={{ height: "100%", minHeight: 480 }}
      title={sceneTitle}
      toolbar={
        <ViewerToolbar
          appearance="surface"
          label="카메라와 뷰포트 제어"
          orientation="horizontal"
          style={toolbarEndMargin === undefined ? undefined : { marginInlineEnd: toolbarEndMargin }}
        >
          <ViewerToolbarButton
            kind="toggle"
            label="기본 시점"
            pressed={cameraMode === "home"}
            onClick={() => onCameraModeChange("home")}
          >
            <Icon aria-hidden="true" name="home" size={16} />
          </ViewerToolbarButton>
          <ViewerToolbarButton
            kind="toggle"
            label="상단 시점"
            pressed={cameraMode === "top"}
            onClick={() => onCameraModeChange("top")}
          >
            <Icon aria-hidden="true" name="map" size={16} />
          </ViewerToolbarButton>
          <ViewerToolbarButton
            disabled={selected === undefined}
            kind="toggle"
            label="선택 객체에 초점"
            pressed={cameraMode === "focus"}
            onClick={() => onCameraModeChange("focus")}
          >
            <Icon aria-hidden="true" name="crosshair" size={16} />
          </ViewerToolbarButton>
          {isNarrow ? (
            <ViewerToolbarButton
              label="선택 객체 세부 정보 열기"
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
      {...((runtimeState === "error" || runtimeState === "retrying") && onRetry !== undefined
        ? {
            stateAction: (
              <Button
                aria-disabled={runtimeState === "retrying"}
                data-testid="renderer-retry-action"
                type="button"
                onClick={
                  runtimeState === "retrying"
                    ? undefined
                    : (event) => {
                        retryFrameRef.current = event.currentTarget.closest<HTMLElement>(
                          "[data-lds-viewer-frame]",
                        );
                        onRetry();
                      }
                }
              >
                {runtimeState === "retrying" ? "렌더러 재시도 중 · 32%" : "렌더러 다시 시도"}
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
      aria-label={`${pageTitle} 3D 작업 영역`}
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
          <section className="lds3d-review-controls" aria-label="스토리 예제 제어">
            {reviewControls}
          </section>
        )}

        <h2 className="lds3d-visually-hidden">{sceneTitle} 작업 영역</h2>

        <div className="lds3d-focused-viewer-layout" data-layout={isNarrow ? "narrow" : "wide"}>
          {isNarrow ? (
            sceneFrame
          ) : (
            <div className="lds3d-focused-viewer-workspace" data-visual-workspace="">
              {sceneFrame}
              <div className="lds3d-focused-viewer-dock" data-visual-inspector-dock="">
                <DockPanel
                  aria-label="선택 객체 세부 정보"
                  bodyPadding={0}
                  bodyStyle={{ overflow: "hidden" }}
                  maxWidth={420}
                  minWidth={280}
                  open={dockOpen}
                  resizable
                  side="right"
                  width={dockWidth}
                  onOpenChange={setDockOpen}
                  onWidthChange={setDockWidth}
                >
                  {inspector}
                </DockPanel>
              </div>
            </div>
          )}
        </div>

        {sceneDetails === undefined ? null : (
          <section className="lds3d-scene-details" aria-label={`${sceneTitle} 세부 정보`}>
            {sceneDetails}
          </section>
        )}
      </Container>

      {isNarrow ? (
        <Drawer
          ariaLabel="선택 객체 세부 정보"
          closeLabel="선택 객체 세부 정보 닫기"
          open={drawerOpen}
          side="right"
          title="선택 객체 세부 정보"
          width={380}
          onClose={() => setDrawerOpen(false)}
        >
          {inspector}
        </Drawer>
      ) : null}
    </main>
  );
}
