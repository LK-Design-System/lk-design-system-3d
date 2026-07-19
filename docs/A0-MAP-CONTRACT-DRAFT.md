# A0 — LK Map Contract 설계 초안 (DRAFT, 미승인)

> 상태: **검토용 초안.** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)의 M5-A와
> [ADR-0002](ADR-0002-DUAL-PATH-MAP-AUTHORING.md) A0을 실제 계약으로 고정하기 전
> 단계다. 이 문서 자체는 승인이 아니며, 아래 "열린 결정"이 정리되기 전 public
> API·JSON Schema로 승격하지 않는다. 좌표 규범은
> [SPATIAL_PRIMITIVES_GUIDE.md](SPATIAL_PRIMITIVES_GUIDE.md)의
> `Asset and coordinate boundary`를 따른다.

## 0. A0의 목적과 산출물

A0은 코드가 아니라 **계약**을 고정한다. 산출물은 다음 다섯 가지다.

1. 용어(canonical terms)와 identity 규칙.
2. `LK Map Document`의 JSON Schema 골격과 versioning.
3. Coordinate profile(계약 1의 기계 판독 표현).
4. Binding·provenance·adapter-capability 모델.
5. Golden serialization fixture 목록과 계약 test 진입점.

A0에서 **하지 않는 것**: 실제 renderer/authoring 구현, USD codec, native builder UI, reimport
3-way diff 구현. 이는 A1(unified model) 이후다. A0은 "무엇을 직렬화하고 무엇을 보존하는가"만
고정한다.

## 1. Story-local V2에서 승계 / 배제

현재 [apps/docs/src/map-editor-model.ts](../apps/docs/src/map-editor-model.ts)의
`MapEditorDocument`(schemaVersion 2)는 Story-local fixture다. A0은 이를 이름만 바꿔
승격하지 않는다.

| 항목 | V2 현재 | A0 결정 |
| --- | --- | --- |
| `structure`(site/building/level, box/cylinder primitive, asset) | 있음 | **승계**(core `SpatialStructure`가 정본 shape) |
| route = polyline(points·traversal·width) | 있음 | **재정의** → waypoint-edge **graph**(vertex 공유) |
| area = polygon(points·category) | 있음 | **승계**(vertex는 graph와 공유 후보) |
| goal(pose·radius·levelId) | 있음 | **승계** |
| wall | box primitive 반복 | **재정의** → polyline wall identity → 파생 mesh |
| door/opening, level transition(lift) | 없음 | **신규** |
| charger/dock | 없음 | **신규** |
| labels(`Record<string,string>`) | 있음 | 승계하되 i18n/의미 키 정책은 열린 결정 |
| source binding, reimport hash/diff | 없음 | **신규**(§6) |
| per-field ownership, tombstone, normalized base | 없음 | **신규**(§6) |
| provenance(source/derived) | 없음 | **신규**(§7) |
| serialize/parse/validate | 있음 | 계약을 golden fixture로 고정(§9) |

원칙: V2에서 **상호작용·직렬화로 검증된 shape만** 승계하고, 교환·소유권·provenance는
새로 정의한다. V2는 A1의 참고 자료이지 wire 계약이 아니다.

## 2. 용어 (canonical terms)

| 용어 | 정의 |
| --- | --- |
| `LK Map Document` | renderer-neutral 논리 계약. 하나의 JSON 파일명이 아니라 역할 분리(문서 identity·공간 기준·editable structure·robot semantics·external binding·derived output)를 가진 계약. |
| `LK Map Bundle` | 맵 교환용 논리 파일 묶음(manifest + map + scene + layers + derived). npm package 아님. |
| `EntityId` | 문서 내 안정 entity 식별자(core `EntityId`). durable identity의 기준. |
| durable binding | 외부 엔진이 유지하는 안정 ID(`lk:entityId` 등)에 묶인 결합. reimport에서 3-way diff의 기준. |
| weak(path-only) binding | scene-graph path/이름만으로 묶인 결합. rename/reparent 시 `remap-required`. durable identity 아님. |
| normalized base | 직전 import를 정규화한 기준 snapshot. reimport 3-way 비교의 base. |
| per-field ownership | 필드 단위 소유자(`source`/`web`) 기록. conflict 판정의 근거. |
| tombstone | 명시적 삭제 표식(누락된 weak binding과 구분). |
| coordinate profile | right-handed·Z-up·meter·radian, origin/frame, 2D reference·occupancy raster 좌표 규약(§5). |
| adapter capability | adapter가 선언하는 지원 계약(`import`/`reimport`/`bundle-read`/`bundle-write`/`source-writeback`/`derived-export` + schema/version). draft 스키마는 [schemas/adapter-capability.v1.draft.schema.json](schemas/adapter-capability.v1.draft.schema.json)이며 `derivedReverseImport`는 `const false`로 ADR 금지선을 강제한다. |
| derived output | GLB preview, level별 occupancy PNG/YAML. **비정본 cache**(authored source 아님). |

## 3. `LK Map Document` — JSON Schema 골격

버전은 `schemaVersion`(정수)로 고정하고, 하위 계약은 `$defs`로 분리한다. 아래는 **골격**이며
필드 세부는 열린 결정 이후 확정한다.

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lk-robotics.dev/schemas/lk-map-document/v1.json",
  "type": "object",
  "required": ["schemaVersion", "documentId", "coordinate", "structure"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "documentId": { "$ref": "#/$defs/entityId" },
    "name": { "type": "string" },

    "coordinate": { "$ref": "#/$defs/coordinateProfile" },   // §5

    "structure": {                                            // §4 — core SpatialStructure 승계
      "type": "object",
      "properties": {
        "sites":      { "type": "array", "items": { "$ref": "#/$defs/siteNode" } },
        "buildings":  { "type": "array", "items": { "$ref": "#/$defs/buildingNode" } },
        "levels":     { "type": "array", "items": { "$ref": "#/$defs/levelNode" } },
        "vertices":   { "type": "array", "items": { "$ref": "#/$defs/vertex" } },  // §10.2 공유 vertex pool
        "floors":     { "type": "array", "items": { "$ref": "#/$defs/floorPolygon" } },   // vertexIds[] 참조
        "walls":      { "type": "array", "items": { "$ref": "#/$defs/wallPolyline" } },    // vertexIds[] 참조
        "openings":   { "type": "array", "items": { "$ref": "#/$defs/opening" } },
        "transitions":{ "type": "array", "items": { "$ref": "#/$defs/levelTransition" } },
        "primitives": { "type": "array", "items": { "$ref": "#/$defs/primitiveNode" } },
        "assets":     { "type": "array", "items": { "$ref": "#/$defs/assetNode" } }
      }
    },

    "semantics": {                                            // §4 — robot semantics
      "type": "object",
      "properties": {
        "routeGraph": { "$ref": "#/$defs/waypointEdgeGraph" },
        "areas":      { "type": "array", "items": { "$ref": "#/$defs/area" } },
        "goals":      { "type": "array", "items": { "$ref": "#/$defs/goal" } },
        "chargers":   { "type": "array", "items": { "$ref": "#/$defs/charger" } },
        "docks":      { "type": "array", "items": { "$ref": "#/$defs/dock" } }
      }
    },

    "binding":    { "$ref": "#/$defs/externalBinding" },      // §6 (optional)
    "provenance": { "$ref": "#/$defs/provenance" },           // §7 (optional)

    "extensions": { "type": "object" },                       // §8 — namespaced product extension
    "x-unknown":  { "type": "object" }                        // §8 — 보존된 unknown source data
  }
}
```

핵심 결정:

- **structure vs semantics 분리.** geometry(structure)와 robot 의미(semantics)를 분리해
  파생 output(occupancy/GLB)이 어느 쪽에서 나오는지 명확히 한다.
- **wall은 polyline identity.** `wallPolyline`은 centerline vertices + thickness/height 속성이며,
  mesh는 파생물이다. box 반복 아님(ADR "Native Builder 범위" 준수).
- **route는 waypoint-edge graph.** `waypointEdgeGraph`는 공유 vertex + directed/undirected edge +
  방향·폭·제약. area/floor/wall이 같은 vertex를 참조할 수 있게 한다(RMF Traffic Editor 참조).

## 4. Editable structure + robot semantics (core 승계)

structure 노드는 core [packages/core/src/spatial-structure.ts](../packages/core/src/spatial-structure.ts)의
shape를 정본으로 승계한다: `SpatialNodeTransform`(sourceFrame/targetFrame/translation/rotation/scale),
site/building/level(elevationMeters)/primitive(role floor·wall·object, box·cylinder, PBR material
slots)/asset(assetId·bounds). A0이 core에 **추가로 정의**할 신규 계약:

- `floorPolygon` — level 소속 polygon boundary(현재 box floor 대체 후보).
- `wallPolyline` — centerline vertices + thickness/height, opening 부착점.
- `opening`(door) — wall 위 parametric 개구부(위치·폭·높이·kind).
- `levelTransition`(lift/stair) — level 간 연결(수직 이동 의미).
- `waypointEdgeGraph` — vertex(id·levelId·pose) + edge(from·to·direction·widthMeters·constraints).
- `charger`/`dock` — facility binding pose + 속성.

route/area draft·commit 상호작용은 이미 core
[spatial-authoring.ts](../packages/core/src/spatial-authoring.ts)의 point draft(polyline/polygon),
goal-pose drag, transform change 계약이 있으므로 A1에서 이 계약으로 model을 만든다.

## 5. Coordinate profile (계약 1의 기계 판독 표현)

`coordinateProfile`는 [SPATIAL_PRIMITIVES_GUIDE.md](SPATIAL_PRIMITIVES_GUIDE.md)의
`Asset and coordinate boundary`를 기계 판독 형태로 고정한다.

```jsonc
"coordinateProfile": {
  "handedness": "right",
  "up": "+Z", "forward": "+X",
  "unitsLength": "meter", "unitsAngle": "radian",
  "origin": { "frame": "<FrameId>", "position": [0,0,0], "orientation": [0,0,0,1] },

  "raster": {                          // 2D reference / occupancy raster (§10.4~10.6)
    "imageOrigin": "top-left",         // pixel (0,0), rowFromTop↓
    "gridRow0": "min-Y",               // occupancy cell row 0 = 최소 Y
    "rowFlip": "cell.row = heightCells - 1 - pixel.rowFromTop",
    "rosYamlOrigin": "lower-left",     // bottom-left cell, row-major
    "dataIndex": "row * width + column",
    "originYaw": 0.0,                   // ROS occupancy YAML origin[2] (radian)
    "negate": 0, "occupiedThresh": 0.65, "freeThresh": 0.196,
    "anchor": {                        // §10.4 — 2D reference 명시 필드
      "anchorPixel": [0, 0],           // [column, rowFromTop]
      "metersPerPixel": 0.05,
      "levelPose": { "frame": "<FrameId>", "position": [0,0,0], "orientation": [0,0,0,1] },
      "yaw": 0.0
    }
  }
}
```

계약 test는 `occupancyImagePixelToCell` / `occupancyCellToImagePixel` /
`occupancyCellDataIndex`(core [occupancy-grid.ts](../packages/core/src/occupancy-grid.ts))에 대해
image → level → image 및 cell ↔ dataIndex 왕복을 강제한다 —
[packages/core/tests/coordinate-profile.test.ts](../packages/core/tests/coordinate-profile.test.ts)가
이 profile을 property test로 고정한다(§9-2).

## 6. External binding & reimport 모델

```jsonc
"externalBinding": {
  "source": { "tool": "isaac|unreal|unity|...", "version": "...", "documentId": "...", "hash": "..." },
  "entities": [{
    "entityId": "<EntityId>",
    "kind": "durable | weak",
    "durableId": "lk:entityId:...",          // durable일 때
    "path": "/World/.../Prim",               // weak일 때 참조(remap-required 판정용)
    "fingerprint": "...",                    // entity/field fingerprint
    "fieldOwnership": { "<fieldPath>": "source | web" },
    "tombstone": false
  }],
  "normalizedBaseRef": "<hash|inline>"       // reimport 3-way base
}
```

- durable ID가 없고 path만 있으면 `weak`. rename/reparent로 path가 사라지면 삭제 확정이 아니라
  `remap-required`로 보낸다.
- reimport는 normalized base + 새 source를 3-way 비교해 add/change/delete/conflict를 만든다.
  같은 field를 source·web 모두 바꿨을 때만 conflict. **A0은 이 데이터 형태만 고정하고, diff
  알고리즘 구현은 A5다.**
- V1 Isaac/OpenUSD golden fixture 입력은 arbitrary mesh/name inference가 아니라 versioned LK
  mapping manifest + namespaced durable metadata다(ADR "도구별 우선순위" 준수).

## 7. Provenance (source/derived)

```jsonc
"provenance": {
  "derived": [{
    "artifact": "web-preview.glb | occupancy/<level>.png | occupancy/<level>.yaml",
    "sourceHash": "...", "generator": "name", "generatorVersion": "...",
    "exportProfile": "...", "params": { }
  }]
}
```

occupancy에는 최소 resolution, origin, level/Z range, collision source, occupied/free/unknown
threshold를 기록한다. derived artifact는 **비정본 cache**이며, source/toolchain/profile이 있을
때만 재현 가능하다고 판단한다(GLB·occupancy를 authored source로 되돌리지 않는다).

## 8. Extension / migration / unknown-field 정책

- **Extension:** 제품 확장은 `extensions`의 namespaced 키(`extensions["lk-web-viz"] = {…}`)에만
  둔다. 공통 계약을 오염시키지 않는다.
- **Unknown-field 보존:** import 시 인식 못 한 source data는 `x-unknown`에 보존하고 재직렬화 시
  손실 없이 되돌린다(무손실 round-trip은 §9 fixture로 강제).
- **Migration:** `schemaVersion` 상승 시 각 상위 버전으로의 forward migration 함수와 fixture를
  요구한다. 하위 호환 불가 변경은 major schema로 분기.

## 9. Golden serialization fixtures (A0이 승인할 목록)

A0 완료 조건은 다음 fixture와 계약 test의 승인이다(구현이 아니라 **fixture와 기대값** 고정).

1. **minimal-level** — 한 level + floor polygon + 하나의 polyline wall + waypoint-edge route.
   serialize → parse → 동일 canonical document(deterministic).
2. **coordinate-roundtrip** — anchor pixel → level pose → pixel 복원, cell ↔ dataIndex 왕복(§5).
3. **durable-binding** — durable ID 기반 entity + normalized base가 3-way add/change/delete를
   재현할 입력.
4. **weak-remap** — path-only binding이 rename 후 `remap-required`가 되는 입력.
5. **unknown-preservation** — `x-unknown` 무손실 round-trip.
6. **derived-provenance** — GLB/occupancy가 source/generator/profile과 함께 비정본으로 기록됨.

이 fixture들은 `@lk-robotics/design-system-3d-testing`(또는 신규 `3d-spatial`)의 계약 test에
바인딩한다. cross-package golden fixture는 개별 package test가 아니라 `testing` package로 승격한다
(핸드오프 부채 항목).

## 10. 결정 (제안 — A0 sign-off 대상)

아래는 스키마 shape를 확정하기 위한 제안 결정이다. 핸드오프상 A0은 승인 milestone이므로
최종 sign-off는 남아 있으나, 이 문서와 draft 스키마는 이 결정을 기준으로 작성한다.

1. **패키지 경계 — 신규 package 미생성.** A0은 계약-only이므로 `3d-spatial`을 만들지 않는다.
   draft 스키마는 [schemas/lk-map-document.v1.draft.schema.json](schemas/lk-map-document.v1.draft.schema.json),
   좌표 계약 test는 `core`, golden fixture는 `testing`에 둔다. A1의 runtime 승격 시점에
   `3d-spatial`로 이동·export한다. (근거: 조기 package 생성 = export/attw/publint/api-report gate
   churn without runtime value; 핸드오프의 "조기 승격 금지"와 일치.)
2. **공유 vertex table — 채택.** level별 공유 vertex pool을 두고 floor polygon·wall polyline·route
   graph·area가 vertex id를 참조한다(RMF Traffic Editor model, guide 인용과 일치). import된 독립
   vertex는 dedup 후보로 표시한다. → route는 vertex-edge graph, wall/floor/area는 같은 vertex를
   공유한다.
3. **wall↔floor — 공유 vertex 결합.** (2의 결과) polygon floor와 polyline wall은 공유 vertex를
   참조하며 독립 좌표를 중복 저장하지 않는다.
4. **anchor pixel — 명시 field.** 2D reference는 `anchorPixel`(pixel [column, rowFromTop]) +
   `metersPerPixel` + `levelPose` + `yaw`를 명시한다. origin을 pixel (0,0)에 암묵 정의하지 않는다.
5. **ROS YAML 세부 — profile에 포함.** coordinate profile의 `raster`에 `originYaw`, `negate`,
   `occupiedThresh`, `freeThresh`를 포함해 완결한다(A6로 미루지 않음).
6. **raster 타입 공유 — 채택.** tracing reference와 파생 occupancy는 하나의 `OccupancyGridGeometry`
   규약을 공유한다.
7. **manifest 명칭 — `$id` namespace로 확정.** `lk-map-document.v1`,
   `asset-manifest.v1`, bundle `manifest.json`을 `$id`
   (`https://schemas.lk-robotics.com/design-system-3d/…`)로 구분한다.
8. **labels — A0은 자유 문자열 유지.** 의미 키(i18n/역할) 계약 승격은 A1+로 유보한다.

## 11. 진행 순서와 현재 상태

1. §10 결정 확정 — **완료(제안)**, 이 문서에 반영.
2. `lk-map-document.v1` draft JSON Schema — 이 결정 기준으로 작성
   ([schemas/lk-map-document.v1.draft.schema.json](schemas/lk-map-document.v1.draft.schema.json)).
3. coordinate profile 계약 test를 core 좌표 함수에 바인딩 — **완료**
   ([packages/core/tests/coordinate-profile.test.ts](../packages/core/tests/coordinate-profile.test.ts)):
   image → level → image 및 cell ↔ dataIndex 왕복을 property test로 강제(계약 1의 기계 강제).
4. golden fixture 6종 — **완료.** minimal-level, durable-binding, weak-remap,
   unknown-preservation, derived-provenance를 [docs/schemas/fixtures/](schemas/fixtures/)에
   두고 [packages/core/tests/lk-map-document-schema.test.ts](../packages/core/tests/lk-map-document-schema.test.ts)가
   repo-native로 강제한다($ref 정합, 필수 필드, Contract 1 raster 상수, binding/provenance
   계약). 5종 모두 ajv(draft 2020-12)로 스키마 적합 확인, weak-without-path는 거부됨.
   coordinate-roundtrip은 §9-2 test가 담당(총 6종). A0 sign-off 시 fixture와 스키마를
   `testing`/`3d-spatial` package로 승격하고 손으로 쓴 validator를 추가한다.
5. **A1 착수(draft)** — unified production 모델
   [packages/core/src/lk-map-document.ts](../packages/core/src/lk-map-document.ts)를
   구현했다: 스키마를 미러링한 TS 타입 + `validateLKMapDocument`/`assertValidLKMapDocument`
   손 validator로, JSON Schema가 표현 못 하는 referential integrity(vertex/level/waypoint
   참조), ID 유일성, Contract 1 raster 상수, durable/weak binding 규칙을 강제한다.
   Story-local V2와 분리돼 있고, sign-off 전이라 `core` index로 **export하지 않으며**
   test가 직접 강제한다. sign-off 시 index export + `3d-spatial` 승격.
6. **A2 착수(draft, contract 층)** — dual-path 수렴을 계약 층에서 증명했다.
   [packages/core/src/lk-map-import.ts](../packages/core/src/lk-map-import.ts)의
   `normalizeIsaacReferenceMapping`이 declared-metadata Isaac 매핑 매니페스트
   ([schemas/fixtures/isaac-mapping.one-level.json](schemas/fixtures/isaac-mapping.one-level.json),
   versioned manifest + `lk:entityId` namespaced durable metadata — mesh/name inference
   아님)를 canonical document로 정규화하고, 그 structure·semantics가 native-authored
   minimal-level과 **동일**하며 durable binding만 추가됨을 test가 강제한다. 실제 USD
   파싱, Native Builder 제스처, derived GLB/occupancy 생성은 런타임 경계로 A2 이후다.
