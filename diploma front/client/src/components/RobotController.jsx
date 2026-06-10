import React, { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import VideoStream from "./VideoStream";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { robotService } from "@/api/robotService";
import { authService } from "@/api/authService";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { worstLevel, LEVEL_COLOR, GAS_CONFIG } from "@/lib/gasThresholds";

const statusTranslations = {
  Online: "Онлайн",
  Offline: "Офлайн",
  Disconnected: "Відключено",
};

const actionTranslations = {
  STOP: "СТОП",
  FORWARD: "ВПЕРЕД",
  BACKWARD: "НАЗАД",
  LEFT: "ЛІВОРУЧ",
  RIGHT: "ПРАВОРУЧ",
  FORWARD_LEFT: "ВПЕРЕД-ЛІВОРУЧ",
  FORWARD_RIGHT: "ВПЕРЕД-ПРАВОРУЧ",
};

const gasNames = {
  co2: "CO2",
  ch4: "CH4",
  co: "CO",
  alcohol: "Alcohol",
  nh3: "NH3",
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL;
const WS_URL = SERVER_URL.replace(/^http/, "ws");

const ROBOT_SPEED = 0.3;
const ACCEL_THRESHOLD = 0.05;
const COLLISION_WINDOW_MS = 1200;

const TURN_COMMANDS = new Set([
  "left", "right",
  "forward_left", "forward_right",
  "backward_left", "backward_right",
]);

const RobotController = () => {
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const [status, setStatus] = useState("Offline");
  const [currentAction, setCurrentAction] = useState("STOP");

  const [sensors, setSensors] = useState({ gases: { mq4: {ch4: 0, voltage: 0}, mq135: {co2: 0, co: 0, alcohol: 0, nh3: 0, voltage: 0} }, imu: {accelX:0, accelY:0, gyroZ:0} });
  const sensorsRef = useRef({ gases: { mq4: {ch4: 0, voltage: 0}, mq135: {co2: 0, co: 0, alcohol: 0, nh3: 0, voltage: 0} }, imu: {accelX:0, accelY:0, gyroZ:0} });
  const [navData, setNavData] = useState({ speed: 0 });
  const [isSessionActive, setIsSessionActive] = useState(false);
  const isSessionActiveRef = useRef(false);
  const [liveChartData, setLiveChartData] = useState([]);
  const [activeChartGas, setActiveChartGas] = useState(null);
  const [osdData, setOsdData] = useState({ pitch: 0, roll: 0, cpuTemp: 0, chassisTemp: 0, wifiRssi: 0, batteryVoltage: 0, batteryPercent: 0 });
  const [ping, setPing] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessionDuration, setSessionDuration] = useState(0);
  const [logEntries, setLogEntries] = useState([]);
  const logScrollRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval;
    if (isSessionActive) {
      interval = setInterval(() => {
        if (sessionStartTimeRef.current > 0) {
          setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      setSessionDuration(0);
    }
    return () => clearInterval(interval);
  }, [isSessionActive]);

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h > '00' ? h + ':' : ''}${m}:${s}`;
  };

  const addLog = (type, message) => {
    const ts = new Date().toLocaleTimeString('uk-UA', { hour12: false });
    setLogEntries(prev => {
      const updated = [...prev, { ts, type, message }];
      return updated.length > 150 ? updated.slice(-150) : updated;
    });
  };

  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logEntries]);

  const videoImgRef = useRef(null);
  const canvasRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const robotPathRef = useRef([]);
  const currentPosRef = useRef({ x: 0, y: 0, angle: 0, speed: 0 });
  const mapScaleRef = useRef(30);
  const drawMapRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const telemetryDataRef = useRef([]);
  const sessionStartTimeRef = useRef(0);
  const animationFrameId = useRef(null);
  const mapRafRef = useRef(null);
  const mapDirtyRef = useRef(false);
  const collisionRef = useRef({ dir: null, noAccelStartMs: null, blocked: false });

  const activeKeys = useRef(new Set());
  const lastCommand = useRef("stop");
  const { robotId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [robotIp, setRobotIp] = useState(location.state?.ipAddress || null);

  useEffect(() => {
    if (!robotIp && robotId) {
      robotService.getById(robotId).then((data) => setRobotIp(data.ip));
    }
  }, [robotId, robotIp]);

  useEffect(() => {
    if (!robotId || !isSessionActive) return;

    const connect = () => {
      if (ws.current) ws.current.close();

      const token = localStorage.getItem("token");
      const socket = new WebSocket(
        `${WS_URL}/api/Movement/ws/${robotId}?token=${token}`
      );

      socket.onopen = () => {
        setStatus("Online");
        addLog("ok", "З'єднання з роботом встановлено");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "sensor" || data.type === "telemetry") {
            const isTelemetry = data.type === "telemetry";

            if (isTelemetry) {
              if (data.dt !== undefined) {
                setPing((data.dt * 1000).toFixed(0));
              }
              if (data.osd) {
                setOsdData({
                  pitch: data.osd.pitch || 0,
                  roll: data.osd.roll || 0,
                  cpuTemp: data.osd.cpuTemp || 0,
                  chassisTemp: data.osd.chassisTemp || 0,
                  wifiRssi: data.osd.wifiRssi || 0,
                  batteryVoltage: data.osd.batteryVoltage || 0,
                  batteryPercent: data.osd.batteryPercent || 0
                });
              }
            }

            if (isTelemetry && data.gases) {
              const updatedSensors = {
                gases: {
                  mq4: {
                    voltage: data.gases.mq4?.voltage || 0,
                    ch4: data.gases.mq4?.CH4 ?? data.gases.mq4?.ch4 ?? 0
                  },
                  mq135: {
                    voltage: data.gases.mq135?.voltage || 0,
                    co2: data.gases.mq135?.CO2 ?? data.gases.mq135?.co2 ?? 0,
                    co: data.gases.mq135?.CO ?? data.gases.mq135?.co ?? 0,
                    alcohol: data.gases.mq135?.Alcohol ?? data.gases.mq135?.alcohol ?? 0,
                    nh3: data.gases.mq135?.NH3 ?? data.gases.mq135?.nh3 ?? 0
                  }
                },
                imu: data.imu || { accelX: 0, accelY: 0, gyroZ: 0 }
              };
              setSensors(updatedSensors);
              sensorsRef.current = updatedSensors;

              const dt = data.dt || 0.1;
              const cmd = lastCommand.current;
              const gyroZ = updatedSensors.imu?.gyroZ || 0;
              const accelX = updatedSensors.imu?.accelX || 0;
              const prev = currentPosRef.current;

              let angle = prev.angle;
              if (TURN_COMMANDS.has(cmd)) {
                angle += gyroZ * dt;
              }

              let speed = 0;
              if (cmd === "forward") speed = ROBOT_SPEED;
              else if (cmd === "backward") speed = -ROBOT_SPEED;

              const col = collisionRef.current;
              if (cmd === "forward" || cmd === "backward") {
                if (col.dir !== cmd) {
                  col.dir = cmd;
                  col.noAccelStartMs = null;
                  col.blocked = false;
                }
                if (Math.abs(accelX) >= ACCEL_THRESHOLD) {
                  col.noAccelStartMs = null;
                  col.blocked = false;
                } else {
                  if (col.noAccelStartMs === null) col.noAccelStartMs = Date.now();
                  else if (Date.now() - col.noAccelStartMs > COLLISION_WINDOW_MS && !col.blocked) {
                    col.blocked = true;
                    addLog("warn", `Перешкода: рух «${actionTranslations[cmd.toUpperCase()] || cmd}» заблоковано`);
                  }
                }
                if (col.blocked) speed = 0;
              } else {
                col.dir = null;
                col.noAccelStartMs = null;
                col.blocked = false;
              }

              const x = prev.x + speed * Math.cos(angle) * dt;
              const y = prev.y + speed * Math.sin(angle) * dt;

              currentPosRef.current = { x, y, angle, speed };
              setNavData({ speed: Math.abs(speed) });
              robotPathRef.current.push({ x, y, level: worstLevel(updatedSensors.gases) });
              if (robotPathRef.current.length > 5000) {
                robotPathRef.current.shift();
              }
              mapDirtyRef.current = true;

              setLiveChartData(prev => {
                const newData = [...prev, {
                  time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  co2: updatedSensors.gases.mq135.co2,
                  ch4: updatedSensors.gases.mq4.ch4,
                  co: updatedSensors.gases.mq135.co,
                  alcohol: updatedSensors.gases.mq135.alcohol,
                  nh3: updatedSensors.gases.mq135.nh3
                }];
                if (newData.length > 50) return newData.slice(newData.length - 50);
                return newData;
              });

              if (isSessionActiveRef.current && sessionStartTimeRef.current > 0) {
                telemetryDataRef.current.push({
                  timeOffsetMs: Date.now() - sessionStartTimeRef.current,
                  command: lastCommand.current,
                  x,
                  y,
                  angle,
                  speed,
                  sensors: {
                    gases: updatedSensors.gases,
                    imu: updatedSensors.imu
                  }
                });
              }
            }
          }
        } catch (e) {
          console.error("Помилка парсингу даних:", e);
        }
      };

      socket.onclose = (e) => {
        setStatus("Disconnected");
        addLog("err", `З'єднання розірвано (код ${e.code})`);

        if (e.code === 4009) {
          alert("Робот вже зайнятий іншим оператором або вкладкою!");
          setIsSessionActive(false);
          isSessionActiveRef.current = false;
          navigate("/history");
          return;
        }

        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.current = socket;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, [robotId, isSessionActive]);

  const updateMovement = () => {
    const keys = activeKeys.current;
    let cmd = "stop";
    if (keys.has("w") && keys.has("a")) cmd = "forward_left";
    else if (keys.has("w") && keys.has("d")) cmd = "forward_right";
    else if (keys.has("w")) cmd = "forward";
    else if (keys.has("s")) cmd = "backward";
    else if (keys.has("a")) cmd = "left";
    else if (keys.has("d")) cmd = "right";

    if (
      cmd !== lastCommand.current &&
      ws.current?.readyState === WebSocket.OPEN
    ) {
      ws.current.send(cmd);
      lastCommand.current = cmd;
      setCurrentAction(cmd);
      addLog("cmd", actionTranslations[cmd.toUpperCase()] || cmd.toUpperCase());

      if (isSessionActiveRef.current && sessionStartTimeRef.current > 0) {
        telemetryDataRef.current.push({
          timeOffsetMs: Date.now() - sessionStartTimeRef.current,
          command: cmd,
          x: currentPosRef.current.x,
          y: currentPosRef.current.y,
          angle: currentPosRef.current.angle,
          speed: currentPosRef.current.speed,
          sensors: {
            gases: sensorsRef.current.gases,
            imu: sensorsRef.current.imu
          }
        });
      }
    }
  };

  const drawMap = () => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const path = robotPathRef.current;
    if (path.length === 0) return;

    const scale = mapScaleRef.current;
    const cx = width / 2;
    const cy = height / 2;

    const current = currentPosRef.current;
    const curLevel = worstLevel(sensorsRef.current?.gases);

    const mapX = (p) => -p.y * scale;
    const mapY = (p) => -p.x * scale;

    const currentMapX = mapX(current);
    const currentMapY = mapY(current);

    const offsetX = cx - currentMapX;
    const offsetY = cy - currentMapY;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const step = scale;
    ctx.beginPath();
    const viewStartX = Math.floor((-offsetX) / step) * step - step;
    const viewEndX = viewStartX + width + step * 2;
    const viewStartY = Math.floor((-offsetY) / step) * step - step;
    const viewEndY = viewStartY + height + step * 2;

    for(let x = viewStartX; x <= viewEndX; x += step) {
      ctx.moveTo(x, viewStartY);
      ctx.lineTo(x, viewEndY);
    }
    for(let y = viewStartY; y <= viewEndY; y += step) {
      ctx.moveTo(viewStartX, y);
      ctx.lineTo(viewEndX, y);
    }
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let segStart = 0;
    while (segStart < path.length - 1) {
      const segLevel = path[segStart + 1].level ?? 0;
      ctx.beginPath();
      ctx.strokeStyle = LEVEL_COLOR[segLevel];
      ctx.moveTo(mapX(path[segStart]), mapY(path[segStart]));
      let k = segStart + 1;
      ctx.lineTo(mapX(path[k]), mapY(path[k]));
      while (k < path.length - 1 && (path[k + 1].level ?? 0) === segLevel) {
        k++;
        ctx.lineTo(mapX(path[k]), mapY(path[k]));
      }
      ctx.stroke();
      segStart = k;
    }

    ctx.translate(currentMapX, currentMapY);
    ctx.rotate(-current.angle - Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -5);
    ctx.closePath();

    ctx.shadowBlur = 8;
    ctx.shadowColor = "#38bdf8";
    ctx.fillStyle = "#38bdf8";
    ctx.fill();

    ctx.restore();
  };

  drawMapRef.current = drawMap;

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomSensitivity = 0.05;
      let newScale = mapScaleRef.current * (1 - Math.sign(e.deltaY) * zoomSensitivity);
      if (newScale < 2) newScale = 2;
      if (newScale > 300) newScale = 300;
      mapScaleRef.current = newScale;
      mapDirtyRef.current = true;
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    const rafLoop = () => {
      if (mapDirtyRef.current && drawMapRef.current) {
        drawMapRef.current();
        mapDirtyRef.current = false;
      }
      mapRafRef.current = requestAnimationFrame(rafLoop);
    };
    mapRafRef.current = requestAnimationFrame(rafLoop);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      if (mapRafRef.current) cancelAnimationFrame(mapRafRef.current);
    };
  }, []);

  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(k)) {
        activeKeys.current.add(k);
        updateMovement();
      }
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(k)) {
        activeKeys.current.delete(k);
        updateMovement();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const startSession = () => {
    setIsSessionActive(true);
    isSessionActiveRef.current = true;
    recordedChunksRef.current = [];
    telemetryDataRef.current = [];
    sessionStartTimeRef.current = Date.now();
    robotPathRef.current = [];
    currentPosRef.current = { x: 0, y: 0, angle: 0, speed: 0 };
    collisionRef.current = { dir: null, noAccelStartMs: null, blocked: false };
    addLog("ok", "Сесію розпочато — запис відео та телеметрії");

    if (!canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const drawFrame = () => {
      if (videoImgRef.current && videoImgRef.current.complete) {
        ctx.drawImage(videoImgRef.current, 0, 0, canvas.width, canvas.height);
      }
      animationFrameId.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const stream = canvas.captureStream(15);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const formData = new FormData();
      formData.append("Video", blob, "session.webm");
      formData.append("RobotId", robotId);

      const telemetryDoc = { DataPoints: telemetryDataRef.current };
      formData.append("TelemetryData", JSON.stringify(telemetryDoc));

      const token = localStorage.getItem("token");

      try {
        await fetch(`${SERVER_URL}/api/sessions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          },
          body: formData
        });
      } catch (e) {
        console.error("Error saving session", e);
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
  };

  const stopSession = () => {
    setIsSessionActive(false);
    isSessionActiveRef.current = false;
    addLog("ok", "Сесію завершено — збереження даних...");
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const liveCfg = activeChartGas ? GAS_CONFIG[activeChartGas] : null;
  let liveMax = 0;
  if (liveCfg) {
    liveChartData.forEach(d => { const v = d[activeChartGas] || 0; if (v > liveMax) liveMax = v; });
  }
  const liveDomainMax = liveCfg ? Math.max(liveMax + liveCfg.danger * 0.1, liveCfg.danger * 1.2) : 1;
  const liveOffDanger = liveCfg ? `${(Math.max(0, 1 - liveCfg.danger / liveDomainMax) * 100).toFixed(2)}%` : "0%";
  const liveOffWarn = liveCfg ? `${(Math.max(0, 1 - liveCfg.warn / liveDomainMax) * 100).toFixed(2)}%` : "0%";

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-6rem)] p-4 overflow-hidden">
      <div className="col-span-7 flex flex-col gap-4 h-full min-h-0">
        <div className="flex-shrink-0 w-full aspect-video rounded-xl overflow-hidden shadow-2xl flex items-center justify-center bg-black relative">
          {isSessionActive ? (
            <>
              <VideoStream
                ref={videoImgRef}
                videoUrl={`${SERVER_URL}/api/video/${robotId}?token=${localStorage.getItem("token")}`}
              />

              <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 text-slate-300 font-mono text-[11px] bg-slate-900/60 p-3 rounded-lg backdrop-blur-sm border border-slate-700/50 pointer-events-none uppercase tracking-wider min-w-[200px]">
                <div className="flex justify-between gap-4 border-b border-slate-700 pb-1 mb-1">
                  <span className="text-cyan-400 font-bold">{currentTime.toLocaleDateString('uk-UA')}</span>
                  <span className="text-cyan-400 font-bold">{currentTime.toLocaleTimeString('uk-UA', { hour12: false })}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>REC Time:</span>
                  <span className="text-red-400 font-bold">{formatDuration(sessionDuration)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Ping:</span>
                  <span className={ping < 150 ? "text-emerald-400 font-bold" : "text-orange-400 font-bold"}>{ping} ms</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Pitch:</span>
                  <span className="text-sky-400">{osdData.pitch?.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Roll:</span>
                  <span className="text-sky-400">{osdData.roll?.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>CPU Temp:</span>
                  <span className={osdData.cpuTemp > 75 ? "text-red-400 font-bold" : "text-sky-400"}>{osdData.cpuTemp?.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Board Temp:</span>
                  <span className="text-sky-400">{osdData.chassisTemp?.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-slate-700">
                  <span>Wi-Fi RSSI:</span>
                  <span className={osdData.wifiRssi > -60 ? "text-emerald-400 font-bold" : osdData.wifiRssi > -80 ? "text-orange-400 font-bold" : "text-red-400 font-bold"}>{osdData.wifiRssi} dBm</span>
                </div>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none opacity-80 z-20 flex items-center justify-center">
                <div className="w-4 h-[2px] bg-cyan-500 shadow-[0_0_4px_#06b6d4] absolute -left-6"></div>
                <div className="w-4 h-[2px] bg-cyan-500 shadow-[0_0_4px_#06b6d4] absolute -right-6"></div>
                <div className="h-4 w-[2px] bg-cyan-500 shadow-[0_0_4px_#06b6d4] absolute -top-6"></div>
                <div className="w-2 h-2 border border-cyan-500 shadow-[0_0_4px_#06b6d4] rounded-full absolute"></div>
              </div>
            </>
          ) : (
            <div className="w-full aspect-video border border-slate-800 flex items-center justify-center flex-col">
              <span className="text-slate-500 font-mono text-sm uppercase tracking-widest mb-2">Камера офлайн</span>
              <span className="text-slate-700 text-xs">Натисніть Підключитися для початку місії</span>
            </div>
          )}
        </div>

        <Card className="flex-1 min-h-0 bg-slate-900 border-slate-800 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-3 py-1 border-b border-slate-800 flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">Системний лог</span>
            <span className="text-slate-700 text-[9px] ml-auto font-mono">{navData.speed.toFixed(2)} м/с</span>
          </div>
          <div
            ref={logScrollRef}
            className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[10px] space-y-0.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {logEntries.length === 0 && (
              <span className="text-slate-700">— очікування подій —</span>
            )}
            {logEntries.map((entry, i) => (
              <div key={i} className="flex gap-2 leading-tight">
                <span className="text-slate-600 flex-shrink-0">{entry.ts}</span>
                <span className={`flex-shrink-0 ${entry.type === 'ok' ? 'text-emerald-400' : entry.type === 'cmd' ? 'text-cyan-400' : entry.type === 'warn' ? 'text-orange-400' : 'text-red-400'}`}>
                  [{entry.type.toUpperCase()}]
                </span>
                <span className="text-slate-300">{entry.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="col-span-5 flex flex-col gap-3 h-full min-h-0">

        <div className="flex-shrink-0 flex items-center gap-2 px-1">
          <Badge variant={status === "Online" ? "success" : "destructive"}>
            {statusTranslations[status] || status}
          </Badge>
          <span className="text-sm font-black text-white tracking-tight italic">
            {actionTranslations[currentAction.toUpperCase()] || currentAction.toUpperCase()}
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] ml-2">
            <span className={osdData.batteryPercent > 20 ? "text-emerald-400 font-bold" : "text-red-500 font-bold animate-pulse"}>
              {osdData.batteryPercent}%
            </span>
            <div className="relative w-7 h-3.5 border-[1.5px] border-slate-400 rounded-sm p-[1px] flex items-center bg-slate-900/80">
              <div
                className={`h-full rounded-sm transition-all duration-500 ${osdData.batteryPercent > 50 ? 'bg-emerald-400' : osdData.batteryPercent > 20 ? 'bg-orange-400' : 'bg-red-500'}`}
                style={{ width: `${Math.min(Math.max(osdData.batteryPercent, 0), 100)}%` }}
              />
              <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[3px] h-2 bg-slate-400 rounded-r-sm" />
            </div>
            <span className="text-sky-400 text-[10px]">{osdData.batteryVoltage?.toFixed(2)}V</span>
          </div>
          <div className="ml-auto">
            {!isSessionActive ? (
              <Button onClick={startSession} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold tracking-wide rounded-full px-4">
                Підключитися
              </Button>
            ) : (
              <Button onClick={stopSession} size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold border border-red-500 rounded-full px-4">
                Відключитися
              </Button>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 grid grid-cols-2 gap-2">
          {[
            { id: "co2",     label: "CO2",   val: sensors.gases?.mq135?.co2,     danger: 24000, warn: 16000 },
            { id: "ch4",     label: "CH4",   val: sensors.gases?.mq4?.ch4,        danger: 500,   warn: 300   },
            { id: "co",      label: "CO",    val: sensors.gases?.mq135?.co,       danger: 50,    warn: 25    },
            { id: "alcohol", label: "Спирт", val: sensors.gases?.mq135?.alcohol,  danger: 100,   warn: 50    },
            { id: "nh3",     label: "NH3",   val: sensors.gases?.mq135?.nh3,      danger: 30,    warn: 15    },
          ].map(gas => (
            <Card
              key={gas.id}
              onClick={() => setActiveChartGas(activeChartGas === gas.id ? null : gas.id)}
              className={`bg-slate-900 border-slate-800 p-2 relative overflow-hidden cursor-pointer hover:bg-slate-800 transition-colors ${activeChartGas === gas.id ? 'ring-2 ring-cyan-500' : ''}`}
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${gas.val >= gas.danger ? 'bg-red-500' : gas.val >= gas.warn ? 'bg-orange-400' : 'bg-emerald-400'}`}></div>
              <p className="text-[9px] uppercase text-slate-500 font-bold ml-2">{gas.label}</p>
              <div className="flex justify-between items-end ml-2">
                <span className={`text-lg font-black font-mono tracking-tighter ${gas.val >= gas.danger ? 'text-red-500' : gas.val >= gas.warn ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {gas.val || 0}
                </span>
                <span className="text-[9px] text-slate-600 mb-0.5">PPM</span>
              </div>
            </Card>
          ))}
        </div>

        <Card className="flex-1 min-h-0 bg-slate-900 border-slate-800 shadow-xl flex flex-col relative overflow-hidden">
          <h3 className="text-[9px] uppercase font-bold text-slate-500 absolute top-2 left-3 z-10 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-sm">Карта руху</h3>
          <div className="w-full h-full relative">
            <canvas
              ref={mapCanvasRef}
              width={500}
              height={500}
              className="w-full h-full object-cover"
            />
          </div>
        </Card>

        {activeChartGas && (
          <Card className="flex-shrink-0 h-44 bg-slate-900 border-slate-800 p-3 shadow-xl flex flex-col">
            <h3 className="text-[10px] uppercase font-bold text-slate-500 mb-1">
              {gasNames[activeChartGas]?.toUpperCase()} у реальному часі
            </h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liveChartData}>
                  <defs>
                    <linearGradient id="liveGasGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"           stopColor="#ef4444" />
                      <stop offset={liveOffDanger} stopColor="#ef4444" />
                      <stop offset={liveOffDanger} stopColor="#f97316" />
                      <stop offset={liveOffWarn}   stopColor="#f97316" />
                      <stop offset={liveOffWarn}   stopColor="#10b981" />
                      <stop offset="100%"          stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 9}} minTickGap={30} />
                  <YAxis stroke="#64748b" tick={{fontSize: 9}} domain={[0, liveDomainMax]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }} />
                  <Line type="monotone" dataKey={activeChartGas} name={(gasNames[activeChartGas] || activeChartGas).toUpperCase() + " (ppm)"} stroke="url(#liveGasGradient)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RobotController;
