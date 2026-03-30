# Simple LIDAR Example for TouchDesigner
# Place this in an Execute DAT for quick testing

import requests
import websocket
import json
import threading
import time

class SimpleLIDARExample:
    def __init__(self):
        self.api_url = "http://localhost:8080"
        self.api_key = "Nu6a0x3cuXCzNuE_zIzpdWNvnVd0_DdG1LVux6yCbtw"
        self.headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        
    def test_connection(self):
        """Test if API is accessible"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=3)
            print(f"✅ API Connection: {response.status_code}")
            return True
        except Exception as e:
            print(f"❌ API Connection failed: {e}")
            return False
    
    def launch_a1_lidar(self):
        """Quick launch A1 LIDAR"""
        payload = {
            "lidar_model": "a1",
            "serial_port": "/dev/ttyUSB0",
            "frame_id": "laser"
        }
        
        try:
            response = requests.post(f"{self.api_url}/launch", headers=self.headers, json=payload)
            result = response.json()
            print(f"Launch result: {result}")
            return response.status_code == 200
        except Exception as e:
            print(f"Launch error: {e}")
            return False
    
    def stop_lidar(self):
        """Stop current LIDAR"""
        try:
            response = requests.post(f"{self.api_url}/stop", headers=self.headers)
            result = response.json()
            print(f"Stop result: {result}")
            return response.status_code == 200
        except Exception as e:
            print(f"Stop error: {e}")
            return False
    
    def get_status(self):
        """Get system status"""
        try:
            response = requests.get(f"{self.api_url}/status", headers=self.headers)
            result = response.json()
            print(f"Status: {result}")
            return result
        except Exception as e:
            print(f"Status error: {e}")
            return None

# Create global instance
if 'lidar_simple' not in globals():
    lidar_simple = SimpleLIDARExample()

def quick_test():
    """Quick test function"""
    print("🚀 Starting LIDAR Quick Test...")
    
    # Test connection
    if not lidar_simple.test_connection():
        print("❌ Cannot connect to API. Make sure Docker container is running.")
        return
    
    # Get status
    status = lidar_simple.get_status()
    if status and status.get("is_running"):
        print("⚠️  LIDAR already running. Stopping first...")
        lidar_simple.stop_lidar()
        time.sleep(2)
    
    # Launch LIDAR
    print("🎯 Launching A1 LIDAR...")
    if lidar_simple.launch_a1_lidar():
        print("✅ LIDAR launched successfully!")
        
        # Wait a bit then check status
        time.sleep(3)
        lidar_simple.get_status()
    else:
        print("❌ Failed to launch LIDAR")

def quick_stop():
    """Quick stop function"""
    print("🛑 Stopping LIDAR...")
    if lidar_simple.stop_lidar():
        print("✅ LIDAR stopped")
    else:
        print("❌ Failed to stop LIDAR")

# Usage in TouchDesigner:
# 1. Create Execute DAT with this code
# 2. In another Execute DAT, call: quick_test()
# 3. To stop: quick_stop()
# 4. Check status: lidar_simple.get_status()

print("Simple LIDAR Example loaded. Use quick_test() to start.")