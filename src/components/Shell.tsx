import { type ReactNode, useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Gauge, KeyRound, LogOut,
  ScrollText, Search, Server, Settings, ShieldCheck, Users,
} from 'lucide-react';
import { Layout, Menu, Button, Dropdown, Input, Modal, Form, App } from 'antd';
import type { MenuProps } from 'antd';
import { useTitle } from '../hooks/useTitle';
import { fetchMe, logout } from '../api/auth';
import { MODE } from '../api/config';

const { Sider, Header, Content } = Layout;

const ALL_ITEMS = [
  { key: '/dashboard', label: '仪表盘', icon: Gauge, roles: ['admin', 'operator', 'auditor'] },
  { key: '/sessions', label: '在线会话', icon: Activity, roles: ['admin', 'operator', 'auditor'] },
  { key: '/auth-logs', label: '认证日志', icon: ScrollText, roles: ['admin', 'operator', 'auditor'] },
  { key: '/users', label: '用户管理', icon: Users, roles: ['admin', 'operator'] },
  { key: '/policies', label: '策略管理', icon: ShieldCheck, roles: ['admin'] },
  { key: '/devices', label: '设备管理', icon: Server, roles: ['admin'] },
  { key: '/reports', label: '报表统计', icon: BarChart3, roles: ['admin', 'operator', 'auditor'] },
  { key: '/settings', label: '系统设置', icon: Settings, roles: ['admin'] },
];

interface AdminInfo { username: string; display_name: string; role: string; }

const MOCK_ADMIN: AdminInfo = {
  username: 'admin',
  display_name: '管理员',
  role: 'admin',
};

export default function Shell({ page, children }: { page: string; children: ReactNode }) {
  useTitle(page);
  const loc = useLocation();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [me, setMe] = useState<AdminInfo>(MOCK_ADMIN);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (MODE === 'http') {
      fetchMe()
        .then((info) => setMe(info))
        .catch(() => { /* keep mock */ });
    }
  }, []);

  const display = me.display_name || me.username;
  const initial = display.charAt(0).toUpperCase();

  // 根据角色过滤菜单项
  const menuItems: MenuProps['items'] = useMemo(
    () =>
      ALL_ITEMS.filter((item) => item.roles.includes(me.role)).map(({ key, label, icon: Icon }) => ({
        key,
        icon: <Icon size={17} strokeWidth={1.75} />,
        label,
      })),
    [me.role],
  );

  // 获取当前选中菜单 key
  const selectedKeys = useMemo(() => {
    const match = ALL_ITEMS.find((item) => loc.pathname === item.key || loc.pathname.startsWith(item.key + '/'));
    return match ? [match.key] : [];
  }, [loc.pathname]);

  // 退出登录
  const handleLogout = () => {
    logout();
    nav('/login');
  };

  // 下拉菜单项
  const dropdownItems: MenuProps['items'] = [
    {
      key: 'password',
      icon: <KeyRound size={16} />,
      label: '修改密码',
      onClick: () => setPwOpen(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogOut size={16} />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={232}
        theme="dark"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 40,
          overflow: 'auto',
        }}
      >
        {/* 品牌区 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '20px 20px 14px',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#fff',
              color: '#0F1923',
              display: 'grid',
              placeItems: 'center',
              fontFamily: '"SF Pro Display", sans-serif',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            R
          </div>
          <div style={{ lineHeight: 1.25 }}>
            <b
              style={{
                display: 'block',
                fontFamily: '"SF Pro Display", sans-serif',
                fontSize: '14.5px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: '#fff',
              }}
            >
              准入认证控制台
            </b>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>RADIUS 802.1X</span>
          </div>
        </div>

        {/* 导航菜单 */}
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          items={menuItems}
          onClick={({ key }) => nav(key)}
          style={{ borderInlineEnd: 'none', flex: 1 }}
        />

        {/* 底部状态 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 20px 18px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: '11.5px',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#16a34a',
              flexShrink: 0,
            }}
          />
          RADIUS 服务正常 · v2.4.1
        </div>
      </Sider>

      {/* 右侧主区域 */}
      <Layout style={{ marginLeft: 232 }}>
        <Header
          data-od-id="topbar"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            height: 57,
            padding: '0 28px',
            background: 'rgba(255,255,255,0.84)',
            backdropFilter: 'saturate(180%) blur(12px)',
            borderBottom: '1px solid #e8e8ed',
            lineHeight: '57px',
          }}
        >
          <div
            style={{
              fontFamily: '"SF Pro Display", sans-serif',
              fontSize: '16.5px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 'normal',
            }}
          >
            {page}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* 搜索 */}
            <Input
              prefix={<Search size={14} strokeWidth={2} style={{ color: '#86868b' }} />}
              placeholder="搜索用户 / MAC / 设备"
              aria-label="搜索"
              style={{ width: 240 }}
            />

            {/* 用户下拉 */}
            <Dropdown menu={{ items: dropdownItems }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  height: 'auto',
                  padding: 0,
                  fontSize: '12.5px',
                  color: '#424245',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: '#1d1d1f',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  {initial}
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.3 }}>
                  {display}
                  <small style={{ display: 'block', color: '#6e6e73', fontSize: 11 }}>
                    {me.role === 'admin' ? '管理员' : me.role === 'operator' ? '运维' : '审计'}
                  </small>
                </div>
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content data-od-id="main" style={{ padding: '26px 28px 72px', maxWidth: 1440, width: '100%' }}>
          {children}
        </Content>
      </Layout>

      {/* 修改密码模态 */}
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} message={message} />
    </Layout>
  );
}

/* ── 修改密码模态 ──────────────────────────────────────── */

function ChangePasswordModal({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message: ReturnType<typeof App.useApp>['message'];
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      const values = await form.validateFields();
      if (values.new_password !== values.confirm_password) {
        message.error('两次输入不一致');
        return;
      }
      setBusy(true);
      const { fetchApi } = await import('../api/http');
      await fetchApi('/api/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      });
      message.success('密码修改成功');
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验失败
      message.error(e?.message || '修改失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="修改密码"
      onCancel={() => { onClose(); form.resetFields(); }}
      onOk={submit}
      confirmLoading={busy}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="old_password"
          label="旧密码"
          rules={[{ required: true, message: '请输入旧密码' }]}
        >
          <Input.Password autoFocus />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 10, message: '新密码至少 10 位' },
          ]}
        >
          <Input.Password placeholder="至少 10 位" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          rules={[{ required: true, message: '请确认新密码' }]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
