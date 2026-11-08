import { registerComponent } from '@keenmate/web-components-core';
import { CommandPaletteElement } from './web-component';
import { logging } from './logger';

export { CommandPaletteElement };
export type { CommandPaletteConfig, CommandPaletteResponsiveMap, CommandPaletteResponsiveCallback } from './web-component';
export type { Presentation, ResponsiveMap, ResponsiveCallback, ResponsiveContext } from '@keenmate/web-components-core';

// The DOM-free engine + helpers, for hosts that want to drive or test the logic directly
// (the element never exposes it — use `el.controller`).
export { PaletteEngine, PAGE_STEP } from './palette';
export type { PaletteEngineHost, Effect, EffectOutcome, ViewItem, TokenView, NavDirection, HomeSection } from './palette';
export { UsageStore, usageKey, frecency, localStoragePersistence, MAX_RECENT_ENTRIES } from './usage';
export type { UsagePersistence, UsageTarget } from './usage';
export { renderIcon } from './icons';

export { DEFAULT_LABELS } from './types';
export type {
  IconInput,
  BadgeVariant,
  CommandPaletteController,
  PaletteContext,
  CommandContext,
  Command,
  Step,
  StepContext,
  Context,
  Option,
  Result,
  Scope,
  Selection,
  StepOptionsContext,
  SearchContext,
  SearchCallback,
  StepOptionsCallback,
  UsageEntry,
  LoadUsageCallback,
  SaveUsageCallback,
  FeedbackContext,
  RenderFeedbackCallback,
  Labels,
  Mode,
  Display,
  PaletteEventDetail,
  ResultSelectEventDetail,
  ActionEventDetail,
  BeforeActionCallback,
  BeforeResultSelectCallback,
} from './types';

export { enableLogging, disableLogging, resetLogging, setLogLevel, setCategoryLevel, LOGGING_CATEGORIES } from './logger';

// Type declarations for build-time constants
declare const __VERSION__: string;
declare const __PACKAGE_NAME__: string;
declare const __AUTHOR__: string;
declare const __LICENSE__: string;
declare const __REPOSITORY__: string;
declare const __HOMEPAGE__: string;

// Defines <web-command-palette>, publishes build metadata + logging controls on
// window.components['web-command-palette'], and wires getInstances().
registerComponent('web-command-palette', CommandPaletteElement as unknown as CustomElementConstructor, {
  config: {
    name: typeof __PACKAGE_NAME__ !== 'undefined' ? __PACKAGE_NAME__ : '@keenmate/web-commandpalette',
    version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0',
    author: typeof __AUTHOR__ !== 'undefined' ? __AUTHOR__ : 'Keenmate s.r.o.',
    license: typeof __LICENSE__ !== 'undefined' ? __LICENSE__ : 'MIT',
    repository: typeof __REPOSITORY__ !== 'undefined' ? __REPOSITORY__ : '',
    homepage: typeof __HOMEPAGE__ !== 'undefined' ? __HOMEPAGE__ : '',
  },
  logging,
});

declare global {
  interface HTMLElementTagNameMap {
    'web-command-palette': CommandPaletteElement;
  }
}
