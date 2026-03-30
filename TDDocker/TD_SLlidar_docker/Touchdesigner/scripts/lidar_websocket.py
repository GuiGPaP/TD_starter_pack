# TouchDesigner LIDAR WebSocket Handler
# Place this in a Text DAT named 'lidar_websocket'

import json
import websocket
import threading
import time
import math

class LIDARWebSocketClient:
    """WebSocket client for real-time LIDAR data"""
    
    def __init__(self, comp):
        self.comp = comp
        self.ws_url = "ws://localhost:8080/ws"
        self.ws = None
        self.is_connected = False
        self.is_running = False
        
        # Data storage
        self.latest_scan = None
        self.scan_count = 0
        self.last_update_time = 0
        
        # TouchDesigner table references (will be set by TD)
        self.points_table = None  # For Cartesian coordinates
        self.polar_table = None   # For polar coordinates
        self.status_table = None  # For connection status
        
    def connect(self, ip_address="localhost", port=8080):
        """Connect to WebSocket server"""
        self.ws_url = f"ws://{ip_address}:{port}/ws"
        
        if self.is_connected:
            self.disconnect()
            
        try:
            print(f"Connecting to WebSocket: {self.ws_url}")
            self.ws = websocket.WebSocketApp(
                self.ws_url,
                on_open=self.on_open,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close
            )
            
            # Start WebSocket in separate thread
            self.is_running = True
            self.ws_thread = threading.Thread(target=self.ws.run_forever, daemon=True)
            self.ws_thread.start()
            
            return True
            
        except Exception as e:
            print(f"WebSocket connection error: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from WebSocket server"""
        self.is_running = False
        self.is_connected = False
        
        if self.ws:
            self.ws.close()
            self.ws = None
            
        print("WebSocket disconnected")
    
    def on_open(self, ws):
        """Called when WebSocket connection opens"""
        self.is_connected = True
        print("WebSocket connected successfully")
        
        # Send ping to keep connection alive
        def ping():
            while self.is_running and self.is_connected:
                if self.ws:
                    try:
                        self.ws.send("ping")
                        time.sleep(30)  # Ping every 30 seconds
                    except:
                        break
                        
        ping_thread = threading.Thread(target=ping, daemon=True)
        ping_thread.start()
    
    def on_message(self, ws, message):
        """Called when receiving WebSocket message"""
        try:
            data = json.loads(message)
            
            if data.get("type") == "connection":
                print(f"Connection status: {data}")
                self.update_status_table(data)
                
            elif "ranges" in data and "angles" not in data:
                # LIDAR scan data
                self.process_scan_data(data)
                
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
        except Exception as e:
            print(f"Message processing error: {e}")
    
    def on_error(self, ws, error):
        """Called when WebSocket error occurs"""
        print(f"WebSocket error: {error}")
        self.is_connected = False
    
    def on_close(self, ws, close_status_code, close_msg):
        """Called when WebSocket connection closes"""
        print(f"WebSocket closed: {close_status_code} - {close_msg}")
        self.is_connected = False
    
    def process_scan_data(self, scan_data):
        """Process incoming LIDAR scan data"""
        try:
            # Store latest scan
            self.latest_scan = scan_data
            self.scan_count += 1
            self.last_update_time = time.time()
            
            # Extract data
            ranges = scan_data.get("ranges", [])
            intensities = scan_data.get("intensities", [])
            angle_min = scan_data.get("angle_min", -math.pi)
            angle_increment = scan_data.get("angle_increment", 0.017453)  # ~1 degree
            
            # Convert to Cartesian coordinates
            cartesian_points = []
            polar_points = []
            
            for i, range_val in enumerate(ranges):
                if range_val > 0 and not math.isinf(range_val):  # Valid measurement
                    angle = angle_min + (i * angle_increment)
                    
                    # Cartesian coordinates (X, Y)
                    x = range_val * math.cos(angle)
                    y = range_val * math.sin(angle)
                    
                    # Get intensity if available
                    intensity = intensities[i] if i < len(intensities) else 0
                    
                    cartesian_points.append([x, y, intensity, i])
                    polar_points.append([angle, range_val, intensity, i])
            
            # Update TouchDesigner tables
            self.update_cartesian_table(cartesian_points)
            self.update_polar_table(polar_points)
            
        except Exception as e:
            print(f"Scan data processing error: {e}")
    
    def update_cartesian_table(self, points):
        """Update TouchDesigner table with Cartesian coordinates"""
        if not self.points_table:
            return
            
        try:
            # Clear existing data
            self.points_table.clear()
            
            # Set headers
            self.points_table.appendRow(["X", "Y", "Intensity", "Index"])
            
            # Add points
            for point in points:
                self.points_table.appendRow([
                    f"{point[0]:.3f}",  # X
                    f"{point[1]:.3f}",  # Y
                    f"{point[2]:.0f}",  # Intensity
                    f"{point[3]}"       # Index
                ])
                
        except Exception as e:
            print(f"Cartesian table update error: {e}")
    
    def update_polar_table(self, points):
        """Update TouchDesigner table with polar coordinates"""
        if not self.polar_table:
            return
            
        try:
            # Clear existing data
            self.polar_table.clear()
            
            # Set headers
            self.polar_table.appendRow(["Angle", "Range", "Intensity", "Index"])
            
            # Add points
            for point in points:
                self.polar_table.appendRow([
                    f"{math.degrees(point[0]):.1f}",  # Angle in degrees
                    f"{point[1]:.3f}",                # Range in meters
                    f"{point[2]:.0f}",                # Intensity
                    f"{point[3]}"                     # Index
                ])
                
        except Exception as e:
            print(f"Polar table update error: {e}")
    
    def update_status_table(self, status_data):
        """Update status information table"""
        if not self.status_table:
            return
            
        try:
            self.status_table.clear()
            self.status_table.appendRow(["Property", "Value"])
            self.status_table.appendRow(["Connected", str(self.is_connected)])
            self.status_table.appendRow(["Scan Count", str(self.scan_count)])
            self.status_table.appendRow(["Last Update", time.strftime("%H:%M:%S", time.localtime(self.last_update_time))])
            
            if self.latest_scan:
                self.status_table.appendRow(["Points", str(len(self.latest_scan.get("ranges", [])))])
                self.status_table.appendRow(["Timestamp", f"{self.latest_scan.get('timestamp', 0):.3f}"])
                
        except Exception as e:
            print(f"Status table update error: {e}")
    
    def set_tables(self, points_table, polar_table, status_table):
        """Set TouchDesigner table references"""
        self.points_table = points_table
        self.polar_table = polar_table  
        self.status_table = status_table
        print("Table references set")
    
    def get_scan_stats(self):
        """Get current scan statistics"""
        if not self.latest_scan:
            return {}
            
        ranges = self.latest_scan.get("ranges", [])
        valid_ranges = [r for r in ranges if r > 0 and not math.isinf(r)]
        
        return {
            "total_points": len(ranges),
            "valid_points": len(valid_ranges),
            "min_range": min(valid_ranges) if valid_ranges else 0,
            "max_range": max(valid_ranges) if valid_ranges else 0,
            "avg_range": sum(valid_ranges) / len(valid_ranges) if valid_ranges else 0,
            "scan_rate": self.scan_count / max(1, time.time() - self.last_update_time + 1)
        }

# Global instance for TouchDesigner
if 'lidar_ws' not in globals():
    lidar_ws = None

def init_websocket_client(comp):
    """Initialize WebSocket client (call this from TouchDesigner)"""
    global lidar_ws
    lidar_ws = LIDARWebSocketClient(comp)
    return lidar_ws