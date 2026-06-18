import { useEffect, useState } from 'react';
import { Save, Shield, Zap, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import GlassCard from '../components/GlassCard';

type Mode = 'ai' | 'restricted' | 'full-shell';

const MODES: { value: Mode; label: string; desc: string; color: string; icon: typeof Zap }[] = [
  {
    value: 'ai',
    label: 'Modo AI',
    desc: 'Solo comandos de Gemini CLI y GitHub Copilot. Máxima seguridad.',
    color: 'var(--primary)',
    icon: Zap,
  },
  {
    value: 'restricted',
    label: 'Modo Restringido',
    desc: 'Solo los comandos que el operador tenga en su whitelist de permisos.',
    color: 'var(--warning)',
    icon: Shield,
  },
  {
    value: 'full-shell',
    label: 'Shell Completo',
    desc: 'Cualquier comando del sistema. Solo para operadores con permiso full-shell.',
    color: 'var(--danger)',
    icon: AlertTriangle,
  },
];

export default function Settings() {
  const [mode, setMode] = useState<Mode>('ai');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.config.get().then((cfg) => setMode(cfg.mode as Mode));
  }, []);

  const save = async () => {
    setSaving(true);
    await api.config.update({ mode });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 680 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Configuración
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Modo de operación y ajustes de seguridad de JARVIS
        </p>
      </div>

      {/* Mode selector */}
      <GlassCard>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Modo de operación
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Controla qué comandos pueden ejecutar los operadores desde la mensajería.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MODES.map(({ value, label, desc, color, icon: Icon }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                onClick={() => setMode(value)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: 16, borderRadius: 10, width: '100%', textAlign: 'left',
                  border: `1px solid ${active ? color : 'var(--border)'}`,
                  background: active ? `${color}12` : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: `${color}20`, border: `1px solid ${color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon size={18} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: active ? color : 'var(--text-primary)', marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
                </div>
                <div
                  style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `2px solid ${active ? color : 'var(--border)'}`,
                    background: active ? color : 'transparent',
                  }}
                />
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Info card */}
      <GlassCard style={{ background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.2)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--warning)' }}>Recuerda:</strong> El modo se aplica globalmente a todos los operadores.
            Los permisos individuales de cada operador actúan como un filtro adicional. Para
            máxima seguridad, mantén el modo en <strong>AI</strong> y otorga permisos elevados solo cuando sea necesario.
          </div>
        </div>
      </GlassCard>

      {/* Env vars info */}
      <GlassCard>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
          Variables de entorno (.env)
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          {[
            ['DASHBOARD_PASSWORD', 'Contraseña del dashboard'],
            ['COMMAND_TIMEOUT_SECONDS', 'Timeout máximo por comando'],
            ['RATE_LIMIT_PER_MINUTE', 'Límite de comandos/minuto por operador'],
            ['DEFAULT_CWD', 'Directorio de trabajo por defecto'],
            ['WA_AUTH_TYPE', 'qr | code — método de auth WhatsApp'],
            ['TELEGRAM_BOT_TOKEN', 'Token del bot de Telegram'],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <code style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-mono)', minWidth: 230 }}>{key}</code>
              <span style={{ fontSize: 12 }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          Edita el archivo <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>.env</code> en la raíz del proyecto y reinicia JARVIS para aplicar cambios.
        </p>
      </GlassCard>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px 24px', borderRadius: 10, border: 'none',
          background: saved ? 'var(--success)' : 'var(--primary)',
          color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700,
          opacity: saving ? 0.7 : 1, transition: 'all 0.2s', alignSelf: 'flex-start',
        }}
      >
        <Save size={16} />
        {saved ? '¡Guardado!' : saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}
