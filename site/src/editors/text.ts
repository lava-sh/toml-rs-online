import { createHighlightQueue } from "./highlight";
import { createTokenHover } from "./token-hover";
import type { TomlEditorHandle } from "./types";

const INDENT = "    ";

function createCodeLayer(): HTMLElement {
  const code = document.createElement("div");
  code.className = "sh-editor-code shj-lang-toml";
  code.setAttribute("aria-hidden", "true");
  return code;
}

function createInput(value: string): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "sh-editor-input";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.autocomplete = "off";
  textarea.wrap = "off";
  textarea.value = value;
  textarea.setAttribute("aria-label", "Code editor, the code is highlighted live");
  return textarea;
}

function textColumnOf(code: HTMLElement): HTMLElement | null {
  const content = code.firstElementChild;
  const text = content instanceof Element ? content.lastElementChild : null;
  return text instanceof HTMLElement ? text : null;
}

export function textFactory(
  parent: HTMLElement,
  initialValue: string,
  onChange: (value: string) => void,
): TomlEditorHandle {
  parent.classList.add("sh-editor");

  const code = createCodeLayer();
  const textarea = createInput(initialValue);
  const tokenHover = createTokenHover();
  parent.append(code, textarea);

  const syncScroll = (): void => {
    if (code.scrollTop !== textarea.scrollTop) {
      code.scrollTop = textarea.scrollTop;
    }
    if (code.scrollLeft !== textarea.scrollLeft) {
      code.scrollLeft = textarea.scrollLeft;
    }
    tokenHover.hide();
  };

  const syncGutter = (): void => {
    const text = textColumnOf(code);
    if (!text) {
      return;
    }
    const next = `${text.offsetLeft}px`;
    if (textarea.style.paddingLeft !== next) {
      textarea.style.paddingLeft = next;
    }
  };

  const highlight = createHighlightQueue({
    target: code,
    readSource: () => textarea.value,
    onPainting: () => {
      syncScroll();
      syncGutter();
    },
  });

  const onInput = (): void => {
    onChange(textarea.value);
    highlight.push();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    tokenHover.hide();
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    textarea.setRangeText(INDENT, textarea.selectionStart, textarea.selectionEnd, "end");
    onInput();
  };

  const onMouseMove = (event: MouseEvent): void => {
    tokenHover.follow(event, textarea);
  };

  const onMouseLeave = (): void => {
    tokenHover.hide();
  };

  const onPointerDown = (): void => {
    tokenHover.hide();
  };

  parent.addEventListener("mousemove", onMouseMove);
  parent.addEventListener("mouseleave", onMouseLeave);
  parent.addEventListener("mousedown", onPointerDown);
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("scroll", syncScroll, { passive: true });
  textarea.addEventListener("keydown", onKeyDown);

  const resizeObserver = new ResizeObserver(syncGutter);
  resizeObserver.observe(parent);

  highlight.push();

  return {
    setValue(value: string): void {
      if (textarea.value === value) {
        return;
      }
      textarea.value = value;
      onInput();
    },
    destroy(): void {
      highlight.destroy();
      resizeObserver.disconnect();
      tokenHover.hide();
      parent.removeEventListener("mousemove", onMouseMove);
      parent.removeEventListener("mouseleave", onMouseLeave);
      parent.removeEventListener("mousedown", onPointerDown);
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("scroll", syncScroll);
      textarea.removeEventListener("keydown", onKeyDown);
    },
  };
}
