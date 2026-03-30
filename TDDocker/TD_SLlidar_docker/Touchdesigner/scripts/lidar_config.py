# TouchDesigner LIDAR Configuration Script
# Place this in a Text DAT named 'lidar_config'

import json
import requests
import websocket
import threading
import time

class LIDARConfig:
    """Configuration manager for LIDAR system"""
    
    def __init__(self, comp):
        self.comp = comp
        self.api_base_url = "http://localhost:8080"
        self.api_key = "Nu6a0x3cuXCzNuE_zIzpdWNvnVd0_DdG1LVux6yCbtw"  # From .env file
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # LIDAR Models with configurations
        self.lidar_models = {
            "a1": {"name": "RPLIDAR A1", "baudrate": 115200, "description": "Entry level 360° LIDAR"},
            "a2m7": {"name": "RPLIDAR A2M7", "baudrate": 256000, "description": "Advanced 360° LIDAR"},
            "a2m8": {"name": "RPLIDAR A2M8", "baudrate": 115200, "description": "Compact 360° LIDAR"},
            "a2m12": {"name": "RPLIDAR A2M12", "baudrate": 256000, "description": "Long range 360° LIDAR"},
            "a3": {"name": "RPLIDAR A3", "baudrate": 256000, "description": "High performance 360° LIDAR"},
            "s1": {"name": "RPLIDAR S1", "baudrate": 256000, "description": "TOF 360° LIDAR"},
            "s2": {"name": "RPLIDAR S2", "baudrate": 1000000, "description": "High speed TOF LIDAR"},
            "s3": {"name": "RPLIDAR S3", "baudrate": 1000000, "description": "Ultra-high performance LIDAR"},
            "c1": {"name": "RPLIDAR C1", "baudrate": 460800, "description": "Omnidirectional LIDAR"},
            "t1": {"name": "RPLIDAR T1", "baudrate": None, "description": "Network LIDAR (UDP)"}
        }
        
        # Common serial ports
        self.serial_ports = [
            "/dev/ttyUSB0",
            "/dev/ttyUSB1", 
            "/dev/ttyUSB2",
            "/dev/ttyACM0",
            "/dev/ttyACM1",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8"
        ]
        
        # Common IP addresses for network setup
        self.ip_addresses = [
            "localhost",
            "127.0.0.1",
            "192.168.1.100",
            "192.168.1.101",
            "192.168.0.100",
            "10.0.0.100"
        ]
        
    def get_lidar_models(self):
        """Get list of available LIDAR models"""
        try:
            response = requests.get(f"{self.api_base_url}/models", timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error getting models: {response.status_code}")
                return {"models": list(self.lidar_models.keys())}
        except Exception as e:
            print(f"Connection error: {e}")
            return {"models": list(self.lidar_models.keys())}
    
    def launch_lidar(self, model, serial_port="/dev/ttyUSB0", frame_id="laser", scan_mode=None):
        """Launch LIDAR with specified configuration"""
        
        # Get model configuration
        if model in self.lidar_models:
            baudrate = self.lidar_models[model]["baudrate"]
        else:
            print(f"Unknown model: {model}")
            return False
            
        # Prepare launch request
        payload = {
            "lidar_model": model,
            "serial_port": serial_port,
            "frame_id": frame_id
        }
        
        # Add optional parameters
        if baudrate:
            payload["baudrate"] = baudrate
        if scan_mode:
            payload["scan_mode"] = scan_mode
            
        try:
            response = requests.post(
                f"{self.api_base_url}/launch", 
                headers=self.headers,
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"LIDAR launched: {result}")
                return True
            else:
                print(f"Launch failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"Launch error: {e}")
            return False
    
    def stop_lidar(self):
        """Stop current LIDAR"""
        try:
            response = requests.post(
                f"{self.api_base_url}/stop",
                headers=self.headers,
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"LIDAR stopped: {result}")
                return True
            else:
                print(f"Stop failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Stop error: {e}")
            return False
    
    def get_status(self):
        """Get current system status"""
        try:
            response = requests.get(
                f"{self.api_base_url}/status",
                headers=self.headers,
                timeout=5
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"Status check failed: {response.status_code}"}
                
        except Exception as e:
            return {"error": f"Connection error: {e}"}
    
    def update_api_endpoint(self, ip_address, port=8080):
        """Update API endpoint for different server locations"""
        self.api_base_url = f"http://{ip_address}:{port}"
        print(f"API endpoint updated to: {self.api_base_url}")
    
    def update_api_key(self, new_key):
        """Update API key for authentication"""
        self.api_key = new_key
        self.headers["Authorization"] = f"Bearer {new_key}"
        print("API key updated")
    
    def test_connection(self):
        """Test connection to LIDAR API"""
        try:
            response = requests.get(f"{self.api_base_url}/health", timeout=3)
            if response.status_code == 200:
                return {"status": "connected", "message": "API is accessible"}
            else:
                return {"status": "error", "message": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

# Global instance for TouchDesigner
if 'lidar_config' not in globals():
    lidar_config = None

def init_lidar_config(comp):
    """Initialize LIDAR configuration (call this from TouchDesigner)"""
    global lidar_config
    lidar_config = LIDARConfig(comp)
    return lidar_config