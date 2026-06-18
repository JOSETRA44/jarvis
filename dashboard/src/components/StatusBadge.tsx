type Status = 'connected' | 'disconnected' | 'connecting' | 'error';

const config: Record<Status, { color: string; label: string; pulse: boolean }> = {
  connected: { color: 'var(--success)', label: 'Conectado', pulse: true },
  connecting: { color: 'var(--warning)', label: 'Conectando...', pulse: true },
  disconnected: { color: 'var(--text-secondary)', label: 'Desconectado', pulse: false },
  error: { color: 'var(--danger)', label: 'Error', pulse: false },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { color, label, pulse } = config[status] ?? config.disconnected;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: pulse ? `0 0 6px ${color}` : 'none',
          animation: pulse ? 'pulse 2s infinite' : 'none',
        }}
      />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <span style={{ color }}>{label}</span>
    </span>
  );
}
