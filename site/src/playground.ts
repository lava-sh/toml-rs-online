import { fromBase64Url } from "@jsonjoy.com/base64/lib/fromBase64Url";
import { toBase64Url } from "@jsonjoy.com/base64/lib/toBase64Url";
import { highlightHTML } from "@speed-highlight/core";
import { escapeHTML } from "fast-escape-html";
import { deflateSync, inflateSync } from "fflate";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import configRaw from "../../config.toml?raw";
import type { TomlEditorFactory, TomlEditorHandle } from "./editors/types";
import type { WorkerRequest, WorkerResponse } from "./pyodide.worker";
import {
  applyTheme,
  defaultThemeForMode,
  loadStoredTheme,
  resolveTheme,
  saveStoredTheme,
  themeById,
  watchSystemScheme,
  type ThemeId,
  type ThemeMode,
} from "./theme";

type SiteConfig = {
  pyodide_version: string;
  toml_rs_version: string;
};

export type PlaygroundRefs = {
  dividerRef: Readonly<ShallowRef<HTMLElement | null>>;
  editorRef: Readonly<ShallowRef<HTMLElement | null>>;
};

export type PlaygroundApi = {
  busy: Ref<boolean>;
  busyLabel: Ref<string>;
  output: Ref<string>;
  outputCopied: Ref<boolean>;
  outputHighlight: Ref<string>;
  parseLabel: ComputedRef<string>;
  parseMs: Ref<number | null>;
  renderError: Ref<boolean>;
  themeButtonLabel: ComputedRef<string>;
  themeId: Ref<ThemeId>;
  themeMenuOpen: Ref<boolean>;
  themeMode: Ref<ThemeMode>;
  tomlCopied: Ref<boolean>;
  tomlShared: Ref<boolean>;
  closeThemeMenu(): void;
  copyOutput(): Promise<void>;
  copyToml(): Promise<void>;
  resetTheme(): void;
  setSplitFromPointer(clientX: number, clientY: number): void;
  setTheme(id: ThemeId): void;
  setThemeMode(mode: ThemeMode): void;
  shareTomlLink(): Promise<void>;
  startDrag(event: PointerEvent): void;
  toggleThemeMenu(): void;
};

const DEFAULT_TOML = `# This is a TOML document

title = "TOML Example"

[owner]
name = "Tom Preston-Werner"
dob = 1979-05-27T07:32:00-08:00

[database]
enabled = true
ports = [ 8000, 8001, 8002 ]
data = [ ["delta", "phi"], [3.14] ]
temp_targets = { cpu = 79.5, case = 72.0 }

[servers]

[servers.alpha]
ip = "10.0.0.1"
role = "frontend"

[servers.beta]
ip = "10.0.0.2"
role = "backend"
`;

const SPLIT_KEY = "toml-rs-split-v2";
const DEFAULT_SPLIT_RATIO = 50;
const MIN_SPLIT_RATIO = 28;
const MAX_SPLIT_RATIO = 72;
const FEEDBACK_MS = 1100;
const LARGE_INPUT_LENGTH = 20_000;
const RENDER_DEBOUNCE_MS = 120;
const LARGE_RENDER_DEBOUNCE_MS = 220;
const TOML_HASH_KEY = "toml";
const TOML_COMPRESSED_HASH_KEY = "tomlz";
const MOBILE_QUERY = window.matchMedia("(max-width: 980px)");
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

let splitRatio = DEFAULT_SPLIT_RATIO;

function compressShareValue(text: string): string | null {
  try {
    const deflated = deflateSync(TEXT_ENCODER.encode(text), { level: 6 });
    return toBase64Url(deflated, deflated.length);
  } catch {
    return null;
  }
}

function decompressShareValue(value: string): string | null {
  try {
    return TEXT_DECODER.decode(inflateSync(fromBase64Url(value)));
  } catch {
    return null;
  }
}

function buildShareUrl(tomlSource: string): string {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  params.delete(TOML_HASH_KEY);
  params.delete(TOML_COMPRESSED_HASH_KEY);
  const compressed = compressShareValue(tomlSource);
  const plain = TEXT_ENCODER.encode(tomlSource);
  params.set(
    compressed === null ? TOML_HASH_KEY : TOML_COMPRESSED_HASH_KEY,
    compressed ?? toBase64Url(plain, plain.length),
  );
  url.hash = params.toString();
  return url.toString();
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    helper.style.top = "0";
    helper.setAttribute("readonly", "");
    document.body.append(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) {
      throw new Error("Copy command failed");
    }
  }
}

function readSharedToml(): string | null {
  const { hash } = window.location;
  if (!hash.startsWith("#")) {
    return null;
  }
  const params = new URLSearchParams(hash.slice(1));
  const compressedValue = params.get(TOML_COMPRESSED_HASH_KEY);
  if (compressedValue !== null) {
    const decompressed = decompressShareValue(compressedValue);
    if (decompressed !== null) {
      return decompressed;
    }
  }
  const plain = params.get(TOML_HASH_KEY);
  if (plain === null) {
    return null;
  }
  try {
    return TEXT_DECODER.decode(fromBase64Url(plain));
  } catch {
    return null;
  }
}

function parseConfig(source: string): SiteConfig {
  const entries = Object.fromEntries(
    Array.from(source.matchAll(/^\s*([a-z_]+)\s*=\s*"([^"]*)"\s*$/gim), ([, key, value]) => [
      key,
      value,
    ]),
  );
  const { pyodide_version: pyodideVersion, toml_rs_version: tomlRsVersion } = entries;
  if (!pyodideVersion || !tomlRsVersion) {
    throw new Error("Invalid config.toml: expected pyodide_version and toml_rs_version");
  }
  return { pyodide_version: pyodideVersion, toml_rs_version: tomlRsVersion };
}

const CONFIG = parseConfig(configRaw);

function applySplitRatio(rawRatio: number): void {
  splitRatio = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, rawRatio));
  document.documentElement.style.setProperty(
    MOBILE_QUERY.matches ? "--top-height" : "--left-width",
    `${splitRatio}%`,
  );
}

function persistSplitRatio(): void {
  localStorage.setItem(SPLIT_KEY, String(splitRatio));
}

function restoreSplitRatio(): void {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  applySplitRatio(Number.isFinite(saved) ? saved : DEFAULT_SPLIT_RATIO);
}

function assertNeverWorkerResponse(response: never): never {
  throw new Error(`Unhandled worker response: ${String(response)}`);
}

export function usePlayground(
  createEditor: TomlEditorFactory,
  { dividerRef, editorRef }: PlaygroundRefs,
): PlaygroundApi {
  const storedTheme = loadStoredTheme();
  const themeMode = ref<ThemeMode>(storedTheme.mode);
  const themeId = ref<ThemeId>(
    storedTheme.mode === "auto" ? defaultThemeForMode("auto") : storedTheme.theme,
  );
  const themeMenuOpen = ref(false);
  const output = ref("");
  const outputHighlight = ref("");
  const busyLabel = ref("Loading runtime");
  const busy = ref(false);
  const renderError = ref(false);
  const parseMs = ref<number | null>(null);
  const tomlCopied = ref(false);
  const tomlShared = ref(false);
  const outputCopied = ref(false);
  const flashTimers = new WeakMap<Ref<boolean>, number>();

  let currentToml = DEFAULT_TOML;
  let runtimeWorker: Worker | undefined;
  let renderTimer = 0;
  let editorHandle: TomlEditorHandle | null = null;
  let dragging = false;
  let lastHighlighted = "";
  let stopWatchingScheme: (() => void) | undefined;

  const themeButtonLabel = computed(() => {
    const resolved = resolveTheme(themeMode.value);
    return `Theme settings — ${themeMode.value} (${resolved})`;
  });

  const parseLabel = computed(() =>
    parseMs.value === null ? "" : `Parsed in ${parseMs.value} ms`,
  );

  function setBusy(active: boolean, label = "Parsing TOML"): void {
    busy.value = active;
    busyLabel.value = label;
  }

  function paintOutputHighlight(source: string, markup: string): void {
    if (source === lastHighlighted) {
      outputHighlight.value = markup;
    }
  }

  async function renderOutputHighlight(source: string): Promise<void> {
    if (source === lastHighlighted) {
      return;
    }
    lastHighlighted = source;
    try {
      paintOutputHighlight(source, await highlightHTML(source, "py", { block: false }));
    } catch {
      paintOutputHighlight(source, escapeHTML(source));
    }
  }

  function sendToWorker(message: WorkerRequest): void {
    runtimeWorker?.postMessage(message);
  }

  function onWorkerResponse({ data }: MessageEvent<WorkerResponse>): void {
    switch (data.type) {
      case "status":
        setBusy(data.busy, data.label);
        return;
      case "error":
      case "result":
        renderError.value = data.type === "error";
        output.value = data.output;
        if (typeof data.elapsedMs === "number") {
          parseMs.value = data.elapsedMs;
        }
        if (data.type === "result") {
          void renderOutputHighlight(data.output);
        }
        return;
      default:
        return assertNeverWorkerResponse(data);
    }
  }

  function boot(): void {
    setBusy(true, "Loading Pyodide");
    runtimeWorker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
    runtimeWorker.addEventListener("message", onWorkerResponse);
    sendToWorker({
      type: "boot",
      pyodideVersion: CONFIG.pyodide_version,
      tomlRsVersion: CONFIG.toml_rs_version,
      toml: currentToml,
    });
  }

  function setSplitFromPointer(clientX: number, clientY: number): void {
    const split = dividerRef.value?.parentElement;
    if (!split) {
      return;
    }
    const rect = split.getBoundingClientRect();
    const ratio = MOBILE_QUERY.matches
      ? ((clientY - rect.top) / rect.height) * 100
      : ((clientX - rect.left) / rect.width) * 100;
    applySplitRatio(ratio);
  }

  function commitTheme(): void {
    applyTheme(themeMode.value, themeId.value);
    saveStoredTheme(themeMode.value, themeId.value);
  }

  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode;
    if (mode === "auto" || themeById(themeId.value).scheme !== mode) {
      themeId.value = defaultThemeForMode(mode);
    }
    commitTheme();
  }

  function setTheme(id: ThemeId): void {
    themeId.value = id;
    themeMode.value = themeById(id).scheme;
    commitTheme();
  }

  function resetTheme(): void {
    themeMode.value = "auto";
    themeId.value = defaultThemeForMode("auto");
    commitTheme();
  }

  function toggleThemeMenu(): void {
    themeMenuOpen.value = !themeMenuOpen.value;
  }

  function closeThemeMenu(): void {
    themeMenuOpen.value = false;
  }

  function syncSystemTheme(): void {
    if (themeMode.value !== "auto") {
      return;
    }
    themeId.value = defaultThemeForMode("auto");
    applyTheme(themeMode.value, themeId.value);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!themeMenuOpen.value) {
      return;
    }
    const { target } = event;
    if (target instanceof Element && target.closest(".theme-settings")) {
      return;
    }
    closeThemeMenu();
  }

  function onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && themeMenuOpen.value) {
      closeThemeMenu();
    }
  }

  function flash(flag: Ref<boolean>): void {
    window.clearTimeout(flashTimers.get(flag));
    flag.value = true;
    flashTimers.set(
      flag,
      window.setTimeout(() => {
        flag.value = false;
      }, FEEDBACK_MS),
    );
  }

  async function copyText(text: string, flag: Ref<boolean>): Promise<void> {
    flash(flag);
    try {
      await writeClipboardText(text);
    } catch {}
  }

  function copyToml(): Promise<void> {
    return copyText(currentToml, tomlCopied);
  }

  function copyOutput(): Promise<void> {
    return copyText(output.value, outputCopied);
  }

  async function shareTomlLink(): Promise<void> {
    let shareUrl: string;
    try {
      shareUrl = buildShareUrl(currentToml);
      window.history.replaceState(null, "", shareUrl);
    } catch {
      return;
    }
    flash(tomlShared);
    try {
      await writeClipboardText(shareUrl);
    } catch {}
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) {
      return;
    }
    setSplitFromPointer(event.clientX, event.clientY);
  }

  function onPointerUp(): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    persistSplitRatio();
    document.body.classList.remove("is-resizing");
    document.body.style.userSelect = "";
  }

  function onResize(): void {
    restoreSplitRatio();
  }

  function scheduleRender(): void {
    window.clearTimeout(renderTimer);
    const delay =
      currentToml.length > LARGE_INPUT_LENGTH ? LARGE_RENDER_DEBOUNCE_MS : RENDER_DEBOUNCE_MS;
    renderTimer = window.setTimeout(
      () => sendToWorker({ type: "render", toml: currentToml }),
      delay,
    );
  }

  onMounted(() => {
    applyTheme(themeMode.value, themeId.value);
    if (editorRef.value) {
      editorHandle = createEditor(editorRef.value, DEFAULT_TOML, (value) => {
        currentToml = value;
        scheduleRender();
      });
    }
    restoreSplitRatio();
    const sharedToml = readSharedToml();
    if (sharedToml !== null) {
      editorHandle?.setValue(sharedToml);
    }
    boot();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onMenuKeydown);
    window.addEventListener("resize", onResize, { passive: true });
    stopWatchingScheme = watchSystemScheme(syncSystemTheme);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onMenuKeydown);
    window.removeEventListener("resize", onResize);
    stopWatchingScheme?.();
    window.clearTimeout(renderTimer);
    for (const flag of [tomlCopied, outputCopied, tomlShared]) {
      window.clearTimeout(flashTimers.get(flag));
    }
    editorHandle?.destroy();
    runtimeWorker?.terminate();
  });

  return {
    busy,
    busyLabel,
    closeThemeMenu,
    copyOutput,
    copyToml,
    output,
    outputCopied,
    outputHighlight,
    parseLabel,
    parseMs,
    renderError,
    resetTheme,
    setSplitFromPointer,
    setTheme,
    setThemeMode,
    shareTomlLink,
    themeButtonLabel,
    themeId,
    themeMenuOpen,
    themeMode,
    toggleThemeMenu,
    tomlCopied,
    tomlShared,
    startDrag(event: PointerEvent): void {
      dragging = true;
      document.body.classList.add("is-resizing");
      document.body.style.userSelect = "none";
      const { currentTarget } = event;
      if (currentTarget instanceof Element) {
        currentTarget.setPointerCapture(event.pointerId);
      }
    },
  };
}
