import { useEffect, useState } from 'react';
import { Power, RefreshCw } from 'lucide-react';
import { api, type BotStatus } from '../lib/api';
import { connectWS, onWSMessage } from '../lib/ws';
import GlassCard from '../components/GlassCard';
import StatusBadge from '../components/StatusBadge';

export default function Bots() {
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);

  const load = () => api.bots.list().then(setBots);

  useEffect(() => {
    load();
    connectWS();

    const unsub = onWSMessage((msg) => {
      if (msg.type === 'bot_status') load();
      if (msg.type === 'qr' && msg.data) setQr(msg.data);
    });

    return unsub;
  }, []);

  const fetchQR = async () => {
    setLoadingQR(true);
    try {
      const res = await api.bots.qr();
      setQr(res.qr);
    } catch {
      alert('QR no disponible. Asegúrate de que el bot de WhatsApp esté iniciando.');
    } finally {
      setLoadingQR(false);
    }
  };

  const disconnect = async (platform: string) => {
    if (!confirm(`¿Desconectar ${platform}?`)) return;
    await api.bots.disconnect(platform);
    load();
  };

  const waBot = bots.find((b) => b.platform === 'whatsapp');
  const tgBot = bots.find((b) => b.platform === 'telegram');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Bots</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Gestiona las conexiones de WhatsApp y Telegram
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* WhatsApp Card */}
        <GlassCard glow={waBot?.status === 'connected' ? 'success' : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>📱 WhatsApp</div>
            {waBot && <StatusBadge status={waBot.status} />}
          </div>

          {waBot?.identifier && (
            <div style={{ marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
              {waBot.identifier}
            </div>
          )}

          {waBot?.status !== 'connected' && (
            <div style={{ marginBottom: 16 }}>
              {qr ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Escanea este QR desde WhatsApp → Dispositivos vinculados
                  </p>
                  <img
                    src={qr}
                    alt="WhatsApp QR Code"
                    style={{
                      width: 200, height: 200, borderRadius: 12,
                      border: '2px solid var(--success)',
                      background: '#fff',
                      display: 'block',
                      margin: '0 auto',
                    }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
                    El QR expira en 60 segundos
                  </p>
                </div>
              ) : (
                <button
                  onClick={fetchQR}
                  disabled={loadingQR}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 8, width: '100%', justifyContent: 'center',
                    border: '1px solid var(--success)', background: 'var(--success-dim)',
                    color: 'var(--success)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    opacity: loadingQR ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={15} className={loadingQR ? 'spin' : ''} />
                  {loadingQR ? 'Cargando QR...' : 'Mostrar QR'}
                </button>
              )}
            </div>
          )}

          {waBot?.status === 'connected' && (
            <button
              onClick={() => disconnect('whatsapp')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderRadius: 8, border: '1px solid var(--danger)',
                background: 'var(--danger-dim)', color: 'var(--danger)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              <Power size={15} /> Desconectar
            </button>
          )}
        </GlassCard>

        {/* Telegram Card */}
        <GlassCard glow={tgBot?.status === 'connected' ? 'success' : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>✈️ Telegram</div>
            {tgBot ? (
              <StatusBadge status={tgBot.status} />
            ) : (
              <StatusBadge status="disconnected" />
            )}
          </div>

          {tgBot?.identifier && (
            <div style={{ marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
              {tgBot.identifier}
            </div>
          )}

          {!tgBot || tgBot.status === 'disconnected' ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ marginBottom: 10 }}>Para conectar Telegram:</p>
              <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>Habla con <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>@BotFather</code> en Telegram</li>
                <li>Crea un bot con <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>/newbot</code></li>
                <li>Copia el token al archivo <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>.env</code></li>
                <li>Reinicia JARVIS</li>
              </ol>
            </div>
          ) : (
            <button
              onClick={() => disconnect('telegram')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderRadius: 8, border: '1px solid var(--danger)',
                background: 'var(--danger-dim)', color: 'var(--danger)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              <Power size={15} /> Desconectar
            </button>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
