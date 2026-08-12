import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Form, Input, Typography, Alert, theme } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login } from '../api/auth';

const { Title } = Typography;

export default function Login() {
  const { token } = theme.useToken();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from ?? '/dashboard';

  async function submit(values: { username: string; password: string }) {
    setErr('');
    setBusy(true);
    try {
      await login(values.username, values.password);
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e.message ?? '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: token.colorBgLayout,
      }}
    >
      <div
        style={{
          width: 384,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          padding: '32px 28px 28px',
          boxShadow: token.boxShadowSecondary,
        }}
      >
        {/* 品牌区 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#001529',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              fontWeight: 700,
              margin: '0 auto 12px',
            }}
          >
            R
          </div>
          <Title level={2} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            准入认证控制台
          </Title>
        </div>

        {/* 错误提示 */}
        {err && (
          <Alert type="error" showIcon title={err} style={{ marginBottom: 16 }} />
        )}

        {/* 登录表单 */}
        <Form onFinish={submit} layout="vertical" size="middle">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="账号"
              autoFocus
              disabled={busy}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              disabled={busy}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={busy} block>
              {busy ? '登录中…' : '登录'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12 }}>
          <Typography.Text type="secondary">RADIUS 802.1X 企业内网准入 · v2.4.1</Typography.Text>
        </div>
      </div>
    </div>
  );
}
