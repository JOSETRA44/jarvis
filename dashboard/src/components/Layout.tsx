import { NavLink, Outlet } from 'react-router-dom';
import { Terminal, Users, Bot, Settings, Home, Cpu } from 'lucide-react';

const nav = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/operators', icon: Users, label: 'Operadores' },
  { to: '/bots', icon: Bot, label: 'Bots' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

export default function Layout() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: 'rgba(255,255,255,0.02)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 0',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--primary-dim)',
                border: '1px solid var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={18} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: 1 }}>
                JARVIS
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Terminal Controller</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--primary-dim)' : 'transparent',
                border: isActive ? '1px solid rgba(0,229,255,0.2)' : '1px solid transparent',
                transition: 'all 0.15s',
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>v1.0.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <Outlet />
      </main>
    </div>
  );
}
