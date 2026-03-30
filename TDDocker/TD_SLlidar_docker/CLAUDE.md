# TD_SLlidar_docker — ROS2 Lidar + OSC Bridge

Docker-based ROS2 integration for SLAMTEC LIDAR sensors with TouchDesigner via OSC.

## Architecture

```
LIDAR (USB/Ethernet) → Docker (ROS2 Humble)
                         ├── sllidar_node (C++ driver, publishes /scan)
                         └── osc_bridge_node (Python, /scan → OSC UDP)
                                    │
                                    ▼ OSC UDP (port 7000)
                         TouchDesigner (Windows)
                         └── COMP SLlidar_ros2
                              ├── oscin1 CHOP (receives scans)
                              ├── select_polar / select_cartesian
                              └── null_out → out1 CHOP
```

## Supported Lidar Models

| Model | Channel | Baudrate | Notes |
|-------|---------|----------|-------|
| A1 | serial | 115200 | Entry level |
| A2M7/A2M8/A2M12 | serial | 115200-256000 | |
| A3 | serial | 256000 | High performance |
| S1 | serial/tcp | 256000 | TOF |
| S2/S3 | serial | 1000000 | High speed TOF |
| S2E | tcp | - | Ethernet variant |
| C1 | serial | 460800 | Omnidirectional |
| T1 | udp | - | Network-based |

## Quick Start

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env — set LIDAR_CHANNEL_TYPE, OSC_FORMAT, etc.

# 2. Start (dev mode, no hardware)
docker compose -f docker-compose.dev.yml up --build

# 3. Start (Windows with hardware)
docker compose -f docker-compose.windows.yml up --build

# 4. Start (Linux production)
docker compose up --build
```

## OSC Messages

| Address | Format | Description |
|---------|--------|-------------|
| `/lidar/info` | `[angle_min, angle_max, angle_increment, num_points, timestamp]` | Scan metadata |
| `/lidar/polar` | `[angle0, range0, intensity0, angle1, ...]` | Polar scan data (triplets) |
| `/lidar/cartesian` | `[x0, y0, intensity0, x1, ...]` | Cartesian scan data (triplets) |

Output format controlled by `OSC_FORMAT` env var (or COMP parameter): `polar`, `cartesian`, or `both`.

## TouchDesigner COMP

### Build the COMP

In TD Script Editor or a Text DAT:
```python
exec(op('build_sllidar_comp').text)
```

### COMP Custom Parameters

- **Connection**: Lidarmodel (menu), Channeltype, Serialport, Tcpip, Tcpport, Baudrate, Scanmode
- **OSC**: Oscport, Oscformat (polar/cartesian/both)
- **Docker**: Dockermode (dev/windows/production), Start (pulse), Stop (pulse), Status (read-only)

Changing the Lidar Model auto-configures baudrate, channel type, and available scan modes.

### Extension

`SLlidarExt.py` — loaded via Text DAT with sys.path setup. Routes parameter changes through `parexec1` (parameterexecuteDAT).

## Key Files

| File | Purpose |
|------|---------|
| `osc_bridge/osc_bridge_node.py` | ROS2 node: /scan → OSC UDP |
| `launch/sllidar_osc_launch.py` | Unified launch (sllidar + osc_bridge) |
| `sllidar_ros2/` | Slamtec ROS2 driver (C++) |
| `dockerfile` | Multi-stage Docker build |
| `docker-compose.dev.yml` | Dev mode (no hardware) |
| `docker-compose.windows.yml` | Windows + USB/WSL2 |
| `docker-compose.yml` | Linux production |
| `Touchdesigner/SLlidarExt.py` | TD COMP extension |
| `Touchdesigner/build_sllidar_comp.py` | COMP builder script |

## Environment Variables

All configurable via `.env` file or COMP custom parameters:

| Variable | Default | Description |
|----------|---------|-------------|
| `LIDAR_CHANNEL_TYPE` | serial | serial, tcp, or udp |
| `LIDAR_SERIAL_PORT` | /dev/ttyUSB0 | USB serial port |
| `LIDAR_BAUDRATE` | 115200 | Serial baudrate |
| `LIDAR_TCP_IP` | 192.168.0.7 | TCP IP for S1-TCP, S2E |
| `LIDAR_TCP_PORT` | 20108 | TCP port |
| `LIDAR_UDP_IP` | 192.168.11.2 | UDP IP for T1 |
| `LIDAR_UDP_PORT` | 8089 | UDP port |
| `LIDAR_SCAN_MODE` | (auto) | Standard, Express, Boost, DenseBoost |
| `OSC_HOST` | host.docker.internal | OSC target host |
| `OSC_PORT` | 7000 | OSC target UDP port |
| `OSC_FORMAT` | polar | polar, cartesian, or both |

## Development

```bash
# View logs
docker compose -f docker-compose.dev.yml logs -f

# Shell into container
docker compose -f docker-compose.dev.yml exec sllidar bash

# Inside container: check ROS2 topics
ros2 topic list
ros2 topic echo /scan
```
