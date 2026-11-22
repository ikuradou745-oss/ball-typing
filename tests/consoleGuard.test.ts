import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSOLE_METHODS,
  disableBrowserConsole,
  installConsoleAndInspectGuard,
  isBlockedInspectShortcut,
} from '../lib/consoleGuard.js';

test('isBlockedInspectShortcut blocks DevTools, console, view-source, and save shortcuts only', () => {
  assert.equal(isBlockedInspectShortcut({ key: 'F12' }), true);
  assert.equal(isBlockedInspectShortcut({ keyCode: 123 }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'I', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'J', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'C', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'K', metaKey: true, shiftKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'i', metaKey: true, altKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 'u', ctrlKey: true }), true);
  assert.equal(isBlockedInspectShortcut({ key: 's', ctrlKey: true }), true);

  // Normal typing and normal copy/paste must remain allowed
  assert.equal(isBlockedInspectShortcut({ key: 'a' }), false);
  assert.equal(isBlockedInspectShortcut({ key: 'c', ctrlKey: true }), false);
  assert.equal(isBlockedInspectShortcut({ key: 'v', ctrlKey: true }), false);
  assert.equal(isBlockedInspectShortcut({ key: 'Enter' }), false);
});

test('disableBrowserConsole and installConsoleAndInspectGuard silence console and cancel inspect events', () => {
  let calledOriginal = false;
  const mockConsole = {
    log: () => {
      calledOriginal = true;
    },
    warn: () => {
      calledOriginal = true;
    },
    error: () => {
      calledOriginal = true;
    },
  };
  const listeners = new Map();
  const mockTarget = {
    console: mockConsole,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
  };

  assert.equal(disableBrowserConsole(mockTarget), true);
  for (const method of CONSOLE_METHODS) {
    assert.equal(typeof mockTarget.console[method], 'function');
  }
  mockTarget.console.log('secret');
  mockTarget.console.warn('secret');
  mockTarget.console.error('secret');
  assert.equal(calledOriginal, false);

  assert.equal(installConsoleAndInspectGuard(mockTarget, mockTarget), true);

  let prevented = false;
  let stopped = false;
  for (const fn of listeners.get('contextmenu') || []) {
    fn({
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    });
  }
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  let f12Prevented = false;
  for (const fn of listeners.get('keydown') || []) {
    fn({
      key: 'F12',
      preventDefault() {
        f12Prevented = true;
      },
      stopPropagation() {},
    });
  }
  assert.equal(f12Prevented, true);

  let typingPrevented = false;
  for (const fn of listeners.get('keydown') || []) {
    fn({
      key: 'a',
      preventDefault() {
        typingPrevented = true;
      },
      stopPropagation() {},
    });
  }
  assert.equal(typingPrevented, false);
});
