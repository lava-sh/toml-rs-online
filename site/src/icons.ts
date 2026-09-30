import type { ThemeMode, ThemeScheme } from "./theme";
import chevron from "./assets/icons/chevron.svg?raw";
import contrast from "./assets/icons/contrast.svg?raw";
import github from "./assets/icons/github.svg?raw";
import moon from "./assets/icons/moon.svg?raw";
import reset from "./assets/icons/reset.svg?raw";
import sun from "./assets/icons/sun.svg?raw";
import theme from "./assets/icons/theme.svg?raw";

export const GITHUB_MARK = github;
export const THEME_ICON = theme;
export const RESET_ICON = reset;
export const CHEVRON_ICON = chevron;

export const MODE_ICONS: Record<ThemeMode, string> = {
  auto: contrast,
  dark: moon,
  light: sun,
};

export const SCHEME_ICONS: Record<ThemeScheme, string> = {
  dark: moon,
  light: sun,
};
