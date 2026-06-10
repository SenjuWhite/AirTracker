import React, { forwardRef } from 'react';

const VideoStream = forwardRef(({ videoUrl }, ref) => {
  return (
    <div className="absolute inset-0 w-full h-full group rounded-xl overflow-hidden">
      {/* Overlay: Статус запису */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md border border-slate-700">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
        <span className="text-[10px] font-mono text-white uppercase tracking-widest">Live Feed</span>
      </div>

      {/* Сам потік */}
      <img 
        ref={ref}
        crossOrigin="anonymous"
        src={videoUrl} 
        alt="Camera Offline"
        className="w-full h-full object-cover bg-black"
        onError={(e) => { e.target.src = "https://via.placeholder.com/640x480?text=SIGNAL+LOST"; }}
      />

      {/* WASD Overlay (з'являється при наведенні) */}
      <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none z-10">
        <div className="grid grid-cols-3 gap-1 w-24">
          <div />
          <div className="bg-slate-900/80 border border-slate-600 p-2 text-center rounded text-[10px] font-bold text-white">W</div>
          <div />
          <div className="bg-slate-900/80 border border-slate-600 p-2 text-center rounded text-[10px] font-bold text-white">A</div>
          <div className="bg-slate-900/80 border border-slate-600 p-2 text-center rounded text-[10px] font-bold text-white">S</div>
          <div className="bg-slate-900/80 border border-slate-600 p-2 text-center rounded text-[10px] font-bold text-white">D</div>
        </div>
      </div>
    </div>
  );
});

export default VideoStream;