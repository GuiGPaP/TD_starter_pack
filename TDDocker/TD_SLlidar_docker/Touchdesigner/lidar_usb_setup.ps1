# PowerShell script for automatic LIDAR USB setup
# Can be called from TouchDesigner using System Execute DAT

param(
    [string]$Action = "attach",
    [string]$Distribution = "Ubuntu"
)

# Function to find LIDAR device
function Find-LidarDevice {
    $devices = usbipd wsl list
    
    $patterns = @('Silicon Labs', 'SLAMTEC', 'CP210x', 'USB Serial', 'LIDAR')
    
    foreach ($line in $devices) {
        foreach ($pattern in $patterns) {
            if ($line -match $pattern) {
                if ($line -match '(\d+-\d+)') {
                    $busid = $matches[1]
                    if ($line -notmatch 'Attached') {
                        return $busid
                    } else {
                        Write-Host "Device $busid already attached to WSL"
                        return $null
                    }
                }
            }
        }
    }
    
    Write-Host "No LIDAR device found"
    return $null
}

# Function to attach device
function Attach-Device {
    param([string]$BusId, [string]$Distro)
    
    Write-Host "Attaching device $BusId to WSL distribution $Distro..."
    
    # Try to detach first if attached elsewhere
    usbipd wsl detach --busid $BusId 2>$null
    Start-Sleep -Seconds 1
    
    # Attach to WSL
    $result = usbipd wsl attach --busid $BusId --distribution $Distro 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully attached device $BusId"
        return $true
    } else {
        Write-Host "Failed to attach device: $result"
        return $false
    }
}

# Function to verify device in WSL
function Verify-InWSL {
    $result = wsl ls -la /dev/ttyUSB* 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Device found in WSL:"
        Write-Host $result
        return $true
    } else {
        Write-Host "No ttyUSB device found in WSL"
        return $false
    }
}

# Main execution
switch ($Action) {
    "attach" {
        Write-Host "=== Automatic LIDAR USB Setup ==="
        
        # Check if running as admin
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        
        if (-not $isAdmin) {
            Write-Host "Warning: Not running as administrator. May need elevation for USB operations."
        }
        
        # Find LIDAR
        $busid = Find-LidarDevice
        if ($busid) {
            Write-Host "Found LIDAR device: $busid"
            
            # Attach device
            if (Attach-Device -BusId $busid -Distro $Distribution) {
                Start-Sleep -Seconds 2
                
                # Verify
                if (Verify-InWSL) {
                    Write-Host "✓ LIDAR successfully connected to Docker/WSL"
                    exit 0
                }
            }
        }
        
        Write-Host "✗ Failed to setup LIDAR connection"
        exit 1
    }
    
    "detach" {
        Write-Host "Detaching all USB devices from WSL..."
        usbipd wsl detach --all
        Write-Host "All devices detached"
        exit 0
    }
    
    "status" {
        Write-Host "Current USB devices:"
        usbipd wsl list
        Write-Host "`nDevices in WSL:"
        wsl ls -la /dev/ttyUSB* 2>&1
        exit 0
    }
    
    default {
        Write-Host "Usage: lidar_usb_setup.ps1 -Action [attach|detach|status] -Distribution [Ubuntu]"
        exit 1
    }
}