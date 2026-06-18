import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { connectWS, onWSMessage } from '../lib/ws';
import GlassCard from '../components/GlassCard';

export default function TerminalPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#080810',
        foreground: '#F0F0FF',
        cursor: '#00E5FF',
        cursorAccent: '#080810',
        selectionBackground: 'rgba(0,229,255,0.2)',
        green: '#00FF88',
        brightGreen: '#00FF88',
        cyan: '#00E5FF',
        brightCyan: '#00E5FF',
        red: '#FF4757',
        brightRed: '#FF4757',
        yellow: '#FFB800',
        brightYellow: '#FFB800',
      },
      fontFamily: "'JetBrains Mono', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    term.writeln('\x1b[36m╔══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[36m║  JARVIS — Remote Terminal Controller  ║\x1b[0m');
    term.writeln('\x1b[36m╚══════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mEsperando comandos de operadores...\x1b[0m');
    term.writeln('');

    connectWS();
    const unsub = onWSMessage((msg) => {
      if (msg.type === 'output' && msg.data) {
        term.write(msg.data);
      }
    });

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(containerRef.current!);

    return () => {
      unsub();
      observer.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 56px)' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Terminal en vivo
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Output en tiempo real de los comandos ejecutados por operadores vía WhatsApp o Telegram
        </p>
      </div>

      <GlassCard style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            jarvis — output stream
          </span>
        </div>
        <div ref={containerRef} style={{ flex: 1, padding: 8 }} />
      </GlassCard>
    </div>
  );
}
