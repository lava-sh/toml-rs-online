<script setup lang="ts">
import { TextMorph } from "torph/vue";
import { computed, onMounted, ref, useTemplateRef } from "vue";
import logoDark from "./assets/toml-logo-inverse.svg";
import logoLight from "./assets/toml-logo.svg";
import CopyButton from "./components/buttons/CopyButton.vue";
import ShareButton from "./components/buttons/ShareButton.vue";
import Glyph from "./components/Glyph.vue";
import type { TomlEditorFactory } from "./editors/types";
import {
  CHEVRON_PATH,
  CONTRAST_PATHS,
  GITHUB_MARK,
  MODE_ICONS,
  RESET_PATHS,
  SCHEME_ICONS,
} from "./icons";
import { usePlayground } from "./playground";
import { THEMES, type ThemeMode } from "./theme";

const props = defineProps<{
  textFactory: TomlEditorFactory;
}>();

const editorRef = useTemplateRef<HTMLElement>("editorRef");
const dividerRef = useTemplateRef<HTMLElement>("dividerRef");
const repoStars = ref<string | null>(null);

async function showRepoStars(): Promise<void> {
  try {
    const response = await fetch("https://api.github.com/repos/lava-sh/toml-rs");
    if (!response.ok) {
      return;
    }
    const { stargazers_count: count } = (await response.json()) as { stargazers_count?: number };
    if (typeof count === "number") {
      repoStars.value = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
    }
  } catch {}
}

onMounted(showRepoStars);

const {
  busy,
  busyLabel,
  output,
  outputHighlight,
  outputCopied,
  parseLabel,
  parseMs,
  renderError,
  resetTheme,
  shareTomlLink,
  setTheme,
  setThemeMode,
  startDrag,
  themeButtonLabel,
  themeId,
  themeMenuOpen,
  themeMode,
  toggleThemeMenu,
  copyToml,
  copyOutput,
  tomlCopied,
  tomlShared,
  setSplitFromPointer,
} = usePlayground(props.textFactory, { dividerRef, editorRef });

const modeOptions: { value: ThemeMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const visibleThemes = computed(() =>
  themeMode.value === "auto" ? THEMES : THEMES.filter((theme) => theme.scheme === themeMode.value),
);
</script>

<template>
  <main class="page-shell">
    <header class="topbar">
      <div class="topbar-main">
        <div class="brand-block">
          <img class="brand-logo brand-logo-dark" :src="logoDark" alt="toml-rs" />
          <img class="brand-logo brand-logo-light" :src="logoLight" alt="toml-rs" />
        </div>
      </div>
      <div class="topbar-side">
        <a
          class="topbar-link github-link"
          href="https://github.com/lava-sh/toml-rs"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="lava-sh/toml-rs on GitHub"
          title="lava-sh/toml-rs"
        >
          <span class="github-tile" aria-hidden="true">
            <Glyph class="github-mark" :paths="[GITHUB_MARK]" box="0 0 24 24" />
          </span>
          <span v-if="repoStars" class="repo-stats">
            <span class="repo-stat">
              <span class="repo-stat-num">{{ repoStars }}</span>
              <span class="repo-stat-label">stars</span>
            </span>
          </span>
          <span v-else class="topbar-link-text">lava-sh/toml-rs</span>
        </a>
        <div class="theme-settings">
          <button
            class="theme-btn"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="themeMenuOpen"
            :aria-label="themeButtonLabel"
            :title="themeButtonLabel"
            @click="toggleThemeMenu"
          >
            <Glyph class="theme-btn-icon" :paths="CONTRAST_PATHS" />
          </button>
          <div v-if="themeMenuOpen" class="theme-menu" role="menu" aria-label="Theme settings">
            <div class="theme-menu-group" role="group" aria-label="Appearance">
              <button
                v-for="option in modeOptions"
                :key="option.value"
                class="theme-menu-mode"
                :class="{ active: themeMode === option.value }"
                type="button"
                role="menuitemradio"
                :aria-checked="themeMode === option.value"
                @click="setThemeMode(option.value)"
              >
                <Glyph :paths="MODE_ICONS[option.value]" />
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div class="theme-menu-list" role="group" aria-label="Themes">
              <button
                v-for="theme in visibleThemes"
                :key="theme.id"
                class="theme-menu-preset"
                :class="{ active: themeId === theme.id }"
                type="button"
                role="menuitemradio"
                :aria-checked="themeId === theme.id"
                @click="setTheme(theme.id)"
              >
                <Glyph :paths="SCHEME_ICONS[theme.scheme]" />
                <span class="theme-menu-preset-name">{{ theme.label }}</span>
                <Glyph class="theme-menu-chevron" :paths="[CHEVRON_PATH]" box="0 0 10 16" />
              </button>
            </div>
            <button
              class="theme-menu-preset theme-menu-reset"
              type="button"
              role="menuitem"
              @click="resetTheme"
            >
              <Glyph :paths="RESET_PATHS" />
              <span class="theme-menu-preset-name">Reset to default themes</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="workbench">
      <section class="split">
        <article class="panel">
          <header class="panel-head">
            <h2>TOML</h2>
            <div class="panel-actions">
              <ShareButton
                :shared="tomlShared"
                label="Share TOML"
                title="Share TOML"
                @click="shareTomlLink"
              />
              <CopyButton
                :copied="tomlCopied"
                label="Copy TOML"
                title="Copy TOML"
                @click="copyToml"
              />
            </div>
          </header>

          <div class="editor-wrap">
            <div ref="editorRef" class="editor-host"></div>
          </div>
        </article>

        <div
          ref="dividerRef"
          class="divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          @pointerdown.prevent="
            ($event) => {
              startDrag($event);
              setSplitFromPointer($event.clientX, $event.clientY);
            }
          "
        ></div>

        <article class="panel panel-output" :class="{ 'is-busy': busy }">
          <header class="panel-head">
            <h2>Python</h2>
            <TextMorph v-if="parseMs !== null" class="parse-time" :text="parseLabel" as="span" />
            <div class="panel-actions">
              <CopyButton
                :copied="outputCopied"
                label="Copy output"
                title="Copy output"
                @click="copyOutput"
              />
            </div>
          </header>

          <div class="output-wrap">
            <pre v-if="renderError" :class="{ err: renderError }">{{ output }}</pre>
            <pre v-else class="python-highlight" v-html="outputHighlight"></pre>
            <div class="py-status" aria-live="polite" :aria-hidden="busy ? 'false' : 'true'">
              <span class="py-spinner" aria-hidden="true"></span>
              <TextMorph
                class="py-status-label"
                :text="busyLabel"
                as="span"
                :ease="{ stiffness: 200, damping: 20 }"
              />
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>
