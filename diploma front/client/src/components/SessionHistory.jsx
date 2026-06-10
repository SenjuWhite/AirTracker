import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { authService } from "@/api/authService";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

const SessionHistory = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${SERVER_URL}/api/sessions`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setSessions(data);
        }
      } catch (e) {
        console.error("Error fetching sessions:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, []);

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
        Історія місій
      </h1>

      {loading ? (
        <p className="text-slate-400">Завантаження...</p>
      ) : sessions.length === 0 ? (
        <p className="text-slate-400">Сесій ще не знайдено.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sessions.map((session) => (
            <Card 
              key={session.id} 
              className="bg-slate-900 border-slate-800 p-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-colors"
              onClick={() => navigate(`/session/${session.id}`)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-cyan-400 font-bold mb-1">
                    Робот: {session.robotName}
                  </p>
                  <p className="text-slate-500 text-sm">
                    Оператор: <span className="text-slate-300">{session.userName}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs">
                    {new Date(session.startTime).toLocaleString()}
                  </p>
                  <p className="text-slate-500 text-xs">
                    Точок даних: <span className="text-slate-300 font-mono">{session.dataPointsCount}</span>
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SessionHistory;
