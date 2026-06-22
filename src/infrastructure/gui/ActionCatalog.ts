import type { GuiAction } from '../../domain/poltergeist/GuiAction.js';

export const ACTION_CATALOG: readonly GuiAction[] = [
  // ── Apps ─────────────────────────────────────────────────────────────────
  { id: 'open_chrome',    label: 'Chrome',     category: 'apps',    icon: 'language' },
  { id: 'open_notepad',   label: 'Notepad',    category: 'apps',    icon: 'article' },
  { id: 'open_explorer',  label: 'Explorador', category: 'apps',    icon: 'folder_open' },
  { id: 'open_youtube',   label: 'YouTube',    category: 'apps',    icon: 'play_circle' },
  { id: 'open_spotify',   label: 'Spotify',    category: 'apps',    icon: 'music_note' },
  { id: 'open_vscode',    label: 'VS Code',    category: 'apps',    icon: 'code' },
  { id: 'open_terminal',  label: 'Terminal',   category: 'apps',    icon: 'terminal' },
  // ── Media ─────────────────────────────────────────────────────────────────
  { id: 'media_vol_up',   label: 'Vol +',      category: 'media',   icon: 'volume_up' },
  { id: 'media_vol_down', label: 'Vol -',      category: 'media',   icon: 'volume_down' },
  { id: 'media_mute',     label: 'Mute',       category: 'media',   icon: 'volume_off' },
  { id: 'media_play',     label: 'Play/Pause', category: 'media',   icon: 'play_arrow' },
  { id: 'media_next',     label: 'Siguiente',  category: 'media',   icon: 'skip_next' },
  { id: 'media_prev',     label: 'Anterior',   category: 'media',   icon: 'skip_previous' },
  // ── Sistema ───────────────────────────────────────────────────────────────
  { id: 'sys_screenshot', label: 'Captura',    category: 'system',  icon: 'screenshot_monitor' },
  { id: 'sys_lock',       label: 'Bloquear',   category: 'system',  icon: 'lock' },
  { id: 'sys_desktop',    label: 'Escritorio', category: 'system',  icon: 'desktop_windows' },
  { id: 'sys_sleep',      label: 'Suspender',  category: 'system',  icon: 'bedtime' },
  // ── TTS ───────────────────────────────────────────────────────────────────
  { id: 'tts_speak', label: 'Hablar', category: 'tts', icon: 'record_voice_over',
    params: [{ name: 'text', type: 'string', maxLen: 200 }] },
  // ── Teclado ───────────────────────────────────────────────────────────────
  { id: 'kb_win_d',   label: 'Win+D',    category: 'keyboard', icon: 'view_compact_alt' },
  { id: 'kb_alt_f4',  label: 'Alt+F4',   category: 'keyboard', icon: 'close' },
  { id: 'kb_ctrl_z',  label: 'Ctrl+Z',   category: 'keyboard', icon: 'undo' },
  { id: 'kb_enter',   label: 'Enter',    category: 'keyboard', icon: 'keyboard_return' },
  { id: 'type_text',  label: 'Escribir', category: 'keyboard', icon: 'keyboard',
    params: [{ name: 'text', type: 'string', maxLen: 500 }] },

  // ── Mouse (ocultas — invocadas desde el modo francotirador) ─────────────────
  { id: 'mouse_click',  label: 'Clic',        category: 'mouse', icon: 'mouse', hidden: true,
    params: [
      { name: 'x', type: 'number', min: 0, max: 1 },
      { name: 'y', type: 'number', min: 0, max: 1 },
    ] },
  { id: 'mouse_double', label: 'Doble clic',  category: 'mouse', icon: 'mouse', hidden: true,
    params: [
      { name: 'x', type: 'number', min: 0, max: 1 },
      { name: 'y', type: 'number', min: 0, max: 1 },
    ] },
  { id: 'mouse_right',  label: 'Clic derecho', category: 'mouse', icon: 'mouse', hidden: true,
    params: [
      { name: 'x', type: 'number', min: 0, max: 1 },
      { name: 'y', type: 'number', min: 0, max: 1 },
    ] },
  { id: 'mouse_drag',   label: 'Arrastrar',   category: 'mouse', icon: 'mouse', hidden: true,
    params: [
      { name: 'x',  type: 'number', min: 0, max: 1 },
      { name: 'y',  type: 'number', min: 0, max: 1 },
      { name: 'x2', type: 'number', min: 0, max: 1 },
      { name: 'y2', type: 'number', min: 0, max: 1 },
    ] },
  { id: 'mouse_scroll', label: 'Scroll',      category: 'mouse', icon: 'mouse', hidden: true,
    params: [
      { name: 'x',  type: 'number', min: 0, max: 1 },
      { name: 'y',  type: 'number', min: 0, max: 1 },
      { name: 'dy', type: 'number', min: -2000, max: 2000 },
    ] },
] as const;

export const CATALOG_MAP = new Map(ACTION_CATALOG.map((a) => [a.id, a]));
