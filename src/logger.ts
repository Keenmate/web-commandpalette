/**
 * Categorized loggers for @keenmate/web-commandpalette — a thin shim over the core
 * logging module (`@keenmate/web-components-core`, SPEC §12.1).
 *
 * Categories (`COMMANDPALETTE:*`):
 * - INIT        — element lifecycle and configuration
 * - DATA        — provider calls (searchCallback / stepOptionsCallback)
 * - UI          — open/close, presentation
 * - INTERACTION — keyboard and selection
 *
 * ```js
 * window.components['web-command-palette'].logging.enableLogging();
 * ```
 */
import { createLoggers } from '@keenmate/web-components-core';

const CATEGORIES = ['INIT', 'DATA', 'UI', 'INTERACTION'] as const;

/** The core logger bundle; exposed on `window.components['web-command-palette'].logging`. */
export const logging = createLoggers('COMMANDPALETTE', CATEGORIES);

export const { enableLogging, disableLogging, setLogLevel, setCategoryLevel, LOGGING_CATEGORIES } = logging;
