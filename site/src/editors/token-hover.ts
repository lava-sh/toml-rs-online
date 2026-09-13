const TOKEN_SELECTOR = "[class*='shj-syn-']";
const HOVER_CLASS = "tok-hover";

type Point = {
  x: number;
  y: number;
};

export type TokenHover = {
  follow(event: MouseEvent, overlay: HTMLElement): void;
  hide(): void;
};

function tokenAt(point: Point, overlay: HTMLElement): Element | null {
  return (
    document
      .elementsFromPoint(point.x, point.y)
      .find((element) => element !== overlay && element.closest(TOKEN_SELECTOR)) ?? null
  );
}

export function createTokenHover(): TokenHover {
  let hovered: Element | null = null;

  function hide(): void {
    hovered?.classList.remove(HOVER_CLASS);
    hovered = null;
  }

  return {
    follow(event: MouseEvent, overlay: HTMLElement): void {
      if (event.buttons) {
        hide();
        return;
      }
      const token = tokenAt({ x: event.clientX, y: event.clientY }, overlay);
      if (token === hovered) {
        return;
      }
      hide();
      if (!token) {
        return;
      }
      hovered = token;
      token.classList.add(HOVER_CLASS);
    },
    hide,
  };
}
