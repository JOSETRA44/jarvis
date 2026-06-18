import { useEffect, useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, ShieldCheck } from 'lucide-react';
import { api, type Operator } from '../lib/api';
import GlassCard from '../components/GlassCard';

const PERMISSIONS = ['ai', 'restricted', 'full-shell', 'interactive', 'admin'];

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: '📱 WhatsApp',
  telegram: '✈️ Telegram',
};

const PERM_COLORS: Record<string, string> = {
  ai: 'var(--primary)',
  restricted: 'var(--warning)',
  'full-shell': 'var(--danger)',
  interactive: 'var(--danger)',
  admin: '#CC88FF',
};

export default function Operators() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    platform: 'whatsapp' as 'whatsapp' | 'telegram',
    identifier: '',
    displayName: '',
    permissions: ['ai'],
  });

  const load = () => api.operators.list().then(setOperators).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const toggleEnabled = async (op: Operator) => {
    await api.operators.update(op.id, { enabled: !op.enabled });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este operador?')) return;
    await api.operators.delete(id);
    load();
  };

  const togglePerm = (p: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  const submit = async () => {
    if (!form.identifier || !form.displayName) return;
    await api.operators.create(form);
    setForm({ platform: 'whatsapp', identifier: '', displayName: '', permissions: ['ai'] });
    setShowForm(false);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Operadores
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Números y cuentas autorizadas para controlar JARVIS
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 8, border: '1px solid var(--primary)',
            background: 'var(--primary-dim)', color: 'var(--primary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <GlassCard glow="primary">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Nuevo operador</h3>

            <div style={{ display: 'flex', gap: 12 }}>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as 'whatsapp' | 'telegram' }))}
                style={inputStyle}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
              <input
                placeholder="Identificador (número o chat ID)"
                value={form.identifier}
                onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                placeholder="Nombre"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Permisos</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PERMISSIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePerm(p)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: `1px solid ${PERM_COLORS[p] ?? 'var(--border)'}`,
                      background: form.permissions.includes(p) ? `${PERM_COLORS[p]}25` : 'transparent',
                      color: form.permissions.includes(p) ? PERM_COLORS[p] : 'var(--text-secondary)',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submit} style={{ ...btnStyle, background: 'var(--primary)', color: '#000' }}>
                Guardar
              </button>
              <button onClick={() => setShowForm(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Table */}
      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 14 }}>Cargando...</div>
        ) : operators.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <ShieldCheck size={40} color="var(--text-secondary)" style={{ marginBottom: 12 }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              No hay operadores. Agrega el primero.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Plataforma', 'Identificador', 'Nombre', 'Permisos', 'Estado', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id} style={{ borderBottom: '1px solid var(--border)', opacity: op.enabled ? 1 : 0.5 }}>
                  <td style={td}>{PLATFORM_LABELS[op.platform]}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--primary)' }}>{op.identifier}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{op.displayName}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {op.permissions.map((p) => (
                        <span key={p} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${PERM_COLORS[p] ?? 'gray'}20`, color: PERM_COLORS[p] ?? 'gray', border: `1px solid ${PERM_COLORS[p] ?? 'gray'}40` }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={td}>
                    <button onClick={() => toggleEnabled(op)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: op.enabled ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                      {op.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                  </td>
                  <td style={td}>
                    <button onClick={() => remove(op.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)',
};
