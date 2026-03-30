# TD_SLlidar_docker — ROS2 Lidar + OSC Bridge

Docker-based ROS2 integration for SLAMTEC LIDAR sensors with TouchDesigner via OSC.

## Architecture

```
RPLidar (USB/Ethernet) → Docker (ROS2 Humble)
                          ├── sllidar_node (C++ driver, publishes /scan)
                          └── osc_bridge_node (Python, /scan → OSC UDP)
                                     │
                                     ▼ OSC UDP (port 7000)
                          TouchDesigner (Windows)
                          └── TDDocker
                               ├── SLlidar launcher COMP (one-click Start/Stop)
                               └── containers/sllidar/
                                    └── oscin_chop (port 7000) → select_polar → null_out → out1
```

**Integration method:** Uses TDDocker's container management (Load compose → Up). The SLlidar launcher COMP at `/TDDocker/SLlidar` orchestrates USB detection, compose loading, OSC transport setup, and container lifecycle.

## One-Click Usage (in TouchDesigner)

1. Open the `SLlidar` COMP in `/TDDocker`
2. Select Lidar Model, Scan Mode, OSC Format in custom parameters
3. Click **Start** → auto-detects USB lidar, attaches to WSL2, launches Docker
4. Click **Stop** → stops container, detaches USB

## Supported Lidar Models

All USB models use Silicon Labs CP210x (VID:PID 10c4:ea60) — auto-detected.

| Model | Channel | Baudrate | Notes |
|-------|---------|----------|-------|
| A1 | serial | 115200 | Entry level, tested |
| A2M7/A2M8/A2M12 | serial | 115200-256000 | |
| A3 | serial | 256000 | High performance |
| S1 | serial/tcp | 256000 | TOF |
| S2/S3 | serial | 1000000 | High speed TOF (CP2102N) |
| S2E | tcp | — | Ethernet only, no USB |
| C1 | serial | 460800 | Omnidirectional (CP2102N) |
| T1 | udp | — | Ethernet only |

## OSC Messages

| Address | Format | Description |
|---------|--------|-------------|
| `/lidar/info` | `[angle_min, angle_max, angle_increment, num_points, timestamp]` | Scan metadata |
| `/lidar/polar` | `[angle0, range0, intensity0, angle1, ...]` | Polar scan data (triplets) |
| `/lidar/cartesian` | `[x0, y0, intensity0, x1, ...]` | Cartesian scan data (triplets) |

In TD oscinCHOP, channels are named `lidar/polar1`, `lidar/polar2`, etc. (no leading `/`).

## Key Files

| File | Purpose |
|------|---------|
| `osc_bridge/osc_bridge_node.py` | ROS2 node: /scan → OSC UDP |
| `launch/sllidar_osc_launch.py` | Unified launch (all models, serial/TCP/UDP + OSC) |
| `sllidar_ros2/` | Slamtec ROS2 driver (C++, vendored, has own .git) |
| `dockerfile` | Multi-stage build, non-root user with dialout group |
| `docker-compose.windows.yml` | Windows + USB/WSL2 (device mapping) |
| `docker-compose.dev.yml` | Dev mode (no hardware) |
| `docker-compose.yml` | Linux production |
| `.env.example` | All configurable env vars |

## Critical Implementation Notes

### Docker Permissions (3 issues)
1. **Home dir required:** ROS2 launch needs `~/.ros/log/` → `useradd -m -d /home/lidar`
2. **dialout group:** `user: "1001:1001"` in compose overrides groups → use `group_add: [dialout]`
3. **Empty launch args:** `scan_mode:=` (empty) is invalid → entrypoint filters `key:=` with no value

### TouchDesigner Performance
- **Use oscinCHOP, NOT oscinDAT** for sensor data (DAT parsing = 780K cells/sec = FPS drops)
- **Disable TDDocker polling** after Up (`_polling_active = False`) — `docker compose ps` takes 200ms
- **Frame-delayed ops:** Load.pulse() and Up.pulse() complete on next frame → use `run(delayFrames=2)` for dependent operations

### Extension Pattern
- Extension is **inline** in textDAT (not external file) — `project` not available in ext0object context
- ext0object in **CONSTANT mode** (not EXPRESSION): `op('./sllidar_ext').module.SLlidarLauncherExt(me)`
- parexecDAT callbacks must be **minimal** (no debug(), match TDDocker 3-line pattern)
- Background subprocess via `threading.Thread(daemon=True)` + `run(delayFrames=1)` polling

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIDAR_CHANNEL_TYPE` | serial | serial, tcp, or udp |
| `LIDAR_SERIAL_PORT` | /dev/ttyUSB0 | USB serial port |
| `LIDAR_BAUDRATE` | 115200 | Serial baudrate |
| `LIDAR_TCP_IP` | 192.168.0.7 | TCP IP for S1-TCP, S2E |
| `LIDAR_TCP_PORT` | 20108 | TCP port |
| `LIDAR_UDP_IP` | 192.168.11.2 | UDP IP for T1 |
| `LIDAR_UDP_PORT` | 8089 | UDP port |
| `LIDAR_SCAN_MODE` | (empty=auto) | Standard, Express, Boost, DenseBoost |
| `OSC_HOST` | host.docker.internal | OSC target host |
| `OSC_PORT` | 7000 | OSC target UDP port |
| `OSC_FORMAT` | polar | polar, cartesian, or both |

## Development

```bash
# CLI test (bypass TDDocker)
docker compose -f docker-compose.windows.yml up -d --build
docker logs sllidar_ros2 -f

# View ROS2 topics inside container
docker exec sllidar_ros2 bash -c 'source /ros2_ws/install/setup.bash && ros2 topic list'
```
