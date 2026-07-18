# ADR-0001: LK Design System 3D 형제 저장소

| 항목 | 값 |
| --- | --- |
| 상태 | Accepted — Official Go |
| 작성일 | 2026-07-16 |
| 결정 대상 | LK Design System과 분리된 공식 범용 3D 플랫폼의 구축과 소유권 |

## 결정

`LK Design System 3D`를 별도 형제 저장소와 독립 release cadence를 가진
공식 범용 3D 플랫폼으로 즉시 구축한다.

이 결정은 플랫폼의 존속 여부를 향후 파일럿에서 다시 판단하지 않는다.
Control Full과 Web Viz의 첫 적용은 필수 rollout과 migration 검증이다.
검증 결과는 API, adapter, 순서와 지원 범위를 수정할 수 있지만 플랫폼 구축
결정 자체를 조건부 상태로 되돌리지 않는다.

새 저장소는 UI 디자인 시스템을 복제하지 않는다. D-1에서 실제 API를 확인한
LK Design System의 viewport frame(현재 문서의 가칭 `Scene3DFrame`)과
viewer/editor chrome을 사용하면서, 현재 Core가 의도적으로 소유하지 않는 좌표,
카메라, 자산, scene interaction과 renderer lifecycle 계약을 제공한다.
`Scene3DFrame`이 없거나 계약이 다르더라도 형제 저장소 결정은 바뀌지 않으며,
LDS additive change 또는 제품 composition으로 결합 방식을 교정한다.

### 조직 적용 원칙

- 신규 공통 3D foundation은 제품 내부에서 새로 만들기 전에 이 플랫폼에서
  제공하거나 확장한다.
- Control Full과 Web Viz는 동일 package release를 소비하고 제품별 fork를
  만들지 않는다.
- 제품별 차이는 core 조건문이 아니라 renderer 또는 product adapter로
  표현한다.
- 중복 좌표·카메라·asset·picking 구현은 release wave별로 제거한다.
- Platform Owner가 public API, 지원 matrix와 release를 소유하고 제품 owner가
  migration과 제품 성능 예산을 소유한다.

## 검토한 제품 기준점

- `LK-ROBOTICS/lkrobotics-control-full`
  - commit `de64d3c9b98eb9ce7aeaf7765035153492a57359`
  - 3D GLB 맵, 로봇·경로·작업·landmark, picking과 top view
- `LK-ROBOTICS/lk_web_viz`
  - commit `a984def117c05acd213f494cbb8a42e990595505`
  - PointCloud·TF·Marker, PCD 편집, 구조 GLB, 건물·층·사이트 장면,
    raw Three.js, React Three Fiber, WebGPU/WebGL, Rerun

상세 근거는 [PRODUCT_EVIDENCE.md](PRODUCT_EVIDENCE.md)에 기록한다.

## 문제

두 제품은 이미 Three.js와 React Three Fiber를 직접 사용하지만 공통 계약은
없다. 그 결과 다음 책임이 제품별로 다시 구현되고 있다.

- ROS/map/GLB/Three.js 좌표 변환
- Y-up과 Z-up 처리
- map origin, 축 부호와 회전 보정
- orbit, top, home, focus 카메라 동작
- GLB loading, bounds, scale과 model placement
- robot, goal, path, landmark 표현
- picking과 selection
- resize, dispose와 WebGL context-loss 처리
- grid, selection, warning 등 3D 전용 시각 의미

버전도 이미 갈라졌다.

| 의존성 | Control Full | Web Viz |
| --- | --- | --- |
| React | 18.3 | 19 |
| Three.js | 0.168 | 0.170 |
| React Three Fiber | 8 | 9 |
| Drei | 9 | 10 |

이 차이는 단순한 스타일 중복이 아니라 좌표 오류, 상호작용 불일치, GPU 자원
누수와 renderer 교체 비용으로 이어질 수 있다.

## 기존 LK Design System과의 경계

D-1에서 확인할 `Scene3DFrame` 또는 동등 viewport 계약은 다음을 LDS 책임으로
두는 것을 목표로 한다.

- viewport frame과 scene identity
- toolbar와 HUD 배치
- loading, stale, disconnected, error 상태 표현
- 접근 가능한 상태와 recovery 위치

반면 rendering, camera math, picking, scene hierarchy, transform gizmo와
renderer diagnostics는 제외한다. 새 저장소는 이 제외 영역의 공통 contract,
reference implementation과 renderer adapter를 담당한다.

```text
LK Design System Core
  viewport chrome · controls · state · accessibility
                    ↓
LK Design System 3D
  coordinates · camera · assets · scene primitives · lifecycle
                    ↓
Product
  live data · commands · authoring workflow · persistence · transport
```

## 비교한 대안

### 대안 A: 제품별 구현 유지

장점은 제품별 변경 속도가 빠르고 별도 패키지 호환성을 관리하지 않아도 된다는
점이다.

채택하지 않는 이유:

- 이미 두 번째 독립 소비자가 존재한다.
- 좌표와 camera 규칙이 제품 및 화면마다 갈라졌다.
- GLB, PointCloud, 건물 장면이 같은 저수준 문제를 반복 해결한다.
- renderer 버전 교체와 성능 대응 비용이 각 제품에 중복된다.

### 대안 B: 기존 LK Design System Core에 포함

채택하지 않는 이유:

- Three.js, R3F와 renderer adapter는 일반 UI 소비자에게 불필요한 무거운
  dependency다.
- Core의 renderer-independent 계약과 충돌한다.
- 3D 성능·GPU·asset 검증은 일반 컴포넌트와 다른 release cadence가 필요하다.

### 대안 C: Web Viz 내부 공용 모듈을 다른 제품이 복사

채택하지 않는 이유:

- Web Viz의 화면, store와 API schema에 foundation이 종속된다.
- 복사는 버전과 수정 사항을 다시 분기시킨다.
- Control의 React 18/R3F 8 호환 요구를 독립적으로 검증하기 어렵다.

### 대안 D: 별도 형제 저장소

선택한 대안이다. 무거운 dependency와 release를 Core에서 격리하면서도
제품 간 좌표·카메라·자산 계약을 한 곳에서 관리할 수 있다.

## 책임 범위

### 이 저장소가 소유

- 좌표계, 단위, handedness와 transform 타입
- ROS Z-up ↔ renderer convention 변환
- camera preset과 input behavior
- GLB asset metadata, bounds와 validation
- renderer-independent scene semantic token
- 공통 marker, path, selection 표현 계약
- renderer adapter의 mount, resize, dispose와 recovery
- golden fixture, visual/performance baseline

### LK Design System Core가 소유

- viewport 외곽 UI
- toolbar button, tooltip과 keyboard 접근성
- 상태·오류·freshness 표시
- panel, inspector와 editor shell
- 일반 color, spacing, typography와 motion token

### 제품이 계속 소유

- ROS, MQTT, WebSocket와 Rerun bridge transport
- command eligibility, 권한과 안전 정책
- task, map, building, facility의 업무 schema
- PCD 정리, mesh 생성, 저장과 job polling
- 완성 화면, route와 product store
- 제품별 데이터 freshness와 health 판정

## 플랫폼 배포 및 안정 release 기준

플랫폼 구축은 확정되어 있지만 beta와 `1.0` release에는 다음이 모두 필요하다.

1. Control Full과 Web Viz가 동일한 coordinate contract를 사용한다.
2. 두 제품에서 camera preset 하나 이상을 실제 화면에 적용한다.
3. golden fixture로 map point, robot pose와 GLB placement가 동일함을 검증한다.
4. 표준 React 19/R3F 9/Three 0.170 stack과 임시 R3F 8 compatibility 경로를
   CI로 검증하고 compatibility 제거 일정을 공개한다.
5. 검증된 LDS viewport frame과 결합해 loading/error/keyboard 경계를 보존한다.
6. 제품별 transport와 command가 공용 패키지로 유입되지 않는다.
7. rollout 전후 bundle, FPS, memory와 context-loss 지표가 악화되지 않는다.
8. 두 제품이 복사 없이 같은 패키지 release를 소비한다.

## 범위 및 구현 교정 조건

다음 문제가 발생하면 플랫폼을 폐기하지 않고 해당 API, adapter 또는 rollout
순서를 교정한다.

- public API가 Web Viz 또는 Control의 store/API 타입에 의존한다.
- renderer-independent core보다 R3F wrapper가 사실상 전체 API가 된다.
- 공용화가 좌표·성능 결함을 줄이지 못하고 제품 adapter만 복잡하게 만든다.
- Core와 3D 저장소가 동일한 toolbar, state 또는 panel을 중복 구현한다.
- compatibility adapter가 표준 stack 수렴을 지연시키는 영구 지원층이 된다.
- 제품 migration이 지연되면 별도 구현을 허용하지 않고 owner와 release
  milestone을 재조정한다.

## 결과

별도 저장소는 bundle과 release 경계를 명확히 하고 교차 제품 3D 규칙을
검증하고 배포할 단일 플랫폼을 만든다. 초기에는 contract, fixture, adapter와
제품 migration에 비용이 집중되지만, 두 개의 독립 제품과 서로 다른 renderer
구성이 이미 존재하므로 기다리는 비용이 구축 비용보다 크다고 판단한다.
