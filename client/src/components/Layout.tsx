import { useState } from 'react';
import { Radio, LogOut, Menu, X, Home, Settings, Disc } from 'lucide-react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { User } from '../App';

export default function Layout({ user, setUser }: { user: User; setUser: (u: User | null) => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.auth.logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-300`}>
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            {sidebarOpen ? <Menu size={20} /> : <Menu size={20} />}
          </button>
          {sidebarOpen && (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-bnt-500 to-bnt-700 rounded-lg flex items-center justify-center">
                <Radio size={16} className="text-white" />
              </div>
              <span className="text-lg font-bold">BNTcast</span>
            </Link>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Link to="/" className={location.pathname === '/' ? 'sidebar-link-active' : 'sidebar-link'}>
            <Home size={18} />
            {sidebarOpen && <span>Dashboard</span>}
          </Link>
          {sidebarOpen && (
            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stations</p>
            </div>
          )}
          <Link to="/" className="sidebar-link">
            <Disc size={18} />
            {sidebarOpen && <span>All Stations</span>}
          </Link>
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 bg-bnt-600 rounded-full flex items-center justify-center text-sm font-bold">
              {user.name.charAt(0)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
          <button onClick={handleLogout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut size={18} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
        <div className="text-center text-xs text-gray-600 py-4">Developed by BNTworx</div>
      </main>
    </div>
  );
}
