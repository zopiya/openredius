import { Navigate, useLocation } from 'react-router-dom';
import { MODE } from '../api/config';
import { isAuthenticated } from '../api/auth';

/** 路由守卫:http 模式下未登录 → /login; mock 模式直通。 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const loc = useLocation();

  if (MODE === 'mock') return <>{children}</>;

  if (!isAuthenticated() && loc.pathname !== '/login') {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}
