/**
 * 保真度审计:原型静态 HTML 与 React 运行时渲染(真实挂载、骨架加载完成后)对比。
 * 规则见脚本内 allowlist / markers 注释;多变体挂载(如设备页双 Tab)结果取并集。
 */
import { existsSync, readFileSync } from 'node:fs';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

import { Window } from 'happy-dom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/Toast';
import Launcher from '../src/pages/Launcher';
import Dashboard from '../src/pages/Dashboard';
import Sessions from '../src/pages/Sessions';
import AuthLogs from '../src/pages/AuthLogs';
import UsersPage from '../src/pages/Users';
import Policies from '../src/pages/Policies';
import Devices from '../src/pages/Devices';
import Reports from '../src/pages/Reports';
import Settings from '../src/pages/Settings';

const OD =
  process.env.OPENRADIUS_PROTO_DIR ??
  '/Users/zopiya/Library/Application Support/Open Design/namespaces/release-stable/data/projects/9a01259b-d4ce-4246-99c0-9fa84278542e';

// 原型静态 HTML 仅存在于设计机(或经 OPENRADIUS_PROTO_DIR 指定的副本);缺失时
// 审计无法运行——打印告警并跳过,而非崩溃阻断整个 verify(CI 与 Codespace 无原型)。
if (!existsSync(OD)) {
  console.warn(`[fidelity] SKIP: prototype dir not found: ${OD}`);
  console.warn('[fidelity] set OPENRADIUS_PROTO_DIR to a prototype copy to enable the audit');
  process.exit(0);
}

/** 原型 JS 钩子类 + 条件渲染(骨架/空态/错误态/抽屉内/明文密钥)才出现的类 */
const CLASS_ALLOWLIST = new Set([
  'save-btn', 'op-detail', 'op-kick', 'op-user', 'op-edit', 'op-ports', 'op-revoke', 'op-remove', 'sel-row',
  'tbl-skel', 'sk-line', 'w-40', 'w-60', 'w-80',   // 骨架:加载完成后卸载
  'state-empty', 'state-error', 'adv', 'detail-row',
  'crumb', 'sep', 'cur', 'kv', 'plain', 'd-sec', 'd-sec-t',   // 抽屉/模态内容:打开才挂载(测试已覆盖)
  'notice', 'grow', 'port-grid',                    // 设备抽屉离线提示/端口格
  'secret-val',                                     // Secret 明文:切换才挂载
  'bg-warn', 'show', 'on', 'off',
]);

/** 条件块文案标记:缺失片段若落在任一标记出现的 ±窗口内,视为已知差异 */
const CONDITIONAL_TEXT_MARKERS = [
  '没有在线会话', '会话数据加载失败', '没有符合条件的认证记录', '日志数据加载失败',
  '没有符合条件的用户', '用户数据加载失败', '没有符合条件的设备', '设备数据加载失败',
  '没有符合条件的终端', '已选', '清除选择', '完整RADIUS属性',
  '高级筛选', '自定义日期', '认证详情', '确认操作',
  '用户详情', '所属策略组', '绑定终端', '历史认证记录',
  '端口接入状态', 'SSID接入状态', '接入明细', '设备当前离线',
  '编辑策略', '确认保存策略变更', '确认修改核心端口',
  'R@dius-S3cr3t', '批量导入MAC白名单',
  '认证失败原因分布', '终端类型准入情况',   // 环图图例为 JS 注入,React 声明式渲染,顺序交织
];

function parseStatic(html: string): Document {
  const win = new Window();
  return new (win as any).DOMParser().parseFromString(html, 'text/html') as unknown as Document;
}

function classSet(root: ParentNode): Set<string> {
  const set = new Set<string>();
  root.querySelectorAll('[class]').forEach((el) => {
    (el.getAttribute('class') ?? '').split(/\s+/).forEach((c) => c && set.add(c));
  });
  return set;
}

/** 原型侧:移除 script/style/svg 后取去空白文本(svg 不参与文本对比) */
function protoExtract(doc: Document): { classes: Set<string>; text: string } {
  const classes = classSet(doc);
  doc.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());
  const text = ((doc as any).body?.textContent ?? '').replace(/\s+/g, '');
  return { classes, text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 挂载页面(可多路由变体),骨架加载完成后取样;类与文本取并集 */
async function mountExtract(Comp: any, routes: string[]): Promise<{ classes: Set<string>; text: string }> {
  const classes = new Set<string>();
  let text = '';
  for (const route of routes) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(
      createElement(MemoryRouter, { initialEntries: [route] },
        createElement(ToastProvider, null, createElement(Comp))),
    );
    await sleep(800);
    classSet(container).forEach((c) => classes.add(c));
    container.querySelectorAll('svg').forEach((el) => el.remove());
    text += (container.textContent ?? '').replace(/\s+/g, '') + '|';
    root.unmount();
    container.remove();
    document.body.classList.remove('drawer-open');
  }
  return { classes, text };
}

/** 缺失片段是否落在任一标记的出现窗口内(标记前 80 字 / 后 240 字) */
function nearMarker(protoText: string, i: number, markers: string[]): boolean {
  return markers.some((m) => {
    let at = protoText.indexOf(m);
    while (at >= 0) {
      if (i > at - 80 && i < at + m.length + 240) return true;
      at = protoText.indexOf(m, at + 1);
    }
    return false;
  });
}

const PAGES = [
  { file: 'index.html', routes: ['/'], Comp: Launcher, title: 'Launcher' },
  { file: 'dashboard.html', routes: ['/dashboard'], Comp: Dashboard, title: 'Dashboard' },
  { file: 'sessions.html', routes: ['/sessions'], Comp: Sessions, title: 'Sessions' },
  { file: 'auth-logs.html', routes: ['/auth-logs'], Comp: AuthLogs, title: 'AuthLogs' },
  { file: 'users.html', routes: ['/users'], Comp: UsersPage, title: 'Users' },
  { file: 'policies.html', routes: ['/policies'], Comp: Policies, title: 'Policies' },
  { file: 'devices.html', routes: ['/devices', '/devices#tab=ep'], Comp: Devices, title: 'Devices' },
  { file: 'reports.html', routes: ['/reports'], Comp: Reports, title: 'Reports' },
  { file: 'settings.html', routes: ['/settings'], Comp: Settings, title: 'Settings' },
] as const;

const markers = CONDITIONAL_TEXT_MARKERS.map((m) => m.replace(/\s+/g, ''));
let issues = 0;

for (const { file, routes, Comp, title } of PAGES) {
  const protoDoc = parseStatic(readFileSync(OD + '/' + file, 'utf8'));
  const proto = protoExtract(protoDoc);
  const react = await mountExtract(Comp, [...routes]);

  const missingClasses = [...proto.classes].filter((c) => !react.classes.has(c) && !CLASS_ALLOWLIST.has(c));

  const missingChunks: { chunk: string; i: number }[] = [];
  for (let i = 0; i + 12 <= proto.text.length; i += 12) {
    const chunk = proto.text.slice(i, i + 12);
    if (!react.text.includes(chunk)) missingChunks.push({ chunk, i });
  }
  const realMissing = missingChunks.filter(({ i }) => !nearMarker(proto.text, i, markers)).map(({ chunk }) => chunk);

  if (missingClasses.length === 0 && realMissing.length === 0) {
    console.log('OK    ' + title);
    continue;
  }
  issues++;
  console.log('CHECK ' + title);
  if (missingClasses.length) console.log('  missing classes: ' + missingClasses.join(', '));
  if (realMissing.length) {
    console.log('  missing text chunks (' + realMissing.length + '):');
    realMissing.slice(0, 30).forEach((s) => console.log('    - ' + s));
    if (realMissing.length > 30) console.log('    ... ' + (realMissing.length - 30) + ' more');
  }
}

console.log(issues === 0 ? '\nFIDELITY CLEAN' : '\n' + issues + ' page(s) need review');
process.exit(issues === 0 ? 0 : 2);
