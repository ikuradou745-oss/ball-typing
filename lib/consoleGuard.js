export const CONSOLE_METHODS = Object.freeze([
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
  'dir',
  'dirxml',
  'table',
  'group',
  'groupCollapsed',
  'groupEnd',
  'time',
  'timeEnd',
  'timeLog',
  'count',
  'countReset',
  'assert',
  'clear',
  'profile',
  'profileEnd',
]);

const GUARD_INSTALLED_FLAG = '__btConsoleAndInspectGuardInstalled';

export function isBlockedInspectShortcut(event) {
  if (!event) return false;
  const rawKey = typeof event.key === 'string' ? event.key : '';
  const key = rawKey.toLowerCase();
  const keyCode = Number(event.keyCode || event.which || 0);
  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);
  const shift = Boolean(event.shiftKey);
  const alt = Boolean(event.altKey);

  // F12
  if (key === 'f12' || keyCode === 123) {
    return true;
  }
  // Ctrl/Cmd + Shift + I / J / C / K / E (DevTools, Console, Element Inspector, Network)
  if (ctrlOrMeta && shift && (key === 'i' || key === 'j' || key === 'c' || key === 'k' || key === 'e')) {
    return true;
  }
  // macOS Cmd + Option + I / J / C / U
  if (event.metaKey && alt && (key === 'i' || key === 'j' || key === 'c' || key === 'u')) {
    return true;
  }
  // Ctrl/Cmd + U (View Source)
  if (ctrlOrMeta && !alt && key === 'u') {
    return true;
  }
  // Ctrl/Cmd + S (Save Page)
  if (ctrlOrMeta && !shift && !alt && key === 's') {
    return true;
  }
  return false;
}

export function disableBrowserConsole(targetWindow) {
  if (!targetWindow || typeof targetWindow !== 'object') return false;
  const noop = Object.freeze(() => {});
  const originalConsole = targetWindow.console && typeof targetWindow.console === 'object'
    ? targetWindow.console
    : {};

  for (const method of CONSOLE_METHODS) {
    try {
      Object.defineProperty(originalConsole, method, {
        value: noop,
        writable: false,
        configurable: false,
        enumerable: true,
      });
    } catch {
      try {
        originalConsole[method] = noop;
      } catch {
        // Ignore read-only host console properties
      }
    }
  }

  try {
    const desc = Object.getOwnPropertyDescriptor(targetWindow, 'console');
    if (!desc || desc.configurable) {
      Object.defineProperty(targetWindow, 'console', {
        get: () => originalConsole,
        set: () => {},
        configurable: false,
        enumerable: true,
      });
    }
  } catch {
    // Some environments lock window.console; individual methods above are already silenced
  }
  return true;
}

export function installConsoleAndInspectGuard(
  targetWindow = typeof window !== 'undefined' ? window : null,
  targetDocument = typeof document !== 'undefined' ? document : null
) {
  if (!targetWindow || typeof targetWindow !== 'object') {
    return false;
  }
  if (targetWindow[GUARD_INSTALLED_FLAG]) {
    return true;
  }

  try {
    Object.defineProperty(targetWindow, GUARD_INSTALLED_FLAG, {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch {
    targetWindow[GUARD_INSTALLED_FLAG] = true;
  }

  disableBrowserConsole(targetWindow);

  const handleContextMenu = (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  };

  const handleKeyDown = (event) => {
    if (!isBlockedInspectShortcut(event)) return;
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  };

  if (typeof targetWindow.addEventListener === 'function') {
    targetWindow.addEventListener('contextmenu', handleContextMenu, { capture: true });
    targetWindow.addEventListener('keydown', handleKeyDown, { capture: true });
  }
  if (targetDocument && typeof targetDocument.addEventListener === 'function') {
    targetDocument.addEventListener('contextmenu', handleContextMenu, { capture: true });
    targetDocument.addEventListener('keydown', handleKeyDown, { capture: true });
  }

  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installConsoleAndInspectGuard(window, document);
}
