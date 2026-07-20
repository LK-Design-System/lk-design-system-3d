import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout as delayTimer } from "node:timers/promises";
import { URL } from "node:url";

const root = process.cwd();
const storybookDirectory = resolve(root, "storybook-static");
const visualEvidenceDirectory = resolve(root, "evidence", "visual-alpha");
const evidenceDirectory = resolve(root, "evidence", "visual-alpha", "runtime-qa");
const fetchUrl = globalThis.fetch;
const WebSocketConstructor = globalThis.WebSocket;

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
});

function delay(milliseconds) {
  return delayTimer(milliseconds);
}

async function writeEvidenceFile(file, contents) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await writeFile(file, contents);
      return;
    } catch (error) {
      lastError = error;
      await delay(150 * (attempt + 1));
    }
  }
  throw lastError;
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : undefined;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (port === undefined) throw new Error("Failed to allocate a local port.");
  return port;
}

async function startStaticServer() {
  const base = resolve(storybookDirectory);
  const server = createHttpServer(async (request, response) => {
    try {
      const rawPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const relativePath = decodeURIComponent(rawPath === "/" ? "/index.html" : rawPath);
      let filePath = resolve(base, `.${relativePath}`);
      if (filePath !== base && !filePath.startsWith(`${base}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
      const body = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Static server did not expose a TCP address.");
  }
  return { server, origin: `http://127.0.0.1:${address.port.toString()}` };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (chrome === undefined) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a Chromium executable.");
  }
  return chrome;
}

async function waitForTarget(debugPort, urlFragment) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetchUrl(`http://127.0.0.1:${debugPort.toString()}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" &&
          typeof candidate.url === "string" &&
          candidate.url.includes(urlFragment) &&
          typeof candidate.webSocketDebuggerUrl === "string",
      );
      if (target !== undefined) return target;
    } catch {
      // Chrome can accept the process spawn before its debugger endpoint is ready.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the Visual Alpha Chrome target.");
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      globalThis.clearTimeout(pending.timeout);
      if (message.error !== undefined) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result ?? {});
    });
    const rejectPending = () => {
      for (const [id, pending] of this.pending) {
        globalThis.clearTimeout(pending.timeout);
        pending.reject(new Error(`CDP socket closed before command ${id.toString()} completed.`));
      }
      this.pending.clear();
    };
    socket.addEventListener("close", rejectPending);
    socket.addEventListener("error", rejectPending);
  }

  static async connect(url) {
    const socket = new WebSocketConstructor(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveCommand, rejectCommand) => {
      const timeout = globalThis.setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error(`Timed out waiting for CDP ${method}.`));
      }, 15_000);
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? "Runtime evaluation failed.");
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

function trace(label) {
  process.stderr.write(`[visual-alpha-runtime-qa] ${label}\n`);
}

async function waitFor(client, expression, label, timeoutMilliseconds = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function navigate(client, url, requireModels = true) {
  await client.send("Page.navigate", { url });
  await waitFor(
    client,
    `document.readyState === "complete" && document.querySelector("canvas") !== null`,
    `canvas at ${url}`,
  );
  if (requireModels) {
    await waitFor(
      client,
      `performance.getEntriesByType("resource").filter((entry) => /\\.glb(?:$|\\?)/u.test(entry.name)).length >= 5`,
      `GLB resources at ${url}`,
    );
  }
  await delay(700);
}

async function capture(client, name, mirrorName) {
  const response = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  const bytes = Buffer.from(response.data, "base64");
  const file = join(evidenceDirectory, `${name}.png`);
  const mirrorFile =
    mirrorName === undefined ? undefined : join(visualEvidenceDirectory, mirrorName);
  await Promise.all([
    writeEvidenceFile(file, bytes),
    ...(mirrorFile === undefined ? [] : [writeEvidenceFile(mirrorFile, bytes)]),
  ]);
  return {
    file,
    ...(mirrorFile === undefined ? {} : { mirrorFile }),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function clickButton(client, label) {
  const clicked = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) =>
        candidate.getAttribute("aria-label") === ${JSON.stringify(label)} ||
        candidate.textContent?.trim() === ${JSON.stringify(label)},
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Button ${label} was not found.`);
  await waitFor(
    client,
    `[...document.querySelectorAll("button")].some((button) =>
      (button.getAttribute("aria-label") === ${JSON.stringify(label)} ||
        button.textContent?.trim() === ${JSON.stringify(label)}) &&
      (button.getAttribute("aria-checked") === "true" ||
        button.getAttribute("aria-pressed") === "true"))`,
    `${label} camera state`,
  );
  await delay(1_600);
}

async function movePointer(client, x, y) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    button: "none",
    buttons: 0,
    pointerType: "mouse",
    x,
    y,
  });
  await delay(60);
}

async function clickPointer(client, x, y) {
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
    type: "mousePressed",
    x,
    y,
  });
  await delay(48);
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    pointerType: "mouse",
    type: "mouseMoved",
    x,
    y,
  });
  await delay(48);
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
    type: "mouseReleased",
    x,
    y,
  });
  await delay(400);
}

async function setViewport(client, width, height = 900) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(450);
}

async function inspectResponsiveLayout(client, width, expectedLayout) {
  await setViewport(client, width);
  await waitFor(
    client,
    `document.querySelector('[data-layout=${JSON.stringify(expectedLayout)}]') !== null`,
    `${expectedLayout} layout at ${width.toString()}px`,
  );
  return client.evaluate(`(() => {
    const root = document.querySelector("[data-lds3d-composition]");
    const workspace = root?.querySelector("[data-visual-workspace]");
    const frame = root?.querySelector("[data-lds-viewer-frame]");
    const canvas = root?.querySelector("canvas");
    const inspector = root?.querySelector('[aria-label="선택 객체 세부 정보"]');
    const dock = root?.querySelector("[data-visual-inspector-dock]");
    const toolbar = root?.querySelector('[role="toolbar"][aria-label="카메라와 뷰포트 제어"]');
    const hud = root?.querySelector("[data-viewer-hud]");
    const legend = root?.querySelector(".visual-scene-legend");
    const status = root?.querySelector("[data-viewer-status]");
    const dockToggle = [...(root?.querySelectorAll("button[aria-expanded]") ?? [])].find(
      (button) => button.getAttribute("aria-label")?.startsWith("선택 객체 세부 정보"),
    );
    const drawerTrigger = [...(root?.querySelectorAll("button") ?? [])].find(
      (button) => button.getAttribute("aria-label") === "선택 객체 세부 정보 열기",
    );
    const rect = (element) => {
      if (!(element instanceof Element)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const overlapArea = (first, second) => {
      if (first === null || second === null) return 0;
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height;
    };
    const workspaceRect = rect(workspace);
    const frameRect = rect(frame);
    const canvasRect = rect(canvas);
    const inspectorRect = rect(inspector);
    const toolbarRect = rect(toolbar);
    const hudRect = rect(hud);
    const legendRect = rect(legend);
    const statusRect = rect(status);
    const workspaceStyle = workspace instanceof Element ? getComputedStyle(workspace) : null;
    const frameStyle = frame instanceof Element ? getComputedStyle(frame) : null;
    const dockStyle = dock instanceof Element ? getComputedStyle(dock) : null;
    const selectionLabel = [...(hud?.querySelectorAll("span") ?? [])].find(
      (candidate) => candidate.textContent?.trim() === "선택",
    );
    const selectionItemRect = rect(selectionLabel?.parentElement);
    const insideFrame = (candidate) =>
      candidate !== null &&
      frameRect !== null &&
      candidate.left >= frameRect.left - 1 &&
      candidate.right <= frameRect.right + 1 &&
      candidate.top >= frameRect.top - 1 &&
      candidate.bottom <= frameRect.bottom + 1;
    const insideWorkspace = (candidate) =>
      candidate !== null &&
      workspaceRect !== null &&
      candidate.left >= workspaceRect.left - 1 &&
      candidate.right <= workspaceRect.right + 1 &&
      candidate.top >= workspaceRect.top - 1 &&
      candidate.bottom <= workspaceRect.bottom + 1;
    return {
      width: ${width.toString()},
      innerWidth: window.innerWidth,
      layout: root?.querySelector("[data-layout]")?.getAttribute("data-layout") ?? null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      dockToggle: dockToggle !== undefined,
      drawerTrigger: drawerTrigger !== undefined,
      workspaceRect,
      frameRect,
      canvasRect,
      inspectorRect,
      viewportToInspectorRatio:
        frameRect === null || inspectorRect === null || inspectorRect.width === 0
          ? null
          : frameRect.width / inspectorRect.width,
      inspectorInsideWorkspace: insideWorkspace(inspectorRect),
      inspectorOverlaysFrame:
        ${JSON.stringify(expectedLayout)} !== "wide" ||
        (workspaceRect !== null &&
          frameRect !== null &&
          inspectorRect !== null &&
          inspectorRect.left < frameRect.right - 1 &&
          inspectorRect.top <= frameRect.top + 1 &&
          inspectorRect.bottom >= frameRect.bottom - 1),
      frameInsideWorkspace: insideWorkspace(frameRect),
      workspaceOwnsOverlayContext:
        ${JSON.stringify(expectedLayout)} === "wide"
          ? (workspaceStyle !== null &&
              dockStyle !== null &&
              workspaceStyle.position === "relative" &&
              dockStyle.position === "absolute")
          : null,
      frameVariant: frame instanceof Element ? frame.getAttribute("data-viewer-variant") : null,
      frameHasStandalonePerimeter:
        frameStyle !== null &&
        frame?.getAttribute("data-viewer-variant") === "standalone" &&
        Number.parseFloat(frameStyle.borderTopWidth) >= 1 &&
        Number.parseFloat(frameStyle.borderRightWidth) >= 1 &&
        Number.parseFloat(frameStyle.borderBottomWidth) >= 1 &&
        Number.parseFloat(frameStyle.borderLeftWidth) >= 1 &&
        Number.parseFloat(frameStyle.borderTopLeftRadius) > 0 &&
        Number.parseFloat(frameStyle.borderTopRightRadius) > 0 &&
        Number.parseFloat(frameStyle.borderBottomRightRadius) > 0 &&
        Number.parseFloat(frameStyle.borderBottomLeftRadius) > 0,
      frameSharesWorkspaceBounds:
        ${JSON.stringify(expectedLayout)} === "wide"
          ? (workspaceRect !== null &&
              frameRect !== null &&
              frameRect.left <= workspaceRect.left + 1 &&
              frameRect.top <= workspaceRect.top + 1 &&
              frameRect.right >= workspaceRect.right - 1 &&
              frameRect.bottom >= workspaceRect.bottom - 1)
          : null,
      panelAlignsWorkspaceEdge:
        ${JSON.stringify(expectedLayout)} === "wide"
          ? (workspaceRect !== null &&
              inspectorRect !== null &&
              Math.abs(inspectorRect.right - workspaceRect.right) <= 1 &&
              inspectorRect.top <= workspaceRect.top + 1 &&
              inspectorRect.bottom >= workspaceRect.bottom - 1)
          : null,
      canvasInsideFrame: insideFrame(canvasRect),
      canvasPreservesViewport:
        ${JSON.stringify(expectedLayout)} !== "wide" ||
        canvasRect === null ||
        frameRect === null ||
        Math.abs(canvasRect.width - frameRect.width) <= 4,
      canvasPixelRatio:
        canvas instanceof HTMLCanvasElement && canvasRect !== null && canvasRect.width > 0
          ? canvas.width / canvasRect.width
          : null,
      canvasCssPixels:
        canvasRect === null ? null : Math.round(canvasRect.width * canvasRect.height),
      canvasBackingPixels:
        canvas instanceof HTMLCanvasElement ? canvas.width * canvas.height : null,
      toolbarInsideFrame: insideFrame(toolbarRect),
      toolbarHudOverlapArea: overlapArea(toolbarRect, hudRect),
      toolbarPanelOverlapArea: overlapArea(toolbarRect, inspectorRect),
      framePanelOverlapArea: overlapArea(frameRect, inspectorRect),
      panelOverlaysCanvas: overlapArea(canvasRect, inspectorRect) > 0,
      selectionStatusFullyVisible:
        selectionItemRect !== null &&
        hudRect !== null &&
        selectionItemRect.left >= hudRect.left - 1 &&
        selectionItemRect.right <= hudRect.right + 1,
      legendInsideFrame: insideFrame(legendRect),
      legendStatusOverlapArea: overlapArea(legendRect, statusRect),
      legendPanelOverlapArea: overlapArea(legendRect, inspectorRect),
    };
  })()`);
}

async function verifyResponsiveComposition(client) {
  const wide992 = await inspectResponsiveLayout(client, 992, "wide");
  const dockToggleCollapsed = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll("button[aria-expanded]")].find(
      (candidate) => candidate.getAttribute("aria-label")?.startsWith("선택 객체 세부 정보"),
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!dockToggleCollapsed) throw new Error("Wide DockPanel toggle was not found.");
  await waitFor(
    client,
    `document.querySelector('button[aria-expanded][aria-label^="선택 객체 세부 정보"]')?.getAttribute("aria-expanded") === "false"`,
    "wide DockPanel collapsed",
  );
  await waitFor(
    client,
    `(() => {
      const workspace = document.querySelector("[data-visual-workspace]");
      const handle = document.querySelector(
        'button[aria-expanded][aria-label^="선택 객체 세부 정보"]',
      );
      if (!(workspace instanceof Element) || !(handle instanceof Element)) return false;
      return Math.abs(handle.getBoundingClientRect().right - workspace.getBoundingClientRect().right) <= 1;
    })()`,
    "wide DockPanel collapse transition",
  );
  const collapsedDock = await client.evaluate(`(() => {
    const workspace = document.querySelector("[data-visual-workspace]");
    const frame = document.querySelector("[data-lds-viewer-frame]");
    const handle = document.querySelector(
      'button[aria-expanded][aria-label^="선택 객체 세부 정보"]',
    );
    if (!(workspace instanceof Element) || !(frame instanceof Element) || !(handle instanceof Element)) return null;
    const workspaceRect = workspace.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    return {
      workspaceRect: {
        left: workspaceRect.left,
        right: workspaceRect.right,
        top: workspaceRect.top,
        bottom: workspaceRect.bottom,
      },
      frameRect: {
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
        bottom: frameRect.bottom,
      },
      handleRect: {
        left: handleRect.left,
        right: handleRect.right,
        top: handleRect.top,
        bottom: handleRect.bottom,
      },
      handleInsideWorkspace:
        handleRect.left >= workspaceRect.left - 1 &&
        handleRect.right <= workspaceRect.right + 1 &&
        handleRect.top >= workspaceRect.top - 1 &&
        handleRect.bottom <= workspaceRect.bottom + 1,
      handleAtWorkspaceDockEdge: Math.abs(handleRect.right - workspaceRect.right) <= 1,
    };
  })()`);
  const dockToggleReopened = await client.evaluate(`(() => {
    const button = document.querySelector(
      'button[aria-expanded][aria-label^="선택 객체 세부 정보"]',
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!dockToggleReopened) throw new Error("Wide DockPanel could not be reopened.");
  await waitFor(
    client,
    `document.querySelector('button[aria-expanded][aria-label^="선택 객체 세부 정보"]')?.getAttribute("aria-expanded") === "true"`,
    "wide DockPanel reopened",
  );
  const dockWidthResized = await client.evaluate(`(() => {
    const resizeHandle = document.querySelector('[role="separator"][aria-orientation="vertical"]');
    if (!(resizeHandle instanceof HTMLElement)) return null;
    resizeHandle.focus();
    return resizeHandle.getAttribute("aria-valuenow");
  })()`);
  if (dockWidthResized === null) throw new Error("Wide DockPanel resize handle was not found.");
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowLeft",
    code: "ArrowLeft",
    windowsVirtualKeyCode: 37,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowLeft",
    code: "ArrowLeft",
    windowsVirtualKeyCode: 37,
  });
  await waitFor(
    client,
    `document.querySelector('[role="separator"][aria-orientation="vertical"]')?.getAttribute("aria-valuenow") !== ${JSON.stringify(dockWidthResized)}`,
    "wide DockPanel resize",
  );
  const wide992Resized = await inspectResponsiveLayout(client, 992, "wide");
  const narrow800 = await inspectResponsiveLayout(client, 800, "narrow");
  const drawerOpened = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === "선택 객체 세부 정보 열기",
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!drawerOpened) throw new Error("Narrow inspector trigger was not found.");
  await waitFor(
    client,
    `document.querySelector('[aria-modal="true"]') !== null`,
    "narrow LDS Drawer open",
  );
  await setViewport(client, 992);
  await waitFor(
    client,
    `document.querySelector('[data-layout="wide"]') !== null`,
    "wide layout after an open Drawer",
  );
  await setViewport(client, 800);
  await waitFor(
    client,
    `document.querySelector('[data-layout="narrow"]') !== null`,
    "narrow layout after wide round trip",
  );
  const drawerReopenedAfterRoundTrip = await client.evaluate(
    `document.querySelector('[aria-modal="true"]') !== null`,
  );
  const narrow320 = await inspectResponsiveLayout(client, 320, "narrow");
  const capture320 = await capture(client, "responsive-320");
  await setViewport(client, 1440);
  await waitFor(
    client,
    `document.querySelector('[data-layout="wide"]') !== null`,
    "restored 1440px wide layout",
  );
  return {
    wide992,
    wide992Resized,
    collapsedDock,
    narrow800,
    narrow320,
    drawerOpened,
    drawerReopenedAfterRoundTrip,
    capture320,
  };
}

async function verifyHoverAndSelection(client) {
  const canvasRect = await client.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  if (canvasRect === null) throw new Error("WebGL canvas bounds were not found.");
  const labelContractPresent = await client.evaluate(
    `document.querySelector("[data-visual-world-label-title]") !== null`,
  );
  if (!labelContractPresent) {
    throw new Error("Visual world labels are missing their stable QA title contract.");
  }
  await client.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    window.__lds3dPointerProbe = { clicks: [], mousemove: 0, pointermove: 0 };
    canvas.addEventListener("mousemove", () => { window.__lds3dPointerProbe.mousemove += 1; });
    canvas.addEventListener("pointermove", () => { window.__lds3dPointerProbe.pointermove += 1; });
    canvas.addEventListener("click", (event) => {
      window.__lds3dPointerProbe.clicks.push({
        clientX: event.clientX,
        clientY: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      });
    });
    return true;
  })()`);
  await movePointer(client, Math.max(0, canvasRect.left - 8), Math.max(0, canvasRect.top - 8));
  const preferredRatios = [
    [0.52, 0.29],
    [0.63, 0.32],
    [0.34, 0.46],
    [0.47, 0.5],
    [0.72, 0.62],
  ];
  const denseRegions = [
    { x: [0.47, 0.57], y: [0.26, 0.45] },
    { x: [0.58, 0.68], y: [0.31, 0.52] },
    { x: [0.27, 0.4], y: [0.42, 0.65] },
    { x: [0.4, 0.52], y: [0.49, 0.79] },
    { x: [0.7, 0.78], y: [0.59, 0.8] },
  ];
  const denseRatios = denseRegions.flatMap((region) => {
    const ratios = [];
    for (let y = region.y[0]; y <= region.y[1]; y += 0.012) {
      for (let x = region.x[0]; x <= region.x[1]; x += 0.008) ratios.push([x, y]);
    }
    return ratios;
  });
  const xRatios = [0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76];
  const yRatios = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const candidates = [
    ...preferredRatios,
    ...denseRatios,
    ...yRatios.flatMap((yRatio) => xRatios.map((xRatio) => [xRatio, yRatio])),
  ].map(([xRatio, yRatio]) => [
    Math.round(canvasRect.left + canvasRect.width * xRatio),
    Math.round(canvasRect.top + canvasRect.height * yRatio),
  ]);
  let hoverLabel;
  let hoverPoint;
  const pointerProbes = [];
  for (const [x, y] of candidates) {
    await movePointer(client, x, y);
    const probe = await client.evaluate(`(() => {
      const labels = [...document.querySelectorAll("[data-visual-world-label-title]")]
        .map((candidate) => candidate.getAttribute("data-visual-world-label-title")?.trim())
        .filter(Boolean);
      const target = document.elementFromPoint(${x.toString()}, ${y.toString()});
      return {
        label: labels.find((candidate) => /^(?:랙|팔레트|화물|충전|안전)/u.test(candidate)) ?? null,
        labels,
        pointerEvents: window.__lds3dPointerProbe,
        target:
          target instanceof Element
            ? target.tagName + "." + String(target.className)
            : null,
      };
    })()`);
    pointerProbes.push({ point: [x, y], ...probe });
    if (typeof probe.label === "string") {
      hoverLabel = probe.label;
      hoverPoint = [x, y];
      break;
    }
  }
  if (hoverPoint === undefined) {
    throw new Error(
      `WebGL hover did not expose an entity label: ${JSON.stringify({ canvasRect, probeCount: pointerProbes.length, pointerProbes: pointerProbes.slice(0, 12) })}`,
    );
  }
  const selectionExpression = `(() => {
    const inspector = document.querySelector('[aria-label="선택 객체 세부 정보"]')?.textContent ?? "";
    return !inspector.includes("robot/amr-01") && /(?:rack|pallet|cargo|dock|safety)\\//u.test(inspector);
  })()`;
  const selectionOffsets = [
    [0, 0],
    [-12, 0],
    [12, 0],
    [0, -12],
    [0, 12],
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
  ];
  let selectionPoint;
  for (const [offsetX, offsetY] of selectionOffsets) {
    const point = [hoverPoint[0] + offsetX, hoverPoint[1] + offsetY];
    await movePointer(client, point[0], point[1]);
    await clickPointer(client, point[0], point[1]);
    try {
      await waitFor(
        client,
        selectionExpression,
        "WebGL selection to update the LDS inspector",
        900,
      );
      selectionPoint = point;
      break;
    } catch {
      // Hover labels can settle one pointer event behind the physical model.
    }
  }
  if (selectionPoint === undefined) {
    const selectionDebug = await client.evaluate(`(() => {
      const target = document.elementFromPoint(${hoverPoint[0].toString()}, ${hoverPoint[1].toString()});
      return {
        inspector: document.querySelector('[aria-label="선택 객체 세부 정보"]')?.innerText ?? "",
        pointerEvents: window.__lds3dPointerProbe,
        target:
          target instanceof Element
            ? target.tagName + "." + String(target.className)
            : null,
      };
    })()`);
    throw new Error(
      `WebGL selection did not update the LDS inspector: ${JSON.stringify({
        hoverPoint,
        pointerProbes: pointerProbes.slice(-3),
        selectionDebug,
      })}`,
    );
  }
  const inspectorText = await client.evaluate(
    `document.querySelector('[aria-label="선택 객체 세부 정보"]')?.innerText ?? ""`,
  );
  return {
    hoverLabel,
    hoverPoint,
    inspectorText,
    pointerEventCount: pointerProbes.at(-1)?.pointerEvents?.pointermove ?? 0,
    selectionPoint,
  };
}

async function verifyRuntimeStates(client, url) {
  await navigate(client, url, false);
  const result = {};
  result.selectionClearActionHidden = await client.evaluate(
    `![...document.querySelectorAll("button")].some((button) => button.getAttribute("aria-label") === "선택 해제" || button.textContent?.trim() === "선택 해제")`,
  );
  result.loading = await client.evaluate(
    `document.body.innerText.includes("3D 장면 준비 중 · 58%") && document.querySelector('[data-viewer-state="loading"]') !== null`,
  );
  for (const state of ["empty", "error"]) {
    const changed = await client.evaluate(`(() => {
      const group = document.querySelector('[aria-label="렌더러 상태"]');
      const label = ${JSON.stringify(state)} === "empty" ? "빈 상태" : "오류";
      const button = [...(group?.querySelectorAll("button") ?? [])]
        .find((candidate) => candidate.textContent?.trim() === label);
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!changed) throw new Error("Renderer state selector was not found.");
    const expected = state === "empty" ? "공간 객체 없음" : "자산 로딩 실패";
    await waitFor(
      client,
      `document.body.innerText.includes(${JSON.stringify(expected)})`,
      `${state} renderer state`,
    );
    if (state === "empty") {
      await waitFor(
        client,
        `(() => {
          const inspector = document.querySelector('[aria-label="선택 객체 세부 정보"]')?.textContent ?? "";
          const status = document.querySelector('[data-testid="lds-viewport-status"]')?.textContent ?? "";
          return !inspector.includes("AMR 01")
            && status.includes("선택")
            && status.includes("0")
            && document.querySelectorAll('[data-visual-world-label-title]').length === 0
            && document.querySelector('[data-viewer-state="no-source"]') !== null;
        })()`,
        "empty renderer selection, details, and scene state",
      );
    }
    result[state] = true;
  }
  const retried = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="renderer-retry-action"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.dataset.runtimeQaFocusTarget = "";
    button.focus();
    button.click();
    return true;
  })()`);
  if (!retried) throw new Error("Retry renderer action was not found.");
  await waitFor(
    client,
    `(() => {
      const button = document.querySelector('[data-testid="renderer-retry-action"]');
      return button instanceof HTMLButtonElement
        && button.hasAttribute("data-runtime-qa-focus-target")
        && button.getAttribute("aria-disabled") === "true"
        && document.activeElement === button
        && document.body.innerText.includes("렌더러 재시도 중 · 32%")
        && !document.body.innerText.includes("자산 로딩 실패")
        && document.querySelector('[data-viewer-state="loading"]') !== null;
    })()`,
    "renderer retrying focus and progress",
  );
  result.retrying = true;
  await waitFor(
    client,
    `(() => {
      const frame = document.querySelector('[data-viewer-state="live"]');
      const active = document.activeElement;
      return !document.body.innerText.includes("자산 로딩 실패")
        && frame !== null
        && document.querySelector('[data-testid="renderer-retry-action"]') === null
        && active instanceof HTMLElement
        && active !== document.body
        && frame.querySelector('[data-viewer-toolbar]')?.contains(active) === true;
    })()`,
    "renderer recovery",
  );
  result.retry = true;
  return result;
}

async function chooseSegment(client, groupLabel, optionLabel, expectedEntityId) {
  const changed = await client.evaluate(`(() => {
    const group = document.querySelector('[aria-label=${JSON.stringify(groupLabel)}]');
    const button = [...(group?.querySelectorAll("button") ?? [])]
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(optionLabel)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!changed) throw new Error(`${groupLabel} option ${optionLabel} was not found.`);
  await waitFor(
    client,
    `(() => {
      const group = document.querySelector('[aria-label=${JSON.stringify(groupLabel)}]');
      const active = [...(group?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent?.trim() === ${JSON.stringify(optionLabel)});
      const inspector = document.querySelector('[aria-label="선택 객체 세부 정보"]')?.textContent ?? "";
      return active?.getAttribute("aria-checked") === "true" && inspector.includes(${JSON.stringify(expectedEntityId)});
    })()`,
    `${groupLabel} ${optionLabel} inspector sync`,
  );
}

async function verifyGoalPathControls(client, url) {
  await navigate(client, url);
  await chooseSegment(client, "경로 상태", "차단됨", "path/amr-03/blocked");
  const pathInspector = await client.evaluate(
    `document.querySelector('[aria-label="선택 객체 세부 정보"]')?.innerText ?? ""`,
  );
  await chooseSegment(client, "목표 상태", "유효하지 않음", "goal/invalid-preview");
  const goalInspector = await client.evaluate(
    `document.querySelector('[aria-label="선택 객체 세부 정보"]')?.innerText ?? ""`,
  );
  return {
    path: pathInspector.includes("차단된 경로") && pathInspector.includes("경유점 3개"),
    goal:
      goalInspector.includes("유효하지 않은 목표 미리보기") &&
      goalInspector.includes("거부됨 · 장애물 안전거리"),
    pathInspector,
    goalInspector,
  };
}

async function main() {
  await stat(join(storybookDirectory, "index.html"));
  await Promise.all([
    mkdir(visualEvidenceDirectory, { recursive: true }),
    mkdir(evidenceDirectory, { recursive: true }),
  ]);
  const { server, origin } = await startStaticServer();
  trace(`static server ready at ${origin}`);
  const debugPort = await freePort();
  const userDataDirectory = await mkdtemp(join(tmpdir(), "lkds3d-runtime-qa-"));
  const operationalUrl = `${origin}/iframe.html?id=visual-alpha--operational-neutral&viewMode=story`;
  const browserStderr = [];
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-features=Translate,OptimizationHints,MediaRouter,SkiaGraphite",
      "--disable-gpu-sandbox",
      "--disable-gpu-shader-disk-cache",
      "--enable-logging=stderr",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--ignore-gpu-blocklist",
      "--no-default-browser-check",
      "--no-first-run",
      `--remote-debugging-port=${debugPort.toString()}`,
      "--remote-allow-origins=*",
      "--use-angle=swiftshader-webgl",
      `--user-data-dir=${userDataDirectory}`,
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  chrome.stderr?.on("data", (chunk) => {
    browserStderr.push(String(chunk));
    if (browserStderr.length > 40) browserStderr.shift();
  });

  let client;
  let report;
  try {
    const target = await waitForTarget(debugPort, "about:blank");
    trace("headless Chrome target ready");
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    trace("Page domain enabled");
    await client.send("Runtime.enable");
    trace("Runtime domain enabled");
    await client.send("Page.bringToFront");
    trace("headless page brought to front");
    await navigate(client, operationalUrl);
    trace("operational scene loaded");

    const operational = await client.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      const context = canvas instanceof HTMLCanvasElement
        ? (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
        : null;
      const viewerFrame = document.querySelector("[data-lds-viewer-frame]");
      const inspector = document.querySelector('[aria-label="선택 객체 세부 정보"]');
      const sceneLegend = document.querySelector(".visual-scene-legend");
      const workspace = document.querySelector("[data-visual-workspace]");
      const inspectorDock = document.querySelector("[data-visual-inspector-dock]");
      const viewerRect = viewerFrame?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const inspectorRect = inspector?.getBoundingClientRect();
      const legendRect = sceneLegend?.getBoundingClientRect();
      const workspaceRect = workspace?.getBoundingClientRect();
      const viewerStyle = viewerFrame instanceof Element ? getComputedStyle(viewerFrame) : null;
      const workspaceStyle = workspace instanceof Element ? getComputedStyle(workspace) : null;
      const inspectorDockStyle = inspectorDock instanceof Element ? getComputedStyle(inspectorDock) : null;
      const rendererHost = canvas?.closest('[role="application"]');
      const compositionRoot = document.querySelector("[data-lds3d-composition]");
      const cameraToolbar = compositionRoot?.querySelector(
        '[role="toolbar"][aria-label="카메라와 뷰포트 제어"]',
      );
      const lastCameraButton = [...(cameraToolbar?.querySelectorAll("button") ?? [])].at(-1);
      const dockPanelToggle = [...(compositionRoot?.querySelectorAll("button") ?? [])].find(
        (button) =>
          button.hasAttribute("aria-expanded") &&
          button.getAttribute("aria-label")?.startsWith("선택 객체 세부 정보"),
      );
      const lastCameraRect = lastCameraButton?.getBoundingClientRect();
      const dockPanelToggleRect = dockPanelToggle?.getBoundingClientRect();
      const headingLevels = [...(compositionRoot?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? [])]
        .map((heading) => heading.tagName);
      const inspectorInsideWorkspace =
        workspaceRect !== undefined &&
        inspectorRect !== undefined &&
        inspectorRect.left >= workspaceRect.left - 1 &&
        inspectorRect.right <= workspaceRect.right + 1 &&
        inspectorRect.top >= workspaceRect.top - 1 &&
        inspectorRect.bottom <= workspaceRect.bottom + 1;
      const inspectorOverlaysViewport =
        viewerRect !== undefined &&
        inspectorRect !== undefined &&
        workspaceRect !== undefined &&
        inspectorRect.left < viewerRect.right - 1 &&
        inspectorRect.top <= viewerRect.top + 1 &&
        inspectorRect.bottom >= viewerRect.bottom - 1;
      const panelAlignsWorkspaceEdge =
        workspaceRect !== undefined &&
        inspectorRect !== undefined &&
        Math.abs(inspectorRect.right - workspaceRect.right) <= 1 &&
        inspectorRect.top <= workspaceRect.top + 1 &&
        inspectorRect.bottom >= workspaceRect.bottom - 1;
      const canvasPreservesViewport =
        canvasRect !== undefined &&
        viewerRect !== undefined &&
        Math.abs(canvasRect.width - viewerRect.width) <= 4;
      const workspaceOwnsOverlayContext =
        workspaceStyle !== null &&
        inspectorDockStyle !== null &&
        workspaceStyle.position === "relative" &&
        inspectorDockStyle.position === "absolute";
      const frameVariant = viewerFrame instanceof Element ? viewerFrame.getAttribute("data-viewer-variant") : null;
      const frameOwnsExteriorPerimeter =
        viewerStyle !== null &&
        frameVariant === "standalone" &&
        Number.parseFloat(viewerStyle.borderTopWidth) >= 1 &&
        Number.parseFloat(viewerStyle.borderRightWidth) >= 1 &&
        Number.parseFloat(viewerStyle.borderBottomWidth) >= 1 &&
        Number.parseFloat(viewerStyle.borderLeftWidth) >= 1 &&
        Number.parseFloat(viewerStyle.borderTopLeftRadius) > 0 &&
        Number.parseFloat(viewerStyle.borderTopRightRadius) > 0 &&
        Number.parseFloat(viewerStyle.borderBottomRightRadius) > 0 &&
        Number.parseFloat(viewerStyle.borderBottomLeftRadius) > 0;
      const frameFillsWorkspace =
        workspaceRect !== undefined &&
        viewerRect !== undefined &&
        Math.abs(viewerRect.left - workspaceRect.left) <= 1 &&
        Math.abs(viewerRect.top - workspaceRect.top) <= 1 &&
        Math.abs(viewerRect.right - workspaceRect.right) <= 1 &&
        Math.abs(viewerRect.bottom - workspaceRect.bottom) <= 1;
      const framePanelOverlapArea =
        viewerRect === undefined || inspectorRect === undefined
          ? null
          : Math.max(0, Math.min(viewerRect.right, inspectorRect.right) - Math.max(viewerRect.left, inspectorRect.left)) *
            Math.max(0, Math.min(viewerRect.bottom, inspectorRect.bottom) - Math.max(viewerRect.top, inspectorRect.top));
      const legendPanelOverlapArea =
        legendRect === undefined || inspectorRect === undefined
          ? null
          : Math.max(0, Math.min(legendRect.right, inspectorRect.right) - Math.max(legendRect.left, inspectorRect.left)) *
            Math.max(0, Math.min(legendRect.bottom, inspectorRect.bottom) - Math.max(legendRect.top, inspectorRect.top));
      return {
        canvas: canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0,
        canvasCssSize:
          canvasRect === undefined
            ? null
            : { width: canvasRect.width, height: canvasRect.height },
        canvasBackingSize:
          canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
        canvasPixelRatio:
          canvas instanceof HTMLCanvasElement && canvasRect !== undefined && canvasRect.width > 0
            ? canvas.width / canvasRect.width
            : null,
        webgl: context !== null,
        webglVersion: context === null ? null : context.getParameter(context.VERSION),
        profile: document.querySelector("[data-lkds3d-profile]")?.getAttribute("data-lkds3d-profile"),
        composition: document.querySelector("[data-lds3d-composition]")?.getAttribute("data-lds3d-composition"),
        ldsCoreVersion: document.querySelector("[data-lds-core-version]")?.getAttribute("data-lds-core-version"),
        ldsViewerFrameCount: document.querySelectorAll("[data-lds-viewer-frame]").length,
        ldsInspectorValueCount: document.querySelectorAll("[data-selection-inspector-value]").length,
        ldsStatusValueCount: document.querySelectorAll("[data-viewport-status-value]").length,
        ldsViewerWorkspaceCount: document.querySelectorAll("[data-visual-workspace]").length,
        ldsInspectorDockCount: document.querySelectorAll("[data-visual-inspector-dock]").length,
        legacyCanvasEditorShellCount: document.querySelectorAll(".lk-canvas-editor-shell").length,
        cameraToolbar: cameraToolbar !== null && cameraToolbar !== undefined,
        toolbarHandleOverlapPixels:
          lastCameraRect === undefined || dockPanelToggleRect === undefined
            ? null
            : Math.max(
                0,
                Math.min(lastCameraRect.right, dockPanelToggleRect.right) -
                  Math.max(lastCameraRect.left, dockPanelToggleRect.left),
              ),
        pageTitle: compositionRoot?.querySelector("h1")?.textContent?.trim() ?? null,
        sceneTitle: document.querySelector("[data-viewer-source]")?.textContent?.trim() ?? null,
        headingLevels,
        inspectorInsideWorkspace,
        inspectorOverlaysViewport,
        panelAlignsWorkspaceEdge,
        canvasPreservesViewport,
        workspaceOwnsOverlayContext,
        frameVariant,
        frameOwnsExteriorPerimeter,
        frameFillsWorkspace,
        framePanelOverlapArea,
        legendPanelOverlapArea,
        viewportDominates:
          inspectorOverlaysViewport &&
          canvasPreservesViewport &&
          viewerRect !== undefined &&
          inspectorRect !== undefined &&
          viewerRect.width >= inspectorRect.width * 2 &&
          viewerRect.height >= 480,
        wideLayout: document.querySelector('[data-layout="wide"]') !== null,
        headlessRendererButtonCount: rendererHost?.querySelectorAll("button").length ?? 0,
        legacyCustomChromeCount: document.querySelectorAll(
          ".visual-brand-mark, .visual-contextbar, .visual-inspector, .visual-statusbar",
        ).length,
        ldsPrimaryToken: compositionRoot === null
          ? ""
          : getComputedStyle(compositionRoot).getPropertyValue("--color-semantic-primary-normal").trim(),
        glbResources: performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => /\\.glb(?:$|\\?)/u.test(name)),
        inspectorMatches: inspector?.textContent?.includes("robot/amr-01") ?? false,
        foundationSvgSubstituteCount: document.querySelectorAll("svg.axis-canvas").length,
      };
    })()`);
    const home = await capture(client, "camera-home", "operational-neutral.png");
    const interaction = await verifyHoverAndSelection(client);
    trace("hover and GLB selection verified");
    await clickButton(client, "상단 시점");
    const top = await capture(client, "camera-top");
    await clickButton(client, "선택 객체에 초점");
    const focus = await capture(client, "camera-focus");
    trace("camera presets verified");
    const responsive = await verifyResponsiveComposition(client);
    trace("responsive composition verified at 992px, 800px, and 320px");

    const diagnosticUrl = `${origin}/iframe.html?id=visual-alpha--diagnostic-technical&viewMode=story`;
    await navigate(client, diagnosticUrl);
    const diagnostic = await client.evaluate(`(() => ({
      profile: document.querySelector("[data-lkds3d-profile]")?.getAttribute("data-lkds3d-profile"),
      inspectorHasDiagnostics: ["프레임", "소스", "관측 시각"].every(
        (label) => document.querySelector('[aria-label="선택 객체 세부 정보"]')?.textContent?.includes(label),
      ),
      glbResourceCount: performance.getEntriesByType("resource").filter(
        (entry) => /\\.glb(?:$|\\?)/u.test(entry.name),
      ).length,
    }))()`);
    const diagnosticCapture = await capture(
      client,
      "diagnostic-technical",
      "diagnostic-technical.png",
    );
    trace("diagnostic profile loaded");

    const assetCatalogUrl = `${origin}/iframe.html?id=lds-3d-scenes-asset-review--overview&viewMode=story`;
    await navigate(client, assetCatalogUrl);
    const assetCatalog = await client.evaluate(`(() => ({
      pageTitle: document.querySelector("[data-lds3d-composition] h1")?.textContent?.trim() ?? null,
      sceneTitle: document.querySelector("[data-viewer-source]")?.textContent?.trim() ?? null,
      glbResourceCount: new Set(performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /\\.glb(?:$|\\?)/u.test(name))).size,
      inspectorValueCount: document.querySelectorAll("[data-selection-inspector-value]").length,
    }))()`);
    const assetCatalogCapture = await capture(client, "asset-catalog", "asset-catalog.png");
    trace("actual GLB asset catalog loaded");

    const goalPathUrl = `${origin}/iframe.html?id=lds-3d-states-goal-and-path--overview&viewMode=story`;
    const goalPath = await verifyGoalPathControls(client, goalPathUrl);
    const goalPathCapture = await capture(client, "goal-path-states");
    trace("goal and path controls verified");

    const stateUrl = `${origin}/iframe.html?id=lds-3d-states-renderer-lifecycle--overview&viewMode=story`;
    const states = await verifyRuntimeStates(client, stateUrl);
    const recovered = await capture(client, "renderer-recovered");
    trace("renderer lifecycle states verified");

    const cameraHashes = new Set([home.sha256, top.sha256, focus.sha256]);
    const checks = {
      actualWebGlCanvas: operational.canvas === true && operational.webgl === true,
      actualGlbAssets: new Set(operational.glbResources).size >= 6,
      actualLdsComposition:
        operational.composition === "actual" &&
        operational.ldsCoreVersion === "0.1.0" &&
        operational.ldsViewerFrameCount === 1 &&
        operational.ldsInspectorValueCount >= 2 &&
        operational.ldsStatusValueCount >= 3 &&
        operational.ldsViewerWorkspaceCount === 1 &&
        operational.ldsInspectorDockCount === 1 &&
        operational.legacyCanvasEditorShellCount === 0 &&
        operational.cameraToolbar === true &&
        operational.ldsPrimaryToken.length > 0,
      ldsPageComposition:
        operational.pageTitle === "AMR 운영" &&
        operational.sceneTitle === "창고 / LK-MAP" &&
        operational.headingLevels[0] === "H1" &&
        operational.headingLevels.includes("H2") &&
        operational.viewportDominates === true &&
        operational.inspectorInsideWorkspace === true &&
        operational.inspectorOverlaysViewport === true &&
        operational.panelAlignsWorkspaceEdge === true &&
        operational.canvasPreservesViewport === true &&
        operational.workspaceOwnsOverlayContext === true &&
        operational.frameVariant === "standalone" &&
        operational.frameOwnsExteriorPerimeter === true &&
        operational.frameFillsWorkspace === true &&
        operational.framePanelOverlapArea > 0 &&
        operational.legendPanelOverlapArea === 0 &&
        operational.wideLayout === true &&
        operational.toolbarHandleOverlapPixels === 0,
      responsiveComposition:
        responsive.wide992.layout === "wide" &&
        responsive.wide992.horizontalOverflow === false &&
        responsive.wide992.dockToggle === true &&
        responsive.wide992.inspectorInsideWorkspace === true &&
        responsive.wide992.inspectorOverlaysFrame === true &&
        responsive.wide992.frameInsideWorkspace === true &&
        responsive.wide992.workspaceOwnsOverlayContext === true &&
        responsive.wide992.frameVariant === "standalone" &&
        responsive.wide992.frameHasStandalonePerimeter === true &&
        responsive.wide992.frameSharesWorkspaceBounds === true &&
        responsive.wide992.panelAlignsWorkspaceEdge === true &&
        responsive.wide992.canvasInsideFrame === true &&
        responsive.wide992.canvasPreservesViewport === true &&
        responsive.wide992.panelOverlaysCanvas === true &&
        responsive.wide992.canvasPixelRatio !== null &&
        responsive.wide992.canvasPixelRatio <= 1.01 &&
        responsive.wide992.viewportToInspectorRatio >= 2 &&
        responsive.wide992.toolbarInsideFrame === true &&
        responsive.wide992.toolbarPanelOverlapArea === 0 &&
        responsive.wide992.framePanelOverlapArea > 0 &&
        responsive.wide992.legendPanelOverlapArea === 0 &&
        responsive.collapsedDock?.handleInsideWorkspace === true &&
        responsive.collapsedDock?.handleAtWorkspaceDockEdge === true &&
        responsive.wide992Resized.inspectorInsideWorkspace === true &&
        responsive.wide992Resized.inspectorOverlaysFrame === true &&
        responsive.wide992Resized.workspaceOwnsOverlayContext === true &&
        responsive.wide992Resized.frameVariant === "standalone" &&
        responsive.wide992Resized.frameHasStandalonePerimeter === true &&
        responsive.wide992Resized.frameSharesWorkspaceBounds === true &&
        responsive.wide992Resized.panelAlignsWorkspaceEdge === true &&
        responsive.wide992Resized.canvasInsideFrame === true &&
        responsive.wide992Resized.canvasPreservesViewport === true &&
        responsive.wide992Resized.panelOverlaysCanvas === true &&
        responsive.wide992Resized.toolbarPanelOverlapArea === 0 &&
        responsive.wide992Resized.framePanelOverlapArea > 0 &&
        responsive.wide992Resized.legendPanelOverlapArea === 0 &&
        responsive.narrow800.layout === "narrow" &&
        responsive.narrow800.horizontalOverflow === false &&
        responsive.narrow800.dockToggle === false &&
        responsive.narrow800.drawerTrigger === true &&
        responsive.narrow800.frameVariant === "standalone" &&
        responsive.narrow800.frameHasStandalonePerimeter === true &&
        responsive.narrow800.canvasInsideFrame === true &&
        responsive.narrow800.canvasPixelRatio !== null &&
        responsive.narrow800.canvasPixelRatio <= 1.01 &&
        responsive.narrow800.toolbarInsideFrame === true &&
        responsive.narrow320.layout === "narrow" &&
        responsive.narrow320.horizontalOverflow === false &&
        responsive.narrow320.dockToggle === false &&
        responsive.narrow320.drawerTrigger === true &&
        responsive.narrow320.frameVariant === "standalone" &&
        responsive.narrow320.frameHasStandalonePerimeter === true &&
        responsive.narrow320.canvasInsideFrame === true &&
        responsive.narrow320.toolbarInsideFrame === true &&
        responsive.narrow320.toolbarHudOverlapArea === 0 &&
        responsive.narrow320.selectionStatusFullyVisible === true &&
        responsive.narrow320.legendInsideFrame === true &&
        responsive.narrow320.legendStatusOverlapArea === 0 &&
        responsive.drawerOpened === true &&
        responsive.drawerReopenedAfterRoundTrip === false,
      headlessRendererBoundary: operational.headlessRendererButtonCount === 0,
      noLegacyCustomChrome: operational.legacyCustomChromeCount === 0,
      operationalProfile: operational.profile === "operational-neutral",
      diagnosticProfile: diagnostic.profile === "diagnostic-technical",
      diagnosticInspector: diagnostic.inspectorHasDiagnostics === true,
      assetCatalogComposition:
        assetCatalog.pageTitle === "산업 자산 카탈로그" &&
        assetCatalog.sceneTitle === "자산 검토 그리드 / LK-MAP" &&
        assetCatalog.glbResourceCount >= 6 &&
        assetCatalog.inspectorValueCount >= 2,
      ldsInspectorSelectionSync: interaction.inspectorText.length > 0,
      hoverPicking: typeof interaction.hoverLabel === "string",
      goalPathDirectManipulation: Object.values(goalPath)
        .filter((value) => typeof value === "boolean")
        .every(Boolean),
      cameraPresetsChangeRender: cameraHashes.size === 3,
      loadingErrorEmptyRetry: Object.values(states).every(Boolean),
      noFoundationSvgSubstitution: operational.foundationSvgSubstituteCount === 0,
      renderingBudget:
        operational.canvasPixelRatio !== null &&
        operational.canvasPixelRatio <= 1.01 &&
        responsive.wide992.canvasPreservesViewport === true &&
        responsive.wide992.canvasBackingPixels !== null &&
        responsive.wide992.canvasCssPixels !== null &&
        responsive.wide992.canvasBackingPixels <= responsive.wide992.canvasCssPixels * 1.01,
    };
    report = {
      generatedAt: new Date().toISOString(),
      passed: Object.values(checks).every(Boolean),
      checks,
      operational,
      interaction,
      diagnostic,
      assetCatalog,
      goalPath,
      states,
      responsive,
      captures: {
        home,
        top,
        focus,
        diagnostic: diagnosticCapture,
        assetCatalog: assetCatalogCapture,
        goalPath: goalPathCapture,
        recovered,
        responsive320: responsive.capture320,
      },
    };
    trace(`checks complete: ${report.passed ? "PASS" : "FAIL"}`);
  } catch (error) {
    trace(`failed: ${error instanceof Error ? error.message : String(error)}`);
    report = {
      generatedAt: new Date().toISOString(),
      passed: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      browserLogTail: browserStderr.join("").slice(-12_000),
    };
  } finally {
    trace("writing report and cleaning browser session");
    await writeEvidenceFile(
      join(evidenceDirectory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (client !== undefined) {
      try {
        await Promise.race([client.send("Browser.close"), delay(1_000)]);
      } catch {
        // Browser may already be closing after a failed page command.
      }
      client.close();
    }
    chrome.kill();
    server.closeAllConnections?.();
    await Promise.race([new Promise((resolveClose) => server.close(resolveClose)), delay(1_000)]);
    await delay(300);
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exit(1);
}

await main();
