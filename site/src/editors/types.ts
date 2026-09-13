export interface TomlEditorHandle {
  setValue(value: string): void;
  destroy(): void;
}

export type TomlEditorFactory = (
  parent: HTMLElement,
  initialValue: string,
  onChange: (value: string) => void,
) => TomlEditorHandle;
