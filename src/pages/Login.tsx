import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login } from '../api/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from ?? '/dashboard';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username, password);
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e.message ?? '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={submit}>
        <div className="login-brand">
          <div className="side-mark">R</div>
          <h2>准入认证控制台</h2>
        </div>
        {err && <div className="login-error">{err}</div>}
        <label>
          <span>账号</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            disabled={busy}
          />
        </label>
        <label>
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
