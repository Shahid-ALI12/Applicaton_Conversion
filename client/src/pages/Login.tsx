import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, setToken } from '../lib/api';
import type { LicenseStatus } from './License';

export function LoginPage(): ReactNode {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [licenseCheck, setLicenseCheck] = useState<'loading' | 'ok'>('loading');

  // License check: agar expired/tampered ho to seedha /license par bhej do
  useEffect(() => {
    api.get<LicenseStatus>('/api/license/status')
      .then(s => {
        if (s.state === 'expired' || s.state === 'tampered') {
          window.location.assign('/license');
        } else {
          setLicenseCheck('ok');
        }
      })
      .catch(() => {
        // Agar status check fail ho (e.g. server down), login form dikhate hain
        setLicenseCheck('ok');
      });
  }, []);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ token: string; user: { id: number; name: string; role: string } }>('/api/auth/login', { username, password });
      setToken(res.token);
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login fail hui');
    } finally {
      setBusy(false);
    }
  }

  if (licenseCheck === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div>License check ho raha hai...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,.1)', width: 360 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#1a5632' }}>Danish Cattle Feed</h2>
        {error && <div style={{ color: '#c00', marginBottom: 12, padding: 8, background: '#fee', borderRadius: 4 }}>{error}</div>}
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 10, background: '#1a5632', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
            {busy ? 'Login ho raha hai...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
