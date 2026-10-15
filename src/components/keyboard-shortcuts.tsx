'use client';

import { useEffect } from 'react';

export function KeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('input, textarea, select'))
      ) {
        return;
      }

      if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('[data-shortcut-search]');
        if (search) {
          event.preventDefault();
          search.focus();
        }
      } else if (event.key.toLowerCase() === 'n') {
        const addButton = document.querySelector<HTMLButtonElement>('[data-shortcut-new]');
        if (addButton && !addButton.disabled) {
          event.preventDefault();
          addButton.click();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
