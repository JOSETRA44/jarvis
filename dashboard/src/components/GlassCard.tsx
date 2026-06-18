import type { ReactNode, CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  style?: CSSProperties;
  glow?: 'primary' | 'success' | 'warning' | 'danger';
}

const glowColors: Record<string, string> = {
  primary: 'rgba(0,229,255,0.08)',
  success: 'rgba(0,255,136,0.08)',
  warning: 'rgba(255,184,0,0.08)',
  danger: 'rgba(255,71,87,0.08)',
};

export default function GlassCard({ children, style, glow }: Props) {
  return (
    <div
      style={{
        background: glow ? glowColors[glow] : 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        backdropFilter: 'blur(12px)',
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
