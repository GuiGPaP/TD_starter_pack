# TouchDesigner LIDAR UI Controller
# Place this in a Text DAT named 'lidar_ui_controller'
# This script handles the UI interactions and coordinates between config and websocket

import time
import threading

class LIDARUIController:
    """Main UI controller for LIDAR system in TouchDesigner"""
    
    def __init__(self, comp):
        self.comp = comp
        
        # References to other components (set these in TD)
        self.config_manager = None
        self.websocket_client = None
        
        # UI State
        self.current_model = "a1"
        self.current_port = "/dev/ttyUSB0"
        self.current_ip = "localhost"
        self.api_port = 8080
        self.is_lidar_running = False
        self.is_connected = False
        
        # UI Element references (will be set from TD)
        self.model_dropdown = None
        self.port_dropdown = None
        self.ip_dropdown = None
        self.launch_button = None
        self.stop_button = None
        self.connect_button = None
        self.status_text = None
        
    def set_references(self, config_manager, websocket_client):
        """Set references to config and websocket managers"""
        self.config_manager = config_manager
        self.websocket_client = websocket_client
        print("UI Controller references set")
    
    def set_ui_elements(self, model_dropdown, port_dropdown, ip_dropdown, 
                       launch_button, stop_button, connect_button, status_text):
        """Set references to UI elements"""
        self.model_dropdown = model_dropdown
        self.port_dropdown = port_dropdown
        self.ip_dropdown = ip_dropdown
        self.launch_button = launch_button
        self.stop_button = stop_button
        self.connect_button = connect_button
        self.status_text = status_text
        print("UI elements references set")
    
    def initialize_ui(self):
        """Initialize UI with default values"""
        if not self.config_manager:
            print("Config manager not set")
            return
            
        # Populate model dropdown
        if self.model_dropdown:
            models = list(self.config_manager.lidar_models.keys())
            self.populate_dropdown(self.model_dropdown, models, self.current_model)
        
        # Populate port dropdown
        if self.port_dropdown:
            ports = self.config_manager.serial_ports
            self.populate_dropdown(self.port_dropdown, ports, self.current_port)
        
        # Populate IP dropdown
        if self.ip_dropdown:
            ips = self.config_manager.ip_addresses
            self.populate_dropdown(self.ip_dropdown, ips, self.current_ip)
        
        # Update status
        self.update_status("Ready - Select configuration and launch LIDAR")
        
        print("UI initialized")
    
    def populate_dropdown(self, dropdown_comp, options, selected_value):
        """Populate a TouchDesigner dropdown component"""
        if not dropdown_comp:
            return
            
        try:
            # Clear existing options
            dropdown_comp.par.items = ""
            dropdown_comp.par.itemlabels = ""
            
            # Add new options
            dropdown_comp.par.items = " ".join(options)
            
            # Set labels (for models, use descriptive names)
            if dropdown_comp == self.model_dropdown and self.config_manager:
                labels = []
                for model in options:
                    if model in self.config_manager.lidar_models:
                        labels.append(self.config_manager.lidar_models[model]["name"])
                    else:
                        labels.append(model)
                dropdown_comp.par.itemlabels = " ".join(labels)
            else:
                dropdown_comp.par.itemlabels = " ".join(options)
            
            # Set selected value
            if selected_value in options:
                dropdown_comp.par.menuindex = options.index(selected_value)
                
        except Exception as e:
            print(f"Dropdown population error: {e}")
    
    def on_model_change(self, model):
        """Called when LIDAR model selection changes"""
        self.current_model = model
        
        # Update port recommendation based on model
        if self.config_manager and model in self.config_manager.lidar_models:
            model_info = self.config_manager.lidar_models[model]
            baudrate = model_info.get("baudrate")
            
            status = f"Selected: {model_info['name']}"
            if baudrate:
                status += f" (Baudrate: {baudrate})"
            else:
                status += " (Network/UDP)"
                
            self.update_status(status)
            
        print(f"Model changed to: {model}")
    
    def on_port_change(self, port):
        """Called when serial port selection changes"""
        self.current_port = port
        self.update_status(f"Serial port: {port}")
        print(f"Port changed to: {port}")
    
    def on_ip_change(self, ip):
        """Called when IP address selection changes"""
        self.current_ip = ip
        
        # Update both config and websocket endpoints
        if self.config_manager:
            self.config_manager.update_api_endpoint(ip, self.api_port)
            
        self.update_status(f"API endpoint: {ip}:{self.api_port}")
        print(f"IP changed to: {ip}")
    
    def on_launch_button(self):
        """Called when Launch button is pressed"""
        if not self.config_manager:
            self.update_status("Error: Configuration not initialized")
            return
            
        if self.is_lidar_running:
            self.update_status("LIDAR already running - stop first")
            return
        
        self.update_status("Launching LIDAR...")
        
        # Launch in separate thread to avoid blocking UI
        def launch_thread():
            try:
                success = self.config_manager.launch_lidar(
                    model=self.current_model,
                    serial_port=self.current_port,
                    frame_id="laser"
                )
                
                if success:
                    self.is_lidar_running = True
                    self.update_status(f"✅ LIDAR {self.current_model} launched successfully")
                    
                    # Auto-connect WebSocket after successful launch
                    time.sleep(2)  # Wait for LIDAR to start
                    self.on_connect_button()
                    
                else:
                    self.update_status("❌ Failed to launch LIDAR - check logs")
                    
            except Exception as e:
                self.update_status(f"❌ Launch error: {e}")
        
        threading.Thread(target=launch_thread, daemon=True).start()
    
    def on_stop_button(self):
        """Called when Stop button is pressed"""
        if not self.config_manager:
            self.update_status("Error: Configuration not initialized")
            return
            
        self.update_status("Stopping LIDAR...")
        
        # Disconnect WebSocket first
        if self.websocket_client and self.is_connected:
            self.websocket_client.disconnect()
            self.is_connected = False
        
        # Stop LIDAR in separate thread
        def stop_thread():
            try:
                success = self.config_manager.stop_lidar()
                
                if success:
                    self.is_lidar_running = False
                    self.update_status("✅ LIDAR stopped")
                else:
                    self.update_status("❌ Failed to stop LIDAR")
                    
            except Exception as e:
                self.update_status(f"❌ Stop error: {e}")
        
        threading.Thread(target=stop_thread, daemon=True).start()
    
    def on_connect_button(self):
        """Called when Connect WebSocket button is pressed"""
        if not self.websocket_client:
            self.update_status("Error: WebSocket client not initialized")
            return
            
        if self.is_connected:
            # Disconnect
            self.websocket_client.disconnect()
            self.is_connected = False
            self.update_status("WebSocket disconnected")
        else:
            # Connect
            self.update_status("Connecting to WebSocket...")
            success = self.websocket_client.connect(self.current_ip, self.api_port)
            
            if success:
                self.is_connected = True
                self.update_status("✅ WebSocket connected - receiving data")
            else:
                self.update_status("❌ WebSocket connection failed")
    
    def on_test_connection_button(self):
        """Test API connection"""
        if not self.config_manager:
            self.update_status("Error: Configuration not initialized")
            return
            
        self.update_status("Testing connection...")
        
        def test_thread():
            try:
                result = self.config_manager.test_connection()
                
                if result["status"] == "connected":
                    self.update_status(f"✅ Connection OK: {result['message']}")
                else:
                    self.update_status(f"❌ Connection failed: {result['message']}")
                    
            except Exception as e:
                self.update_status(f"❌ Test error: {e}")
        
        threading.Thread(target=test_thread, daemon=True).start()
    
    def on_refresh_status_button(self):
        """Refresh system status"""
        if not self.config_manager:
            return
            
        def status_thread():
            try:
                status = self.config_manager.get_status()
                
                if "error" in status:
                    self.update_status(f"❌ Status error: {status['error']}")
                else:
                    running = status.get("is_running", False)
                    pid = status.get("pid", "None")
                    buffer_size = status.get("buffer_size", 0)
                    clients = status.get("websocket_clients", 0)
                    
                    status_text = f"Running: {running} | PID: {pid} | Buffer: {buffer_size} | Clients: {clients}"
                    self.update_status(status_text)
                    
                    self.is_lidar_running = running
                    
            except Exception as e:
                self.update_status(f"❌ Status refresh error: {e}")
        
        threading.Thread(target=status_thread, daemon=True).start()
    
    def update_status(self, message):
        """Update status display"""
        timestamp = time.strftime("%H:%M:%S")
        full_message = f"[{timestamp}] {message}"
        
        if self.status_text:
            self.status_text.text = full_message
        
        print(full_message)
    
    def get_ui_state(self):
        """Get current UI state for persistence"""
        return {
            "model": self.current_model,
            "port": self.current_port,
            "ip": self.current_ip,
            "api_port": self.api_port,
            "is_running": self.is_lidar_running,
            "is_connected": self.is_connected
        }
    
    def set_ui_state(self, state):
        """Restore UI state"""
        self.current_model = state.get("model", "a1")
        self.current_port = state.get("port", "/dev/ttyUSB0")
        self.current_ip = state.get("ip", "localhost")
        self.api_port = state.get("api_port", 8080)
        self.is_lidar_running = state.get("is_running", False)
        self.is_connected = state.get("is_connected", False)
        
        # Update UI elements
        self.initialize_ui()

# Global instance for TouchDesigner
if 'lidar_ui' not in globals():
    lidar_ui = None

def init_ui_controller(comp):
    """Initialize UI controller (call this from TouchDesigner)"""
    global lidar_ui
    lidar_ui = LIDARUIController(comp)
    return lidar_ui