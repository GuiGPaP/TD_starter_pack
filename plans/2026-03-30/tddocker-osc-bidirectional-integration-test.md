<!-- session_id: 84e6d814-9413-4da1-be34-591ceb341b4a -->
# TDDocker — OSC Bidirectional Integration Test

## Context

TDDocker's OSC transport creates the operators (oscinDAT, oscoutDAT, data_in, callbacks) but we've never tested actual message flow between TD and a Docker container. We need to verify both directions:
1. Container → TD : container sends OSC, TD receives in `data_in`
2. TD → Container : TD sends OSC, container receives and logs it

## Plan

### 1. Create a test OSC container

**New file: `TDDocker/docker/osc-test/osc_echo.py`**

Simple Python script using `python-osc`:
- Listens on port **9001** (receives from TD)
- Sends `/test/ping` to `host.docker.internal:9000` every 2 seconds (to TD)
- Logs everything received to stdout

**New file: `TDDocker/docker/osc-test/Dockerfile`**
```dockerfile
FROM python:3.11-slim
RUN pip install python-osc
COPY osc_echo.py /app/
CMD ["python", "-u", "/app/osc_echo.py"]
```

**New file: `TDDocker/test-osc-compose.yml`**
```yaml
services:
  osc-test:
    build: ./docker/osc-test
    ports:
      - "9001:9001/udp"   # TD → Container (OSC out)
```

### 2. Test procedure in TD

1. Set Composefile to `test-osc-compose.yml`
2. Load → Up (builds + starts the osc-test container)
3. On the `osc-test` container COMP:
   - Set Data Transport = OSC
   - Set Data Port = 9000 (TD listens on 9000, sends to 9001)
4. **Container → TD test:**
   - Container sends `/test/ping [42, "hello"]` every 2s
   - Check `data_in` tableDAT fills with rows: `address=/test/ping, arg0=42, arg1=hello`
5. **TD → Container test:**
   - Send OSC from TD via `osc_out`: `/td/hello [1, 2, 3]`
   - Check container stdout (docker logs) shows the received message
6. Down

### 3. Networking note

- Docker Desktop on Windows: containers reach host via `host.docker.internal`
- TD `osc_in` listens on `0.0.0.0:9000` (all interfaces) — container can reach it
- TD `osc_out` sends to `localhost:9001` which maps to container port 9001/udp
- UDP port mapping needed in compose (`9001:9001/udp`)

## Files

| File | Action |
|------|--------|
| `TDDocker/docker/osc-test/osc_echo.py` | New — test OSC script |
| `TDDocker/docker/osc-test/Dockerfile` | New — container build |
| `TDDocker/test-osc-compose.yml` | New — compose for OSC test |

## Verification

- `data_in` table on `osc-test` COMP shows rows from container
- `docker logs` on the container shows messages from TD
- Both directions confirmed
