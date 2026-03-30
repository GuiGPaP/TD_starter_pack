# Windows Setup Guide - LIDAR Control API

## 🖥️ Windows-Specific Configuration

### Prerequisites
- Docker Desktop for Windows with WSL2 backend
- Windows 10/11 with WSL2 enabled
- LIDAR device connected via USB (optional for development)

## 🚀 Quick Start (Development Mode)

Pour tester l'API sans hardware LIDAR :

```bash
# 1. Setup environment
cp .env.example .env

# 2. Generate API key
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Add the key to .env file: LIDAR_API_KEY=your_generated_key

# 3. Start in development mode (no hardware required)
docker-compose -f docker-compose.dev.yml up --build
```

## 🔌 Hardware Setup (Production Mode)

### Step 1: Connect LIDAR Device

1. **Connect LIDAR** via USB to Windows
2. **Check Device Manager**:
   - Open Device Manager (Windows + X → Device Manager)
   - Look for "Ports (COM & LPT)"
   - Note the COM port (e.g., COM3, COM4)

### Step 2: Configure WSL2 Device Access

Windows ne partage pas automatiquement les devices USB avec Docker. Deux options :

#### Option A: Use WSL2 USB Forwarding (Recommended)

1. **Install usbipd-win** (Windows side):
```powershell
# In PowerShell as Administrator
winget install usbipd
```

2. **List USB devices**:
```powershell
usbipd wsl list
```

3. **Attach LIDAR device to WSL**:
```powershell
# Find your LIDAR device (usually Silicon Labs or similar)
usbipd wsl attach --busid X-Y --distribution Ubuntu
```

4. **Verify in WSL**:
```bash
# In WSL terminal
ls -la /dev/ttyUSB*
# Should show /dev/ttyUSB0 or similar
```

#### Option B: Use Windows COM Port (Alternative)

Modify the API to work with Windows COM ports directly:

```yaml
# In docker-compose.windows.yml
services:
  sllidar:
    # Add privileged mode for COM port access
    privileged: true
    # Map Windows COM port
    environment:
      - LIDAR_DEVICE=COM3  # Adjust to your COM port
```

### Step 3: Start with Hardware

```bash
# Use Windows-specific compose file
docker-compose -f docker-compose.windows.yml up --build
```

## 📁 Configuration Files

### For Development (No Hardware)
```bash
docker-compose -f docker-compose.dev.yml up
```
- No device mapping required
- API testing without LIDAR data
- Hot reload for development

### For Windows Production
```bash
docker-compose -f docker-compose.windows.yml up
```
- Requires LIDAR hardware
- USB/COM port mapping
- Production security settings

### For Linux Production
```bash
docker-compose up  # Uses main docker-compose.yml
```

## 🔧 Environment Variables (.env file)

```bash
# Required
LIDAR_API_KEY=your_secure_32_character_key_here

# Windows-specific
LIDAR_DEVICE=COM3  # Windows COM port
# Or for WSL2:
LIDAR_DEVICE=/dev/ttyUSB0  # Linux device in WSL2

# Optional
LOG_LEVEL=INFO
ROS_DOMAIN_ID=0
DEVELOPMENT_MODE=false
```

## 🧪 Testing on Windows

### 1. Test API (No Hardware Required)
```powershell
# Test health endpoint
curl http://localhost:8080/health

# Test with API key
curl -X GET http://localhost:8080/status -H "Authorization: Bearer YOUR_API_KEY"
```

### 2. Test WebSocket
```javascript
// In browser console or Node.js
const ws = new WebSocket('ws://localhost:8080/ws');
ws.onmessage = (event) => {
    console.log('LIDAR data:', JSON.parse(event.data));
};
```

## 🚨 Troubleshooting Windows Issues

### Error: "no such file or directory /dev/ttyUSB0"
**Solution**: Use development mode or configure USB forwarding:
```bash
# Development mode (no hardware)
docker-compose -f docker-compose.dev.yml up

# Or configure USB forwarding (see Step 2 above)
```

### Error: "Docker daemon not accessible"
**Solution**: Ensure Docker Desktop is running and WSL2 integration is enabled:
1. Open Docker Desktop
2. Settings → Resources → WSL Integration
3. Enable integration with your WSL2 distribution

### Error: "Port 8080 already in use"
**Solution**: 
```bash
# Check what's using the port
netstat -ano | findstr :8080

# Kill the process or use different port
# Edit docker-compose file to change port mapping
ports:
  - "8081:8080"  # Use 8081 on host instead
```

### LIDAR Not Detected
**Solution**:
1. **Check Device Manager**: Is the LIDAR showing up as a COM port?
2. **Install Drivers**: LIDAR might need specific Windows drivers
3. **Check USB Cable**: Try different USB port/cable
4. **Verify Power**: Some LIDARs need external power

## 🔄 Development Workflow on Windows

### 1. Code Changes
```bash
# API changes - container restarts automatically
# Edit api_bridge/ros_api_server.py

# ROS2 changes - need rebuild
docker-compose -f docker-compose.dev.yml build sllidar
```

### 2. View Logs
```bash
# All logs
docker-compose -f docker-compose.dev.yml logs -f

# API logs only
docker-compose -f docker-compose.dev.yml logs -f sllidar
```

### 3. Debug Container
```bash
# Access container shell
docker-compose -f docker-compose.dev.yml exec sllidar bash

# Check user (should be lidar, not root)
id

# Check ROS2 environment
env | grep ROS
```

## 📱 TouchDesigner Integration on Windows

### WebSocket Connection
```python
# In TouchDesigner WebSocket DAT
# URL: ws://localhost:8080/ws
# No authentication required for WebSocket

# For API calls, use Web Client DAT with:
# Header: Authorization: Bearer YOUR_API_KEY
```

### Data Format
```json
{
  "timestamp": 1699123456.789,
  "angle_min": -3.14159,
  "angle_max": 3.14159,
  "angle_increment": 0.017453,
  "ranges": [1.2, 1.3, 1.4, ...],
  "intensities": [100, 110, 95, ...]
}
```

## 🔧 Performance Tips for Windows

1. **Use WSL2 Backend**: Much faster than Hyper-V
2. **Allocate More Resources**: Docker Desktop → Settings → Resources
3. **Enable BuildKit**: `DOCKER_BUILDKIT=1` for faster builds
4. **Use Development Mode**: Hot reload without rebuilds

## 📞 Support

Common Windows issues and solutions are documented above. For hardware-specific issues, consult your LIDAR manufacturer's documentation.