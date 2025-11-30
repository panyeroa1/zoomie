/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '@/lib/state';

export default function Header() {
  const { toggleSidebar, theme, toggleTheme } = useUI();

  return (
    <header>
      <div className="header-left">
        <h1>
          Zoomie
          <span style={{ color: 'var(--accent-red)' }}>.</span>
        </h1>
      </div>
      <div className="header-right">
        <button 
          className="theme-button" 
          onClick={toggleTheme}
          aria-label="Toggle Theme"
        >
          <span className="icon">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
        <button
          className="settings-button"
          onClick={toggleSidebar}
          aria-label="Settings"
        >
          <span className="icon">settings</span>
        </button>
      </div>
    </header>
  );
}