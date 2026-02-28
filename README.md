# MONEY MODULE Server

Socket.IO server for MONEY MODULE app.

## Deploy on Railway (FREE)

1. Go to https://railway.app
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Select this repository (or upload server folder)
5. Railway will auto-detect and deploy
6. Get your URL: `https://your-app.up.railway.app`

## Deploy on Render (FREE)

1. Go to https://render.com
2. Login with GitHub
3. Click "New" → "Web Service"
4. Connect your repository
5. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Get your URL: `https://your-app.onrender.com`

## Deploy on VPS (DigitalOcean, Vultr, etc.)

```bash
# SSH into your VPS
ssh root@your-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone/upload server files
mkdir money-module-server
cd money-module-server
# Upload server.js and package.json

# Install dependencies
npm install

# Start with PM2 (recommended)
npm install -g pm2
pm2 start server.js --name money-module
pm2 save
pm2 startup

# Or start directly
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## API Endpoints

- `GET /` - Health check
- `GET /api/device/:deviceId` - Check device status

## Socket.IO Events

### Client → Server
- `register` - Register device
- `sms_data` - Send SMS data
- `heartbeat` - Keep alive
- `ping` - Ping server

### Server → Client
- `connected` - Connection confirmed
- `registered` - Registration confirmed
- `sms_received` - SMS data received
- `heartbeat_ack` - Heartbeat response
- `pong` - Ping response
- `force_disconnect` - Force disconnect

## After Deployment

1. Copy your server URL
2. Update the app with new URL
3. Rebuild APK
4. Test connection

## Support

If you have issues, check:
1. Server logs
2. Network connectivity
3. Firewall settings
4. SSL certificate (for HTTPS)
