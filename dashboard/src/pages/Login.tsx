import { useState } from 'react';
import { Cpu } from 'lucide-react';
import { api } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(password);
      if (res.token) {
        localStorage.setItem('jarvis_token', res.token);
        onLogin();
      } else {
        setError('Contraseña incorrecta');
      }
    } catch {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(0,229,255,0.04) 0%, var(--bg-base) 70%)',
      }}
    >
      <div style={{ width: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
              background: 'var(--primary-dim)', border: '1px solid var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 32px rgba(0,229,255,0.15)',
            }}
          >
            <Cpu size={28} color="var(--primary)" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 2, marginBottom: 6 }}>
            JARVIS
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Remote Terminal Controller</p>
        </div>

        {/* Form */}
        <form
          onSubmit={submit}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 28, backdropFilter: 'blur(12px)',
          }}
        >
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Contraseña del dashboard
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 8,
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
              background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', marginTop: 16, padding: '12px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#000', fontSize: 14, fontWeight: 700,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !password ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
