/** Admin account management page (only visible to admin role). */

import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import Shell from '../components/Shell';
import { fetchApi } from '../api/http';
import { getAdmin } from '../api/auth';
import { MODE } from '../api/config';

interface AdminItem {
  id: number;
  username: string;
  display_name: string;
  role: string;
  status: string;
  created_at: string;
}

const MOCK_ADMINS: AdminItem[] = [
  { id: 1, username: 'admin', display_name: '管理员', role: 'admin', status: 'active', created_at: '2026-08-06T00:00:00Z' },
  { id: 2, username: 'op01', display_name: '运维小王', role: 'operator', status: 'active', created_at: '2026-08-10T00:00:00Z' },
  { id: 3, username: 'auditor01', display_name: '审计员', role: 'auditor', status: 'active', created_at: '2026-08-08T00:00:00Z' },
];

const ROLE_LABELS: Record<string, string> = { admin: '管理员', operator: '运维', auditor: '审计' };
const STATUS_LABELS: Record<string, string> = { active: '正常', disabled: '停用' };

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminItem[]>(MODE === 'mock' ? MOCK_ADMINS : []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const current = getAdmin();

  async function load() {
    if (MODE !== 'http') return;
    try {
      const body: any = await fetchApi('/api/auth/admins');
      setAdmins(body ?? []);
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function doDelete(id: number) {
    if (!confirm('确认删除该管理员？')) return;
    try {
      await fetchApi(`/api/auth/admins/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <Shell page="管理员账户">
      <div className="page-head">
        <h2>管理员账户</h2>
        <button type="button" className="btn btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
          <Plus className="icon" />新增管理员
        </button>
      </div>
      {err && <div className="toast toast--err">{err}</div>}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>用户名</th><th>显示名</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = current?.username === a.username;
              return (
                <tr key={a.id}>
                  <td><b>{a.username}</b>{isSelf ? ' (当前)' : ''}</td>
                  <td>{a.display_name || '-'}</td>
                  <td><span className={`badge badge--${a.role === 'admin' ? 'primary' : 'muted'}`}>{ROLE_LABELS[a.role] || a.role}</span></td>
                  <td><span className={`badge badge--${a.status === 'active' ? 'success' : 'danger'}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                  <td>{a.created_at?.slice(0, 10)}</td>
                  <td className="act">
                    <button
                      type="button" className="btn btn-sm"
                      onClick={() => { setEditId(a.id); setShowForm(true); }}
                      disabled={isSelf}
                      title={isSelf ? '不能修改自己' : '编辑'}
                    >
                      <ShieldCheck className="icon" />
                    </button>
                    <button
                      type="button" className="btn btn-sm btn-danger"
                      onClick={() => doDelete(a.id)}
                      disabled={isSelf}
                      title={isSelf ? '不能删除自己' : '删除'}
                    >
                      <Trash2 className="icon" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminForm
          editId={editId}
          admins={admins}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </Shell>
  );
}

/* ── 新建/编辑管理员表单 ────────────────────────────────── */

function AdminForm({ editId, admins, onClose, onSaved }: {
  editId: number | null;
  admins: AdminItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editId ? admins.find((a) => a.id === editId) : null;
  const [username, setUsername] = useState(existing?.username ?? '');
  const [displayName, setDisplayName] = useState(existing?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(existing?.role ?? 'operator');
  const [status, setStatus] = useState(existing?.status ?? 'active');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr('');
    if (!editId && !username) { setErr('用户名必填'); return; }
    if (!editId && password.length < 10) { setErr('密码至少 10 位'); return; }
    setBusy(true);
    try {
      if (editId) {
        await fetchApi(`/api/auth/admins/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: displayName, role, status,
            ...(password ? { password } : {}),
          }),
        });
      } else {
        await fetchApi('/api/auth/admins', {
          method: 'POST',
          body: JSON.stringify({ username, display_name: displayName, password, role }),
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-hd"><b>{editId ? '编辑管理员' : '新增管理员'}</b></div>
        <div className="modal-bd">
          {err && <div className="toast toast--err">{err}</div>}
          {!editId && (
            <label><span>用户名</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </label>
          )}
          <label><span>显示名</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label><span>{editId ? '新密码(留空不修改)' : '密码'}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 10 位" />
          </label>
          <label><span>角色</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">管理员</option>
              <option value="operator">运维</option>
              <option value="auditor">审计</option>
            </select>
          </label>
          {editId && (
            <label><span>状态</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">正常</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          )}
        </div>
        <div className="modal-act">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
