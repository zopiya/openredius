import { Route, Routes } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Launcher from './pages/Launcher';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import AuthLogs from './pages/AuthLogs';
import UsersPage from './pages/Users';
import Policies from './pages/Policies';
import Devices from './pages/Devices';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="*"
        element={
          <AuthGuard>
            <Routes>
              <Route path="/" element={<Launcher />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/auth-logs" element={<AuthLogs />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/policies" element={<Policies />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
