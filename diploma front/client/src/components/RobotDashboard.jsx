import { robotService } from '@/api/robotService';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RobotDashboard() {
  const [robots, setRobots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchRobots = async () => {
    try {
      const data = await robotService.getAll();
      setRobots(data);
    } catch (error) {
      console.error("Помилка завантаження роботів", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRobots();
    const intervalId = setInterval(() => {
      fetchRobots();
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const handleClick = (robot) => {
    navigate(`/controller/${robot.id}`, { state: { ipAddress: robot.lastKnownIp} });
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto mt-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
          <span className="w-4 h-4 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.6)]"></span>
          Системи Роботів
        </h1>
        <p className="text-slate-400 text-sm">Управління та моніторинг доступних апаратів</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <span className="text-cyan-500 font-mono animate-pulse">Завантаження систем...</span>
        </div>
      ) : robots.length === 0 ? (
        <div className="w-full p-12 border border-slate-800 border-dashed rounded-xl flex items-center justify-center bg-slate-900/50">
          <span className="text-slate-500 font-mono text-sm">Немає доступних роботів у мережі</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {robots.map(robot => (
            <Card 
              key={robot.id} 
              className="bg-slate-900/80 backdrop-blur-md border-slate-800 p-6 flex flex-col gap-5 hover:border-cyan-500/50 transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">{robot.name}</h3>
                  <span className="text-xs font-mono text-slate-500">ID: {robot.id.toString().padStart(4, '0')}</span>
                </div>
                
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${robot.isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${robot.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                  {robot.isOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">IP Адреса</span>
                  <span className="text-slate-300 font-mono">{robot.lastKnownIp || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Тип підключення</span>
                  <span className="text-slate-300 font-mono">WebSocket</span>
                </div>
              </div>

              <Button 
                onClick={() => handleClick(robot)} 
                disabled={!robot.isOnline || robot.isBusy}
                className={`w-full mt-2 font-bold tracking-wide ${
                  robot.isBusy 
                    ? 'bg-orange-900/50 text-orange-400 border border-orange-500/50 cursor-not-allowed hover:bg-orange-900/50' 
                    : robot.isOnline 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
                      : 'bg-slate-800 text-slate-500 hover:bg-slate-800 cursor-not-allowed'
                }`}
              >
                {robot.isBusy ? 'ВЖЕ ЗАЙНЯТО' : robot.isOnline ? 'КЕРУВАТИ' : 'НЕДОСТУПНИЙ'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}