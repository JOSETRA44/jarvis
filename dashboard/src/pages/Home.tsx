import { useEffect, useState } from 'react';
import { Terminal, Users, Zap, Clock } from 'lucide-react';
import { api, type Command, type BotStatus } from '../lib/api';
import GlassCard from '../components/GlassCard';
import StatusBadge from '../components/StatusBadge';

interface StatCardProps {
  icon: typeof Terminal;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <GlassCard style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ padding: 10, borderRadius: 8, background: `${color}20`, border: `1px solid ${color}40` }}>
          <Icon size={20} color={color} />
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
        </div>
      </div>
    </GlassCard>
  );
}

export default function Home() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.commands.recent(10), api.bots.list()])
      .then(([cmds, b]) => { setCommands(cmds); setBots(b); })
      .finally(() => setLoading(false));
  }, []);

  const connectedBots = bots.filter((b) => b.status === 'connected').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          JARVIS Dashboard
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Control remoto de terminal via WhatsApp & Telegram
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard icon={Zap} label="Bots conectados" value={connectedBots} color="var(--success)" />
        <StatCard icon={Terminal} label="Comandos hoy" value={commands.length} color="var(--primary)" />
        <StatCard icon={Users} label="Operadores" value="—" color="var(--warning)" />
        <StatCard icon={Clock} label="Uptime" value="activo" color="var(--primary)" />
      </div>

      {/* Bot status row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {bots.map((bot) => (
          <GlassCard key={bot.platform} style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {bot.platform === 'whatsapp' ? '📱 WhatsApp' : '✈️ Telegram'}
            </div>
            <StatusBadge status={bot.status} />
            {bot.identifier && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {bot.identifier}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      {/* Recent commands */}
      <GlassCard>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
          Comandos recientes
        </h2>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Cargando...</div>
        ) : commands.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No hay comandos aún.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {commands.map((cmd) => (
              <div
                key={cmd.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: cmd.exitCode === 0 ? 'var(--success-dim)' : 'var(--danger-dim)',
                    color: cmd.exitCode === 0 ? 'var(--success)' : 'var(--danger)',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  {cmd.exitCode === 0 ? 'OK' : 'ERR'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cmd.input}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(cmd.executedAt).toLocaleTimeString()} · {Math.round(cmd.durationMs)}ms
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
