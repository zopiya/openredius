/**
 * 渲染冒烟测试:用 react-dom/server 对全部路由做首次渲染,
 * 不依赖浏览器即可捕获 JSX 运行时错误(未定义访问、组件缺失等)。
 */
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { ToastProvider } from '../src/components/Toast';

const paths = [
  '/',
  '/dashboard',
  '/sessions',
  '/auth-logs',
  '/auth-logs#result=失败&nas=SW-5F-01',
  '/users',
  '/users#user=wang.lei',
  '/policies',
  '/devices',
  '/devices#tab=ep',
  '/reports',
  '/reports#reason=账号锁定',
  '/settings',
];

let failed = 0;
for (const p of paths) {
  try {
    const html = renderToString(
      <MemoryRouter initialEntries={[p]}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>,
    );
    if (html.length < 800) {
      failed++;
      console.error('SUSPECT (too short)', p, html.length);
    } else {
      console.log('OK   ', p, html.length + ' chars');
    }
  } catch (e) {
    failed++;
    console.error('FAIL ', p, e);
  }
}

if (failed) {
  console.error(failed + ' route(s) failed');
  process.exit(1);
}
console.log('All routes rendered successfully');
