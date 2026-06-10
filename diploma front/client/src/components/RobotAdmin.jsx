import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { robotService } from "@/api/robotService";
import { Trash2, Edit, Plus, Settings2 } from "lucide-react";

const RobotAdmin = () => {
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRobot, setEditingRobot] = useState(null);
  const [editName, setEditName] = useState("");
  const [editToken, setEditToken] = useState("");
  
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadRobots = async () => {
    setLoading(true);
    try {
      const data = await robotService.getAll();
      setRobots(data);
    } catch (e) {
      console.error("Failed to load robots", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRobots();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Увага: видалення робота також видалить всю його історію сесій. Продовжити?")) return;
    try {
      await robotService.delete(id);
      loadRobots();
    } catch (e) {
      alert("Помилка при видаленні.");
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    try {
      await robotService.update(editingRobot.id, { name: editName, hardwareToken: editToken });
      setEditingRobot(null);
      loadRobots();
    } catch (e) {
      alert("Помилка при збереженні.");
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await robotService.create({ name: newName });
      setIsCreating(false);
      setNewName("");
      loadRobots();
    } catch (e) {
      alert("Помилка при створенні.");
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center gap-3">
            <Settings2 className="text-purple-400" /> Управління Роботами
          </h1>
          <p className="text-slate-400 text-sm mt-1">Додавання, редагування та видалення дронів</p>
        </div>
        <Button 
          onClick={() => setIsCreating(true)} 
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold shadow-[0_0_20px_rgba(168,85,247,0.4)]"
        >
          <Plus className="mr-2 h-4 w-4" /> Додати Робота
        </Button>
      </div>

      {isCreating && (
        <Card className="bg-slate-900/80 border-purple-500/30 p-6 shadow-[0_0_30px_rgba(168,85,247,0.1)] backdrop-blur-xl animate-in slide-in-from-top-4">
          <h2 className="text-lg font-bold text-white mb-4">Створення нового робота</h2>
          <div className="flex gap-4 items-center">
            <input 
              type="text" 
              placeholder="Назва робота (напр. Delta Drone)" 
              value={newName} 
              onChange={e => setNewName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            />
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-500">Зберегти</Button>
            <Button onClick={() => setIsCreating(false)} variant="outline" className="text-slate-400 border-slate-700 hover:bg-slate-800">Скасувати</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center text-slate-500 p-10">Завантаження...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {robots.map((robot) => (
            <Card key={robot.id} className="bg-slate-900 border-slate-800 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-xl">
              {editingRobot?.id === robot.id ? (
                <div className="flex flex-col gap-4">
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                  <input 
                    type="text" 
                    value={editToken} 
                    onChange={e => setEditToken(e.target.value)}
                    placeholder="Hardware Token"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-purple-500"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={handleUpdate} className="bg-emerald-600 hover:bg-emerald-500 flex-1">Зберегти</Button>
                    <Button size="sm" onClick={() => setEditingRobot(null)} variant="outline" className="flex-1 border-slate-700 text-slate-400 hover:bg-slate-800">Скасувати</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold text-white">{robot.name}</h3>
                      <div className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${robot.isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800/50 text-slate-500 border border-slate-700'}`}>
                        {robot.isOnline ? 'ONLINE' : 'OFFLINE'}
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-6">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">ID / Токен Обладнання</p>
                        <p className="text-xs font-mono text-purple-400 bg-purple-500/10 p-2 rounded border border-purple-500/20 break-all">
                          {robot.hardwareToken || "Приховано (лише адмін)"}
                        </p>
                      </div>
                      {robot.lastKnownIp && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Остання IP-адреса</p>
                          <p className="text-sm text-slate-300 font-mono">{robot.lastKnownIp}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                      onClick={() => {
                        setEditingRobot(robot);
                        setEditName(robot.name);
                        setEditToken(robot.hardwareToken || "");
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" /> Редагувати
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300 px-3"
                      onClick={() => handleDelete(robot.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default RobotAdmin;
