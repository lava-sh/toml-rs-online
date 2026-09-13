type PyodideRuntime = {
  globals: {
    set: (name: string, value: string) => void;
  };
  loadPackage: (name: string) => Promise<void>;
  runPythonAsync: (code: string) => Promise<string>;
};

type PyodideModule = {
  loadPyodide: (options?: { indexURL?: string }) => Promise<PyodideRuntime>;
};

function isPyodideModule(value: unknown): value is PyodideModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "loadPyodide" in value &&
    typeof value.loadPyodide === "function"
  );
}

type PypiFile = {
  filename: string;
  url: string;
};

type BootMessage = {
  type: "boot";
  pyodideVersion: string;
  tomlRsVersion: string;
  toml: string;
};

type RenderMessage = {
  type: "render";
  toml: string;
};

type WorkerStatus = {
  type: "status";
  busy: boolean;
  label: string;
};

type WorkerResult = {
  type: "result";
  output: string;
  elapsedMs: number;
};

type WorkerFailure = {
  type: "error";
  output: string;
  elapsedMs?: number;
};

export type WorkerRequest = BootMessage | RenderMessage;
export type WorkerResponse = WorkerStatus | WorkerResult | WorkerFailure;

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide";
const PYPI_API = "https://pypi.org/pypi";

const PARSE_SETUP_CODE = `
from pprint import pformat
import toml_rs

def _parse(src):
    try:
        return pformat(toml_rs.loads(src), width=80, sort_dicts=False)
    except toml_rs.TOMLDecodeError as exc:
        return f"{exc}"
`;

const PARSE_CALL_CODE = "_parse(toml_input)";
const PYTHON_VERSION_CODE = "import sys; f'{sys.version_info.major}.{sys.version_info.minor}'";

let pyodide: PyodideRuntime | undefined;
let latestToml = "";
let latestRevision = 0;
let renderedRevision = 0;
let rendering = false;

function postMessageToHost(message: WorkerResponse): void {
  self.postMessage(message);
}

function postStatus(label: string): void {
  postMessageToHost({ type: "status", busy: true, label });
}

function postIdle(): void {
  postMessageToHost({ type: "status", busy: false, label: "Idle" });
}

function isPypiFile(value: unknown): value is PypiFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const file = value as Partial<PypiFile>;
  return typeof file.filename === "string" && typeof file.url === "string";
}

function readPypiFiles(value: unknown): PypiFile[] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { urls } = value as { urls?: unknown };
  return Array.isArray(urls) ? urls.filter(isPypiFile) : null;
}

async function findWheelUrl(tomlRsVersion: string, pythonVersion: string): Promise<string> {
  const releaseUrl = `${PYPI_API}/toml-rs/${tomlRsVersion}/json`;
  const response = await fetch(releaseUrl);
  if (!response.ok) {
    throw new Error(`PyPI lookup failed for ${releaseUrl}: ${response.status}`);
  }
  const files = readPypiFiles(await response.json());
  if (files === null) {
    throw new Error(`Unexpected PyPI response for ${releaseUrl}`);
  }
  const pythonTag = `cp${pythonVersion.replace(".", "")}`;
  const wheel = files.find(
    (file) =>
      file.filename.includes(`-${pythonTag}-${pythonTag}-`) && file.filename.includes("_wasm32"),
  );
  if (!wheel) {
    throw new Error(`No ${pythonTag} wasm32 wheel found for toml-rs==${tomlRsVersion}`);
  }
  return wheel.url;
}

async function loadRuntime(
  pyodideVersion: string,
): Promise<{ runtime: PyodideRuntime; pythonVersion: string }> {
  const baseUrl = `${PYODIDE_CDN}/v${pyodideVersion}/full/`;
  postStatus("Loading Pyodide");
  const pyodideModule: unknown = await import(/* @vite-ignore */ `${baseUrl}pyodide.mjs`);
  if (!isPyodideModule(pyodideModule)) {
    throw new Error(`Pyodide module at ${baseUrl} does not export loadPyodide`);
  }
  const runtime = await pyodideModule.loadPyodide({ indexURL: baseUrl });
  const pythonVersion = await runtime.runPythonAsync(PYTHON_VERSION_CODE);
  postStatus("Loading micropip");
  await runtime.loadPackage("micropip");
  return { runtime, pythonVersion };
}

async function installTomlRs(
  runtime: PyodideRuntime,
  tomlRsVersion: string,
  pythonVersion: string,
): Promise<void> {
  postStatus("Installing toml-rs");
  const wheelUrl = await findWheelUrl(tomlRsVersion, pythonVersion);
  try {
    await runtime.runPythonAsync(`import micropip
await micropip.install("${wheelUrl}")`);
  } catch (error) {
    throw new Error(`toml-rs wheel install failed for ${wheelUrl}`, { cause: error });
  }
  await runtime.runPythonAsync(PARSE_SETUP_CODE);
}

async function renderRevision(revision: number): Promise<void> {
  const runtime = pyodide;
  if (!runtime) {
    throw new Error("Pyodide runtime was not loaded");
  }
  runtime.globals.set("toml_input", latestToml);
  const startedAt = performance.now();
  const elapsedMs = (): number => Math.max(1, Math.round(performance.now() - startedAt));
  try {
    const output = await runtime.runPythonAsync(PARSE_CALL_CODE);
    if (revision === latestRevision) {
      postMessageToHost({ type: "result", output, elapsedMs: elapsedMs() });
    }
  } catch (error) {
    if (revision === latestRevision) {
      postMessageToHost({ type: "error", output: String(error), elapsedMs: elapsedMs() });
    }
  }
}

async function renderPendingRevisions(): Promise<void> {
  if (renderedRevision === latestRevision) {
    return;
  }
  const revision = latestRevision;
  await renderRevision(revision);
  renderedRevision = revision;
  await renderPendingRevisions();
}

async function drainRenderQueue(): Promise<void> {
  if (rendering || !pyodide) {
    return;
  }
  rendering = true;
  try {
    await renderPendingRevisions();
  } finally {
    rendering = false;
  }
  postIdle();
}

async function boot(message: BootMessage): Promise<void> {
  latestToml = message.toml;
  latestRevision += 1;
  try {
    const { runtime, pythonVersion } = await loadRuntime(message.pyodideVersion);
    await installTomlRs(runtime, message.tomlRsVersion, pythonVersion);
    pyodide = runtime;
    await drainRenderQueue();
  } catch (error) {
    postMessageToHost({ type: "error", output: String(error) });
    postIdle();
  }
}

function assertNeverWorkerRequest(request: never): never {
  throw new Error(`Unhandled worker request: ${String(request)}`);
}

function onHostMessage({ data }: MessageEvent<WorkerRequest>): void {
  switch (data.type) {
    case "boot":
      void boot(data);
      return;
    case "render":
      latestToml = data.toml;
      latestRevision += 1;
      void drainRenderQueue();
      return;
    default:
      return assertNeverWorkerRequest(data);
  }
}

self.addEventListener("message", onHostMessage);
