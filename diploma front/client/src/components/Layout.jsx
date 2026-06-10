import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/api/authService';
import { Button } from '@/components/ui/button';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-cyan-500/30">
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-900/20 blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none"></div>

      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-slate-950/60 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-wider flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="relative flex items-center justify-center w-6 h-6">
              <span className="absolute w-full h-full rounded-full bg-cyan-500/30 animate-ping"></span>
              <span className="relative w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"></span>
            </div>
            AirTracker <span className="text-slate-600 text-xs font-mono font-bold mt-1 tracking-widest uppercase"></span>
          </Link>

          <div className="flex bg-slate-900/50 rounded-xl p-1.5 border border-white/5 shadow-inner">
            <Link
              to="/"
              className={`px-5 py-2 rounded-lg text-sm font-bold tracking-wide transition-all ${location.pathname === '/' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              ПАНЕЛЬ КЕРУВАННЯ
            </Link>
            <Link
              to="/history"
              className={`px-5 py-2 rounded-lg text-sm font-bold tracking-wide transition-all ${location.pathname === '/history' || location.pathname.startsWith('/session') ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              ІСТОРІЯ МІСІЙ
            </Link>
            {authService.getUserRole() === 'admin' && (
              <Link
                to="/admin/robots"
                className={`px-5 py-2 rounded-lg text-sm font-bold tracking-wide transition-all ${location.pathname === '/admin/robots' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                АДМІН ПАНЕЛЬ
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <span className="text-emerald-500 text-xs font-bold uppercase tracking-widest">Система</span>
            <span className="text-emerald-400 font-mono font-bold text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>
              ОНЛАЙН
            </span>
          </div>

          <div className="h-8 w-px bg-slate-800"></div>

          <Button variant="ghost" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 font-bold uppercase text-xs tracking-wider transition-colors rounded-full px-6" onClick={handleLogout}>
            Вихід
          </Button>
        </div>
      </nav>

      <main className="relative z-10 p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
