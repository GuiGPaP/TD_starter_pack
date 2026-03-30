"""
TouchDesigner LIDAR Controller with automatic USB setup
Integrates USB device management and Docker control
"""

import subprocess
import json
import time
import os
from pathlib import Path

class TDLidarController:
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self.project_path = Path(__file__).parent.parent
        self.docker_mode = 'dev'  # 'dev', 'windows', or 'production'
        self.usb_attached = False
        self.docker_running = False
        
    def Initialize(self):
        """Initialize controller on TD startup"""
        print("Initializing LIDAR Controller...")
        
        # Check environment
        self.check_environment()
        
        # Store in TD storage
        if hasattr(op, 'TDStorageManager'):
            op.TDStorageManager['lidar_controller'] = self
            
    def check_environment(self):
        """Check system environment"""
        checks = {
            'docker': self.check_docker(),
            'wsl': self.check_wsl(),
            'usbipd': self.check_usbipd()
        }
        
        print("Environment Check:")
        for item, status in checks.items():
            status_text = "✓" if status else "✗"
            print(f"  {status_text} {item}")
            
        return all(checks.values())
    
    def check_docker(self):
        """Check if Docker is running"""
        try:
            result = subprocess.run(
                ['docker', 'version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    def check_wsl(self):
        """Check if WSL is available"""
        try:
            result = subprocess.run(
                ['wsl', '--status'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    def check_usbipd(self):
        """Check if usbipd is installed"""
        try:
            result = subprocess.run(
                ['usbipd', '--version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    def auto_setup_usb(self):
        """Automatic USB setup using PowerShell script"""
        ps_script = self.project_path / 'Touchdesigner' / 'lidar_usb_setup.ps1'
        
        if not ps_script.exists():
            print(f"PowerShell script not found: {ps_script}")
            return False
        
        try:
            # Run PowerShell script
            result = subprocess.run(
                ['powershell', '-ExecutionPolicy', 'Bypass', '-File', str(ps_script), '-Action', 'attach'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                self.usb_attached = True
                print("USB device attached successfully")
                self.update_ui_status("USB Connected", (0, 1, 0))
                return True
            else:
                print(f"USB attach failed: {result.stderr}")
                self.update_ui_status("USB Failed", (1, 0, 0))
                return False
                
        except subprocess.TimeoutExpired:
            print("USB setup timed out")
            return False
        except Exception as e:
            print(f"USB setup error: {e}")
            return False
    
    def start_docker(self, mode='dev', auto_usb=True):
        """Start Docker container with optional USB setup"""
        
        # Auto-attach USB if requested and in production mode
        if auto_usb and mode in ['windows', 'production']:
            print("Setting up USB device...")
            if not self.auto_setup_usb():
                print("Warning: USB setup failed, continuing anyway...")
        
        # Determine docker-compose file
        compose_files = {
            'dev': 'docker-compose.dev.yml',
            'windows': 'docker-compose.windows.yml',
            'production': 'docker-compose.yml'
        }
        
        compose_file = compose_files.get(mode, 'docker-compose.dev.yml')
        compose_path = self.project_path / compose_file
        
        if not compose_path.exists():
            print(f"Docker compose file not found: {compose_path}")
            return False
        
        try:
            print(f"Starting Docker in {mode} mode...")
            
            # Change to project directory
            os.chdir(str(self.project_path))
            
            # Start Docker
            result = subprocess.run(
                ['docker-compose', '-f', compose_file, 'up', '-d'],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                self.docker_running = True
                self.docker_mode = mode
                print(f"Docker started successfully in {mode} mode")
                self.update_ui_status("Docker Running", (0, 1, 0))
                
                # Wait for API to be ready
                time.sleep(5)
                return True
            else:
                print(f"Docker start failed: {result.stderr}")
                self.update_ui_status("Docker Failed", (1, 0, 0))
                return False
                
        except subprocess.TimeoutExpired:
            print("Docker startup timed out")
            return False
        except Exception as e:
            print(f"Docker start error: {e}")
            return False
    
    def stop_docker(self):
        """Stop Docker container and detach USB"""
        try:
            # Stop Docker
            os.chdir(str(self.project_path))
            
            compose_file = {
                'dev': 'docker-compose.dev.yml',
                'windows': 'docker-compose.windows.yml',
                'production': 'docker-compose.yml'
            }.get(self.docker_mode, 'docker-compose.dev.yml')
            
            result = subprocess.run(
                ['docker-compose', '-f', compose_file, 'down'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                self.docker_running = False
                print("Docker stopped")
                self.update_ui_status("Docker Stopped", (0.5, 0.5, 0.5))
            
            # Detach USB if it was attached
            if self.usb_attached:
                self.detach_usb()
                
            return True
            
        except Exception as e:
            print(f"Docker stop error: {e}")
            return False
    
    def detach_usb(self):
        """Detach USB devices from WSL"""
        ps_script = self.project_path / 'Touchdesigner' / 'lidar_usb_setup.ps1'
        
        try:
            result = subprocess.run(
                ['powershell', '-ExecutionPolicy', 'Bypass', '-File', str(ps_script), '-Action', 'detach'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                self.usb_attached = False
                print("USB devices detached")
                self.update_ui_status("USB Disconnected", (0.5, 0.5, 0.5))
                return True
                
        except Exception as e:
            print(f"USB detach error: {e}")
            return False
    
    def check_status(self):
        """Check current system status"""
        status = {
            'docker_running': self.docker_running,
            'docker_mode': self.docker_mode,
            'usb_attached': self.usb_attached,
            'api_ready': self.check_api()
        }
        
        # Update UI with status
        self.update_status_table(status)
        return status
    
    def check_api(self):
        """Check if API is responding"""
        try:
            import requests
            response = requests.get('http://localhost:8080/health', timeout=2)
            return response.status_code == 200
        except:
            return False
    
    def update_ui_status(self, message, color):
        """Update TD UI status indicator"""
        # Find status text DAT
        status_dat = op('status_text')
        if status_dat:
            status_dat.text = message
        
        # Find status color TOP
        status_color = op('status_color')
        if status_color:
            status_color.par.colorr = color[0]
            status_color.par.colorg = color[1]
            status_color.par.colorb = color[2]
    
    def update_status_table(self, status):
        """Update status table DAT"""
        table = op('status_table')
        if table:
            table.clear()
            table.appendRow(['Property', 'Value'])
            for key, value in status.items():
                table.appendRow([key, str(value)])
    
    # Button callbacks for TD UI
    def on_start_button(self):
        """Called when Start button is pressed"""
        mode_selector = op('mode_selector')
        mode = mode_selector.par.value0 if mode_selector else 'dev'
        
        auto_usb_toggle = op('auto_usb_toggle')
        auto_usb = auto_usb_toggle.par.value0 if auto_usb_toggle else True
        
        return self.start_docker(mode, auto_usb)
    
    def on_stop_button(self):
        """Called when Stop button is pressed"""
        return self.stop_docker()
    
    def on_usb_button(self):
        """Called when USB Setup button is pressed"""
        return self.auto_setup_usb()
    
    def on_status_button(self):
        """Called when Check Status button is pressed"""
        return self.check_status()


# TouchDesigner Extension Class
class LidarControllerExt:
    """
    TouchDesigner extension for LIDAR controller
    """
    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self.controller = TDLidarController(ownerComp)
        
    def Initialize(self):
        self.controller.Initialize()
        
    def StartDocker(self, mode='dev', autoUsb=True):
        return self.controller.start_docker(mode, autoUsb)
        
    def StopDocker(self):
        return self.controller.stop_docker()
        
    def SetupUSB(self):
        return self.controller.auto_setup_usb()
        
    def CheckStatus(self):
        return self.controller.check_status()