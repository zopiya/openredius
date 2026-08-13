import { Link } from 'react-router-dom';
import {
  AuditOutlined, BarChartOutlined, CloudServerOutlined, DashboardOutlined,
  SafetyCertificateOutlined, SettingOutlined, TeamOutlined, LineChartOutlined,
} from '@ant-design/icons';
import { useTitle } from '../hooks/useTitle';

const CARDS = [
  { to: '/dashboard', icon: DashboardOutlined, title: '仪表盘', desc: '在线终端、成功率、24 小时认证趋势与实时告警一览' },
  { to: '/sessions', icon: LineChartOutlined, title: '在线会话', desc: '当前接入终端清单,支持强制下线与 RADIUS 属性查看' },
  { to: '/auth-logs', icon: AuditOutlined, title: '认证日志', desc: '全量认证记录,失败原因分类筛选与聚合分析入口' },
  { to: '/users', icon: TeamOutlined, title: '用户管理', desc: 'AD/LDAP 同步账号、终端绑定、策略组分配与状态管理' },
  { to: '/policies', icon: SafetyCertificateOutlined, title: '策略管理', desc: '802.1X 准入策略:认证协议、VLAN 下发、合规校验与优先级' },
  { to: '/devices', icon: CloudServerOutlined, title: '设备管理', desc: '准入网络设备(NAS)与终端准入清单,端口级接入状态' },
  { to: '/reports', icon: BarChartOutlined, title: '报表统计', desc: '失败原因分布、部门准入情况与设备负载 TOP 排行' },
  { to: '/settings', icon: SettingOutlined, title: '系统设置', desc: 'RADIUS 参数、证书、AD/LDAP 对接、RBAC 与告警通知' },
] as const;

/** 启动页 — 对应原型 index.html */
export default function Launcher() {
  useTitle();
  return (
    <div className="launch" data-od-id="launcher">
      <div className="launch-brand">
        <div className="side-mark">R</div>
        <h1>准入认证控制台</h1>
        <p>企业内网 RADIUS 802.1X 准入管理 · 8 个页面 · 桌面端高保真原型</p>
      </div>
      <div className="launch-grid">
        {CARDS.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} className="launch-card" to={to} data-od-id={`nav-${to.slice(1)}`}>
            <Icon className="icon" />
            <b>{title}</b>
            <span>{desc}</span>
            <i>进入 →</i>
          </Link>
        ))}
      </div>
      <div className="launch-foot">无计费 · 无账务 —— 仅准入认证 / 策略下发 / 审计</div>
    </div>
  );
}
