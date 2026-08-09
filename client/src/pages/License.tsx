import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setToken } from '../lib/api';

export interface LicenseStatus {
  state: 'trial' | 'active' | 'expiring' | 'expired' | 'tampered';
  machine_id: string;
  licensed_until: string | null;
  licensed_from: string | null;
  days_left: number;
  trial: boolean;
  message: string;
  customer_name: string | null;
  support_phone?: string;
}

export function LicensePage(): ReactNode {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['license-status'],
    queryFn: () => api.get<LicenseStatus>('/api/license/status'),
    refetchInterval: 60_000,
  });
  const status = statusQuery.data;

  async function onActivate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post<LicenseStatus>('/api/license/activate', { code: code.trim() });
      await queryClient.invalidateQueries({ queryKey: ['license-status'] });
      // Token clear karo taake user fresh login kare — naya key check karke
      // dobara login hone tak software access na ho
      setToken(null);
      window.location.assign('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activation fail hui');
    } finally {
      setBusy(false);
    }
  }

  function copyMachineId(): void {
    if (!status) return;
    navigator.clipboard?.writeText(status.machine_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const locked = status?.state === 'expired' || status?.state === 'tampered';

  // Step-by-step instructions — naya customer aur renewal dono ke liye
  const isNewCustomer = status?.state === 'trial' || !status?.customer_name;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,.1)', width: 480 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 8, color: '#1a5632' }}>Danish Cattle Feed</h2>
        <p style={{ textAlign: 'center', marginBottom: 24, color: '#666' }}>
          {locked ? '🔒 License Activation Required' : 'License Activation'}
        </p>

        {status ? (
          <div style={{ padding: 12, marginBottom: 16, borderRadius: 4, background: locked ? '#fee' : '#efe', border: `1px solid ${locked ? '#c00' : '#0a0'}` }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
              {locked ? '🔒' : '🔑'}{' '}
              {status.state === 'expired' ? 'License Khatam' : status.state === 'tampered' ? 'License Kharab / Tampered' : status.trial ? `Trial — ${status.days_left} din baqi` : `Active — ${status.days_left} din baqi`}
            </div>
            <div style={{ fontSize: 14 }}>{status.message}</div>
            {status.customer_name && <div style={{ fontSize: 13, marginTop: 4 }}>Licensed to: <b>{status.customer_name}</b></div>}
            {status.licensed_until && <div style={{ fontSize: 13, marginTop: 4 }}>Valid till: {status.licensed_until}</div>}
          </div>
        ) : <div style={{ textAlign: 'center', marginBottom: 16 }}>Loading...</div>}

        {/* Machine ID box — prominent, copy-able */}
        <div style={{ marginBottom: 12, padding: 12, background: '#f0f0f0', borderRadius: 4 }}>
          <span>Machine ID: </span>
          <b style={{ fontSize: 16, letterSpacing: 1 }}>{status?.machine_id ?? '...'}</b>
          <button type="button" onClick={copyMachineId} style={{ marginLeft: 8, padding: '2px 8px', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Step-by-step guide */}
        <div style={{ marginBottom: 16, padding: 12, background: '#fffde7', borderRadius: 4, border: '1px solid #e6d54e', fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#8a6d00' }}>
            📋 {isNewCustomer ? 'Naya Customer?' : 'License Renewal?'} Aese karein:
          </div>
          <div>① Upar wali <b>Machine ID</b> copy karein (Copy button daba ke).</div>
          <div>② Ye Machine ID software walay (admin) ko WhatsApp/call karein{status?.support_phone ? <> — <b>{status.support_phone}</b></> : null}.</div>
          <div>③ Admin aap ko ek <b>activation code</b> bhejega — wo code neeche paste karein.</div>
          <div>④ <b>Activate</b> button dabayein. License activate ho jayega.</div>
          <div>⑤ Phir login page par <b>username</b> aur <b>password</b> daal kar login karein.</div>
          {!isNewCustomer && (
            <div style={{ marginTop: 6, color: '#555', fontStyle: 'italic' }}>
              💡 Renewal code par aap ka purana username/password change nahi hoga — wahi se login karein.
            </div>
          )}
        </div>

        <form onSubmit={onActivate}>
          {error && <div style={{ color: '#c00', marginBottom: 8, padding: 8, background: '#fee', borderRadius: 4 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Activation Code paste karein</label>
            <textarea value={code} onChange={e => setCode(e.target.value)} rows={4} placeholder="eyJ... jaisa lamba code yahan paste karein" required style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'Consolas, monospace', fontSize: '0.8rem', resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={busy || !code.trim()} style={{ width: '100%', padding: 10, background: '#1a5632', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
            {busy ? 'Activate ho raha hai...' : '✓ Activate License'}
          </button>
        </form>

        {!locked && (
          <button type="button" onClick={() => window.location.assign('/login')} style={{ width: '100%', marginTop: 8, padding: 8, background: 'transparent', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
            ← Wapis login par jayen
          </button>
        )}
      </div>
    </div>
  );
}
