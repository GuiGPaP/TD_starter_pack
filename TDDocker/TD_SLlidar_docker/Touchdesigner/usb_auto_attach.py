import subprocess
import time
import re

class USBLidarManager:
    def __init__(self):
        self.lidar_patterns = [
            'Silicon Labs',
            'SLAMTEC',
            'CP210x',
            'USB Serial',
            'LIDAR'
        ]
        
    def find_lidar_device(self):
        """Find LIDAR device in USB list"""
        try:
            result = subprocess.run(
                ['usbipd', 'wsl', 'list'],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode != 0:
                print(f"Error listing USB devices: {result.stderr}")
                return None
            
            lines = result.stdout.split('\n')
            for line in lines:
                for pattern in self.lidar_patterns:
                    if pattern.lower() in line.lower():
                        # Extract bus ID (format: X-Y)
                        match = re.search(r'(\d+-\d+)', line)
                        if match:
                            busid = match.group(1)
                            # Check if already attached
                            if 'Attached' not in line:
                                return busid
                            else:
                                print(f"Device {busid} already attached to WSL")
                                return None
            
            print("No LIDAR device found")
            return None
            
        except FileNotFoundError:
            print("usbipd not found. Please install: winget install usbipd")
            return None
        except Exception as e:
            print(f"Error finding LIDAR: {e}")
            return None
    
    def attach_device(self, busid, distribution='Ubuntu'):
        """Attach USB device to WSL"""
        try:
            print(f"Attaching device {busid} to WSL...")
            
            # First, try to detach if already attached elsewhere
            subprocess.run(
                ['usbipd', 'wsl', 'detach', '--busid', busid],
                capture_output=True,
                shell=True
            )
            time.sleep(1)
            
            # Now attach to WSL
            result = subprocess.run(
                ['usbipd', 'wsl', 'attach', '--busid', busid, '--distribution', distribution],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode == 0:
                print(f"Successfully attached device {busid}")
                return True
            else:
                # Check if it needs admin privileges
                if 'administrator' in result.stderr.lower():
                    print("Administrator privileges required. Trying with elevation...")
                    return self.attach_device_elevated(busid, distribution)
                else:
                    print(f"Failed to attach: {result.stderr}")
                    return False
                    
        except Exception as e:
            print(f"Error attaching device: {e}")
            return False
    
    def attach_device_elevated(self, busid, distribution='Ubuntu'):
        """Attach device with elevated privileges"""
        try:
            # Create PowerShell command for elevation
            ps_command = f'Start-Process usbipd -ArgumentList "wsl","attach","--busid","{busid}","--distribution","{distribution}" -Verb RunAs -Wait'
            
            result = subprocess.run(
                ['powershell', '-Command', ps_command],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode == 0:
                print(f"Successfully attached device {busid} with admin privileges")
                return True
            else:
                print(f"Failed to attach with elevation: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"Error with elevated attach: {e}")
            return False
    
    def verify_in_wsl(self):
        """Verify device is available in WSL"""
        try:
            # Run command in WSL to check for ttyUSB devices
            result = subprocess.run(
                ['wsl', 'ls', '-la', '/dev/ttyUSB*'],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode == 0:
                print("Device found in WSL:")
                print(result.stdout)
                return True
            else:
                print("No ttyUSB device found in WSL")
                return False
                
        except Exception as e:
            print(f"Error verifying WSL device: {e}")
            return False
    
    def auto_setup(self):
        """Automatic setup process"""
        print("=== Automatic LIDAR USB Setup ===")
        
        # Find LIDAR device
        busid = self.find_lidar_device()
        if not busid:
            return False
        
        print(f"Found LIDAR device: {busid}")
        
        # Attach to WSL
        if self.attach_device(busid):
            time.sleep(2)  # Wait for device to be ready
            
            # Verify in WSL
            if self.verify_in_wsl():
                print("✓ LIDAR successfully connected to Docker/WSL")
                return True
        
        print("✗ Failed to setup LIDAR connection")
        return False
    
    def detach_all(self):
        """Detach all USB devices from WSL"""
        try:
            result = subprocess.run(
                ['usbipd', 'wsl', 'detach', '--all'],
                capture_output=True,
                text=True,
                shell=True
            )
            print("All USB devices detached from WSL")
            return True
        except Exception as e:
            print(f"Error detaching devices: {e}")
            return False


# TouchDesigner integration
def onSetup():
    """Called when TouchDesigner starts or when button is pressed"""
    manager = USBLidarManager()
    success = manager.auto_setup()
    
    # Store status in TD storage
    if hasattr(op, 'TDStorageManager'):
        op.TDStorageManager['usb_connected'] = success
    
    return success

def onShutdown():
    """Called when TouchDesigner closes"""
    manager = USBLidarManager()
    manager.detach_all()

# For testing outside TD
if __name__ == "__main__":
    manager = USBLidarManager()
    manager.auto_setup()