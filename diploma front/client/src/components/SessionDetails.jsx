import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { worstLevel, LEVEL_COLOR } from "@/lib/gasThresholds";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

const gasConfig = {
  co2:     { danger: 24000, warn: 16000, label: "CO2",   short: "CO₂" },
  ch4:     { danger: 500,   warn: 300,   label: "CH4",   short: "CH₄" },
  co:      { danger: 50,    warn: 25,    label: "CO",    short: "CO"  },
  alcohol: { danger: 100,   warn: 50,    label: "Спирт", short: "Alc" },
  nh3:     { danger: 30,    warn: 15,    label: "NH3",   short: "NH₃" },
};

const SessionDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [activeChartGas, setActiveChartGas] = useState("co2");
  const videoRef    = useRef(null);
  const mapCanvasRef = useRef(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${SERVER_URL}/api/sessions/${id}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (response.ok) setSession(await response.json());
        else console.error("Session not found or forbidden");
      } catch (e) {
        console.error("Error fetching session:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [id]);

  const dataPoints = session?.telemetryData?.dataPoints || [];

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext("2d");
    const width  = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const currentPoints = dataPoints.filter(dp => dp.timeOffsetMs <= currentTimeMs);
    if (currentPoints.length === 0) return;

    const scale = 30;
    const cx = width / 2;
    const cy = height / 2;
    const current    = currentPoints[currentPoints.length - 1];
    const mapX = (p) => -p.y * scale;
    const mapY = (p) => -p.x * scale;
    const currentMapX = mapX(current);
    const currentMapY = mapY(current);

    ctx.save();
    ctx.translate(cx - currentMapX, cy - currentMapY);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 1;
    const step = scale;
    const vsx  = Math.floor((-cx + currentMapX) / step) * step - step;
    const vex  = vsx + width  + step * 2;
    const vsy  = Math.floor((-cy + currentMapY) / step) * step - step;
    const vey  = vsy + height + step * 2;
    ctx.beginPath();
    for (let x = vsx; x <= vex; x += step) { ctx.moveTo(x, vsy); ctx.lineTo(x, vey); }
    for (let y = vsy; y <= vey; y += step) { ctx.moveTo(vsx, y); ctx.lineTo(vex, y); }
    ctx.stroke();

    ctx.lineWidth  = 3;
    ctx.lineCap    = "round";
    ctx.lineJoin   = "round";
    let segStart = 0;
    while (segStart < currentPoints.length - 1) {
      const segLevel = worstLevel(currentPoints[segStart + 1].sensors?.gases);
      ctx.beginPath();
      ctx.strokeStyle = LEVEL_COLOR[segLevel];
      ctx.moveTo(mapX(currentPoints[segStart]), mapY(currentPoints[segStart]));
      let k = segStart + 1;
      ctx.lineTo(mapX(currentPoints[k]), mapY(currentPoints[k]));
      while (k < currentPoints.length - 1 && worstLevel(currentPoints[k + 1].sensors?.gases) === segLevel) {
        k++;
        ctx.lineTo(mapX(currentPoints[k]), mapY(currentPoints[k]));
      }
      ctx.stroke();
      segStart = k;
    }

    ctx.translate(currentMapX, currentMapY);
    ctx.rotate(-(current.angle || 0) - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-6, 5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.shadowBlur  = 8;
    ctx.shadowColor = "#38bdf8";
    ctx.fillStyle   = "#38bdf8";
    ctx.fill();

    ctx.restore();
  }, [currentTimeMs, dataPoints]);

  if (loading) return <div className="p-6 text-slate-400">Завантаження...</div>;
  if (!session) return (
    <div className="p-6">
      <Button onClick={() => navigate("/history")} variant="outline" className="mb-4">← Назад до історії</Button>
      <p className="text-red-400">Сесію не знайдено або немає доступу.</p>
    </div>
  );

  const getGasValue = (dp, gas) => {
    if (!dp?.sensors?.gases) return 0;
    switch (gas) {
      case "co2":     return dp.sensors.gases.mq135?.co2     || 0;
      case "ch4":     return dp.sensors.gases.mq4?.ch4       || 0;
      case "co":      return dp.sensors.gases.mq135?.co      || 0;
      case "alcohol": return dp.sensors.gases.mq135?.alcohol || 0;
      case "nh3":     return dp.sensors.gases.mq135?.nh3     || 0;
      default: return 0;
    }
  };

  const currentDp = dataPoints.length > 0
    ? dataPoints.reduce((prev, curr) =>
        Math.abs(curr.timeOffsetMs - currentTimeMs) < Math.abs(prev.timeOffsetMs - currentTimeMs)
          ? curr : prev
      )
    : null;

  let maxVal = 0, minVal = Infinity;
  dataPoints.forEach(dp => {
    const v = getGasValue(dp, activeChartGas);
    if (v > maxVal) maxVal = v;
    if (v < minVal) minVal = v;
  });
  if (minVal === Infinity) minVal = 0;

  const activeConfig = gasConfig[activeChartGas];
  const chartData    = dataPoints.map(dp => ({
    timeSec: parseFloat((dp.timeOffsetMs / 1000).toFixed(1)),
    val: getGasValue(dp, activeChartGas),
  }));

  const domainMax  = Math.max(maxVal + activeConfig.danger * 0.1, activeConfig.danger * 1.2);
  const pDanger    = `${(Math.max(0, 1 - activeConfig.danger  / domainMax) * 100).toFixed(2)}%`;
  const pWarn      = `${(Math.max(0, 1 - activeConfig.warn    / domainMax) * 100).toFixed(2)}%`;

  const colorClass = (val) =>
    val >= activeConfig.danger ? "text-red-500" :
    val >= activeConfig.warn   ? "text-orange-400" : "text-emerald-400";

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTimeMs(videoRef.current.currentTime * 1000);
  };

  const durationSec = chartData.length > 0 ? chartData[chartData.length - 1].timeSec : 0;

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-6rem)] p-4 overflow-hidden">

      <div className="col-span-7 flex flex-col gap-4 h-full min-h-0">

        <div className="flex-shrink-0 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0"></span>
            Місія: {session.robotName}
          </h1>
          <Button
            onClick={() => navigate("/history")}
            variant="outline"
            size="sm"
            className="text-slate-300 border-slate-700 hover:bg-slate-800"
          >
            ← Повернутись
          </Button>
        </div>

        <Card className="flex-none bg-slate-900 border-slate-800 shadow-xl rounded-xl overflow-hidden">
          {session.videoFilePath ? (
            <video
              ref={videoRef}
              src={`${SERVER_URL}${session.videoFilePath}`}
              controls
              className="w-full block rounded-lg"
              style={{ maxHeight: "calc(50vh - 3rem)", objectFit: "contain" }}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleTimeUpdate}
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center bg-black rounded-lg">
              <span className="text-slate-500 text-sm">Відео відсутнє</span>
            </div>
          )}
        </Card>

        <Card className="flex-1 min-h-0 bg-slate-900 border-slate-800 shadow-xl flex flex-col p-3">
          <p className="flex-shrink-0 text-[10px] uppercase font-bold text-slate-500 mb-1">
            Графік {activeConfig.label} (ppm)
          </p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="sdGasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"      stopColor="#ef4444" />
                    <stop offset={pDanger} stopColor="#ef4444" />
                    <stop offset={pDanger} stopColor="#f97316" />
                    <stop offset={pWarn}   stopColor="#f97316" />
                    <stop offset={pWarn}   stopColor="#10b981" />
                    <stop offset="100%"    stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="timeSec"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}s`}
                />
                <YAxis domain={[0, domainMax]} stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", fontSize: 11 }}
                  labelFormatter={(l) => `${l} с`}
                />
                <Line
                  type="monotone"
                  dataKey="val"
                  name={`${activeConfig.label} (ppm)`}
                  stroke="url(#sdGasGrad)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <ReferenceLine
                  x={parseFloat((currentTimeMs / 1000).toFixed(1))}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="col-span-5 flex flex-col gap-3 h-full min-h-0">

        <Card className="flex-shrink-0 bg-slate-900 border-slate-800 p-3 flex flex-col gap-2">
          <p className="text-[9px] uppercase font-bold text-slate-500">Інформація</p>
          <div className="flex gap-4 text-xs text-slate-400">
            <span>Оператор: <span className="text-white font-semibold">{session.userName}</span></span>
            <span className="font-mono">{new Date(session.startTime).toLocaleString("uk-UA")}</span>
            <span className="ml-auto font-mono text-slate-500">{durationSec} с</span>
          </div>

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {Object.entries(gasConfig).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setActiveChartGas(key)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                  activeChartGas === key
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                {cfg.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] font-mono">
              <span className={colorClass(maxVal)}>↑{maxVal}</span>
              <span className="text-slate-600 mx-1">/</span>
              <span className={colorClass(minVal)}>↓{minVal}</span>
              <span className="text-slate-600 ml-1">ppm</span>
            </span>
          </div>
        </Card>

        <div className="flex-shrink-0 grid grid-cols-2 gap-2">
          {Object.entries(gasConfig).map(([key, cfg]) => {
            const val = currentDp ? getGasValue(currentDp, key) : 0;
            const danger = val >= cfg.danger;
            const warn   = val >= cfg.warn;
            return (
              <Card
                key={key}
                onClick={() => setActiveChartGas(key)}
                className={`bg-slate-900 border-slate-800 p-2 relative overflow-hidden cursor-pointer hover:bg-slate-800 transition-colors ${
                  activeChartGas === key ? "ring-2 ring-cyan-500" : ""
                }`}
              >
                <div className={`absolute top-0 left-0 w-1 h-full ${
                  danger ? "bg-red-500" : warn ? "bg-orange-400" : "bg-emerald-400"
                }`} />
                <p className="text-[9px] uppercase text-slate-500 font-bold ml-2">{cfg.label}</p>
                <div className="flex justify-between items-end ml-2">
                  <span className={`text-lg font-black font-mono tracking-tighter ${
                    danger ? "text-red-500" : warn ? "text-orange-400" : "text-emerald-400"
                  }`}>
                    {val}
                  </span>
                  <span className="text-[9px] text-slate-600 mb-0.5">PPM</span>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="flex-1 min-h-0 bg-slate-900 border-slate-800 shadow-xl flex flex-col relative overflow-hidden">
          <h3 className="text-[9px] uppercase font-bold text-slate-500 absolute top-2 left-3 z-10 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-sm">
            Карта руху
          </h3>
          <div className="w-full h-full relative">
            <canvas
              ref={mapCanvasRef}
              width={500}
              height={500}
              className="w-full h-full object-cover"
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SessionDetails;
