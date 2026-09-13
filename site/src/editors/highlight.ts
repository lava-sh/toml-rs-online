import { highlightHTML } from "@speed-highlight/core";
import { escapeHTML } from "fast-escape-html";

const LARGE_INPUT_LENGTH = 12_000;

export type HighlightQueue = {
  push(): void;
  destroy(): void;
};

type HighlightQueueOptions = {
  target: HTMLElement;
  readSource: () => string;
  onPainting: () => void;
};

function countLines(source: string): number {
  let lineCount = 1;
  for (const character of source) {
    lineCount += character === "\n" ? 1 : 0;
  }
  return lineCount;
}

function fallbackMarkup(source: string): string {
  const gutter = `<div class="shj-numbers">${"<div></div>".repeat(countLines(source))}</div>`;
  return `<div>${gutter}<div>${escapeHTML(source)}</div></div>`;
}

function renderToml(source: string): Promise<string> {
  return highlightHTML(source, "toml", { block: true, showLineNumbers: true });
}

export function createHighlightQueue({
  target,
  readSource,
  onPainting,
}: HighlightQueueOptions): HighlightQueue {
  let pending: { revision: number; source: string } | null = null;
  let latestRevision = 0;
  let frame = 0;
  let destroyed = false;

  const paint = (revision: number, markup: string): void => {
    if (destroyed || revision !== latestRevision) {
      return;
    }
    target.innerHTML = markup;
    onPainting();
  };

  async function render(revision: number, source: string): Promise<void> {
    try {
      paint(revision, await renderToml(source));
    } catch {
      paint(revision, fallbackMarkup(source));
    }
  }

  const flushPending = (): void => {
    frame = 0;
    const next = pending;
    if (destroyed || next === null) {
      return;
    }
    pending = null;
    void render(next.revision, next.source);
  };

  return {
    push(): void {
      if (destroyed) {
        return;
      }
      const source = readSource();
      const revision = ++latestRevision;
      if (source.length <= LARGE_INPUT_LENGTH) {
        pending = null;
        void render(revision, source);
        return;
      }
      pending = { revision, source };
      if (frame === 0) {
        frame = window.requestAnimationFrame(flushPending);
      }
    },
    destroy(): void {
      destroyed = true;
      pending = null;
      window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
