// ============================================
//Proyecto:  MEOWGUARD — Sistema Robótico Autónomo de Detección y Control de Plagas
// Archivo:   servidor_ia_meowguard.py
// Objetivo:  Procesar stream de video con YOLOv8 y publicar alertas vía MQTT y Firebase
// Equipo:    Mónica Moreno Torres [23241119], Leonardo Gael Niño Cabrera [23240382]
 //Materia:   Sistemas Programables — ISC TecNM León
// Semestre:  ago-dic-2026
//============================================
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

const firebaseConfigDefault = {
  apiKey: "AIzaSyAns9-uHrStimIxJ6RerGy3xyMQaM7ijWU",
  authDomain: "meowguard-e1e06.firebaseapp.com",
  databaseURL: "https://meowguard-e1e06-default-rtdb.firebaseio.com",
  projectId: "meowguard-e1e06"
};

export default function App() {
  const [fbStatus, setFbStatus] = useState('Conectando...');

  const [robotState, setRobotState] = useState({
    mode: 'AUTONOMOUS',
    battery: 92,
    waterLevel: 85,
    x: 120,
    y: 140,
    heading: 45,
    ultrasonicDist: 142,
    isSpraying: false,
    lastUpdate: new Date().toLocaleTimeString()
  });

  const [detections, setDetections] = useState([]);

  const [pathTrail, setPathTrail] = useState([
    { x: 50, y: 50 }, { x: 80, y: 90 }, { x: 120, y: 140 }
  ]);

  const [notifications, setNotifications] = useState([
    { id: 1, text: '🐾 Sistema MEOWGUARD conectado a la nube', type: 'info', time: new Date().toLocaleTimeString() }
  ]);

  const canvasRef = useRef(null);
  const lastAlertIdRef = useRef(null);

  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setNotifications(prev => [{ id: Date.now() + Math.random(), text, type, time }, ...prev.slice(0, 15)]);
  };

  // Escuchar Firebase en tiempo real (Telemetría + Detecciones Reales de YOLOv8)
  useEffect(() => {
    try {
      let app = !getApps().length ? initializeApp(firebaseConfigDefault) : getApps()[0];
      const database = getDatabase(app);
      setFbStatus('Connected');
      addLog('🟢 Enlazado con Firebase Realtime Database', 'success');

      // 1. Escuchar telemetría del carrito
      const robotRef = ref(database, 'meowguard/telemetry');
      onValue(robotRef, (snapshot) => {
        const val = snapshot.val();
        if (val) setRobotState(prev => ({ ...prev, ...val }));
      });

      // 2. Escuchar detecciones reales enviadas por Python YOLOv8
      const detectionsRef = ref(database, 'meowguard/detections');
      onValue(detectionsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const listaReal = Object.entries(data).map(([key, item]) => ({
            id: key,
            ...item
          })).reverse();

          setDetections(listaReal.slice(0, 30));

          // Notificar en pantalla si llegó una alerta nueva
          const masReciente = listaReal[0];
          if (masReciente && masReciente.id !== lastAlertIdRef.current) {
            lastAlertIdRef.current = masReciente.id;
            addLog(`🚨 IA: ${masReciente.pestType} (${masReciente.confidence}%) en X:${masReciente.x}, Y:${masReciente.y}`, 'warning');
          }
        }
      });
    } catch (err) {
      setFbStatus('Error');
      addLog('⚠️ Error conectando a Firebase', 'error');
    }
  }, []);

  // Movimiento autónomo del robot en el mapa
  useEffect(() => {
    if (robotState.mode !== 'AUTONOMOUS') return;

    const interval = setInterval(() => {
      setRobotState(prev => {
        const angleRad = (prev.heading * Math.PI) / 180;
        const speed = 2.5;
        let newX = prev.x + Math.cos(angleRad) * speed;
        let newY = prev.y + Math.sin(angleRad) * speed;
        let newHeading = prev.heading;

        if (newX < 30 || newX > 450 || newY < 30 || newY > 270) {
          newHeading = (prev.heading + 110) % 360;
          newX = Math.max(30, Math.min(450, newX));
          newY = Math.max(30, Math.min(270, newY));
        }

        const newDist = Math.max(15, Math.floor(150 + Math.sin(Date.now() / 1000) * 80));
        setPathTrail(trail => [...trail.slice(-40), { x: Math.round(newX), y: Math.round(newY) }]);

        return {
          ...prev,
          x: Math.round(newX),
          y: Math.round(newY),
          heading: Math.round(newHeading),
          ultrasonicDist: newDist,
          battery: Math.max(5, prev.battery - 0.005),
          lastUpdate: new Date().toLocaleTimeString()
        };
      });
    }, 300);

    return () => clearInterval(interval);
  }, [robotState.mode]);

  // Dibujar Mapa de Calor 2D y Robot Felino
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(49, 46, 129, 0.25)';
    ctx.fillRect(20, 20, 210, 250);
    ctx.fillRect(250, 20, 210, 250);

    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('🐾 SECTOR ALMACÉN', 30, 40);
    ctx.fillText('🐾 COCINA INDUSTRIAL', 260, 40);

    // Dibujar puntos de calor reales provenientes de la IA
    detections.forEach(det => {
      const posX = det.x || 150;
      const posY = det.y || 150;
      const gradient = ctx.createRadialGradient(posX, posY, 5, posX, posY, 45);
      gradient.addColorStop(0, 'rgba(244, 63, 94, 0.85)');
      gradient.addColorStop(0.5, 'rgba(251, 146, 60, 0.45)');
      gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(posX, posY, 45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(posX, posY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    if (pathTrail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(pathTrail[0].x, pathTrail[0].y);
      for (let i = 1; i < pathTrail.length; i++) {
        ctx.lineTo(pathTrail[i].x, pathTrail[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Dibujar Robot Gato MEOWGUARD
    ctx.save();
    ctx.translate(robotState.x, robotState.y);
    ctx.rotate((robotState.heading * Math.PI) / 180);

    if (robotState.isSpraying) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.arc(20, 0, 25, -Math.PI / 3, Math.PI / 3);
      ctx.lineTo(0, 0);
      ctx.fill();
    }

    ctx.fillStyle = '#f472b6';
    ctx.fillRect(-14, -12, 28, 24);

    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(-12, -12); ctx.lineTo(-6, -20); ctx.lineTo(0, -12); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(6, -20); ctx.lineTo(12, -12); ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-12, -15, 8, 3);
    ctx.fillRect(4, -15, 8, 3);
    ctx.fillRect(-12, 12, 8, 3);
    ctx.fillRect(4, 12, 8, 3);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(10, -4, 6, 8);

    ctx.restore();
  }, [robotState, pathTrail, detections]);

  const moveManual = (dir) => {
    setRobotState(prev => {
      let dx = 0, dy = 0, newH = prev.heading;
      const step = 10;
      if (dir === 'UP') { dy = -step; newH = 270; }
      if (dir === 'DOWN') { dy = step; newH = 90; }
      if (dir === 'LEFT') { dx = -step; newH = 180; }
      if (dir === 'RIGHT') { dx = step; newH = 0; }

      const nx = Math.max(20, Math.min(440, prev.x + dx));
      const ny = Math.max(20, Math.min(260, prev.y + dy));

      return { ...prev, x: nx, y: ny, heading: newH, mode: 'MANUAL' };
    });
  };

  const handleSpray = () => {
    setRobotState(prev => ({ ...prev, isSpraying: true, waterLevel: Math.max(0, prev.waterLevel - 3) }));
    addLog('💦 Atomización manual de fogger activada.', 'warning');
    setTimeout(() => {
      setRobotState(prev => ({ ...prev, isSpraying: false }));
    }, 2500);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ backgroundColor: '#111827', border: '2px solid #ec4899', borderRadius: '20px', padding: '16px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 0 15px rgba(236, 72, 153, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ backgroundColor: '#ec4899', padding: '10px', borderRadius: '14px', display: 'flex' }}>
            <span style={{ fontSize: '28px' }}>🐱</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#f472b6', letterSpacing: '1px' }}>
              MEOWGUARD 🐾
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Robot Felino Patrullero 4WD • TecNM Campus León (Mónica & Leonardo)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ backgroundColor: '#1f2937', color: '#38bdf8', border: '1px solid #38bdf8', padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold' }}>
            {fbStatus === 'Connected' ? '🟢 Firebase En Vivo' : '🟠 Conectando...'}
          </span>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '20px', position: 'relative' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🐾 Mapa de Calor y Patrullaje Felino 2D ({detections.length} detecciones reales)
            </h2>
            <div style={{ backgroundColor: '#030712', borderRadius: '14px', border: '1px solid #1f2937', padding: '12px', display: 'flex', justifyContent: 'center' }}>
              <canvas ref={canvasRef} width={480} height={290} style={{ width: '100%', maxWidth: '500px' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setRobotState(r => ({ ...r, mode: 'AUTONOMOUS' }))}
                style={{ backgroundColor: robotState.mode === 'AUTONOMOUS' ? '#ec4899' : '#1f2937', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🐱 Patrullaje Autónomo
              </button>
              <button
                onClick={() => setRobotState(r => ({ ...r, mode: 'MANUAL' }))}
                style={{ backgroundColor: robotState.mode === 'MANUAL' ? '#f59e0b' : '#1f2937', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🎮 Control Manual D-Pad
              </button>
              <button
                onClick={handleSpray}
                style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold' }}
              >
                💧 Atomizar Fogger (300mL)
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>GY-521 Giroscopio</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px', color: '#ec4899' }}>{robotState.heading}°</div>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>HC-SR04 Ultrasonido</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px', color: '#38bdf8' }}>{robotState.ultrasonicDist} cm</div>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Tanque Agua</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px', color: '#38bdf8' }}>{robotState.waterLevel}%</div>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Batería 4WD</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px', color: '#4ade80' }}>{Math.round(robotState.battery)}%</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📷 Última Plaga Detectada por IA
            </h2>
            {detections.length > 0 ? (
              <div style={{ backgroundColor: '#030712', border: '2px solid #f43f5e', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '36px' }}>{detections[0].pestType.includes('Rata') ? '🐀' : '🪲'}</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f43f5e', marginTop: '6px' }}>
                  {detections[0].pestType}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  Certeza: {detections[0].confidence}% • Posición ({detections[0].x}, {detections[0].y})
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Hora: {detections[0].timestamp}
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#030712', border: '2px dashed #ec4899', borderRadius: '14px', height: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ fontSize: '32px' }}>🔍</span>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Esperando detecciones de la cámara...</p>
              </div>
            )}

            {robotState.mode === 'MANUAL' && (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 'bold' }}>Teleoperación 4WD</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '130px', margin: '12px auto 0 auto' }}>
                  <div></div>
                  <button onClick={() => moveManual('UP')} style={{ padding: '10px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>▲</button>
                  <div></div>
                  <button onClick={() => moveManual('LEFT')} style={{ padding: '10px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>◀</button>
                  <button onClick={handleSpray} style={{ padding: '10px', backgroundColor: '#ec4899', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>💧</button>
                  <button onClick={() => moveManual('RIGHT')} style={{ padding: '10px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>▶</button>
                  <div></div>
                  <button onClick={() => moveManual('DOWN')} style={{ padding: '10px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>▼</button>
                  <div></div>
                </div>
              </div>
            )}
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '20px', flex: 1 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f8fafc' }}>
              🐾 Registro de Patrullaje y Detecciones
            </h3>
            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notifications.map(n => (
                <div key={n.id} style={{ padding: '8px 12px', backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{n.text}</span>
                  <span style={{ color: '#64748b' }}>{n.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}