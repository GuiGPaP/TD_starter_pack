#!/usr/bin/env python3
"""
Unified launch file for sllidar_node + osc_bridge_node.

Supports all lidar models (serial, TCP, UDP) with OSC output.
Replaces the per-model launch files for the OSC bridge use case.
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess, LogInfo
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    # -- Connection parameters --
    channel_type = LaunchConfiguration('channel_type', default='serial')
    serial_port = LaunchConfiguration('serial_port', default='/dev/ttyUSB0')
    serial_baudrate = LaunchConfiguration('serial_baudrate', default='115200')
    tcp_ip = LaunchConfiguration('tcp_ip', default='192.168.0.7')
    tcp_port = LaunchConfiguration('tcp_port', default='20108')
    udp_ip = LaunchConfiguration('udp_ip', default='192.168.11.2')
    udp_port = LaunchConfiguration('udp_port', default='8089')

    # -- Scan parameters --
    frame_id = LaunchConfiguration('frame_id', default='laser')
    inverted = LaunchConfiguration('inverted', default='false')
    angle_compensate = LaunchConfiguration('angle_compensate', default='true')
    scan_mode = LaunchConfiguration('scan_mode', default='')

    # -- OSC parameters --
    osc_host = LaunchConfiguration('osc_host', default='host.docker.internal')
    osc_port = LaunchConfiguration('osc_port', default='7000')
    osc_format = LaunchConfiguration('osc_format', default='polar')

    # sllidar_node receives all connection params — it uses what it needs
    # based on channel_type.
    sllidar_params = {
        'channel_type': channel_type,
        'serial_port': serial_port,
        'serial_baudrate': serial_baudrate,
        'tcp_ip': tcp_ip,
        'tcp_port': tcp_port,
        'udp_ip': udp_ip,
        'udp_port': udp_port,
        'frame_id': frame_id,
        'inverted': inverted,
        'angle_compensate': angle_compensate,
        'scan_mode': scan_mode,
    }

    return LaunchDescription([
        # -- Declare all launch arguments --
        DeclareLaunchArgument('channel_type', default_value='serial',
                              description='Connection type: serial, tcp, or udp'),
        DeclareLaunchArgument('serial_port', default_value='/dev/ttyUSB0',
                              description='Serial port for the lidar'),
        DeclareLaunchArgument('serial_baudrate', default_value='115200',
                              description='Serial baudrate'),
        DeclareLaunchArgument('tcp_ip', default_value='192.168.0.7',
                              description='TCP IP address for network lidars'),
        DeclareLaunchArgument('tcp_port', default_value='20108',
                              description='TCP port for network lidars'),
        DeclareLaunchArgument('udp_ip', default_value='192.168.11.2',
                              description='UDP IP address for T1'),
        DeclareLaunchArgument('udp_port', default_value='8089',
                              description='UDP port for T1'),
        DeclareLaunchArgument('frame_id', default_value='laser',
                              description='TF frame ID'),
        DeclareLaunchArgument('inverted', default_value='false',
                              description='Invert scan data'),
        DeclareLaunchArgument('angle_compensate', default_value='true',
                              description='Enable angle compensation'),
        DeclareLaunchArgument('scan_mode', default_value='',
                              description='Scan mode (Standard, Express, Boost, DenseBoost)'),
        DeclareLaunchArgument('osc_host', default_value='host.docker.internal',
                              description='OSC destination host'),
        DeclareLaunchArgument('osc_port', default_value='7000',
                              description='OSC destination port'),
        DeclareLaunchArgument('osc_format', default_value='polar',
                              description='OSC output format: polar, cartesian, or both'),

        # -- Log configuration --
        LogInfo(msg=['Launching sllidar + OSC bridge']),
        LogInfo(msg=['  channel_type: ', channel_type]),
        LogInfo(msg=['  OSC target: ', osc_host, ':', osc_port,
                     ' format=', osc_format]),

        # -- sllidar_node (C++ driver from sllidar_ros2 package) --
        Node(
            package='sllidar_ros2',
            executable='sllidar_node',
            name='sllidar_node',
            parameters=[sllidar_params],
            output='screen',
        ),

        # -- osc_bridge_node (standalone Python script with rclpy) --
        ExecuteProcess(
            cmd=[
                'python3', '/ros2_ws/osc_bridge/osc_bridge_node.py',
                '--ros-args',
                '-p', ['osc_host:=', osc_host],
                '-p', ['osc_port:=', osc_port],
                '-p', ['output_format:=', osc_format],
            ],
            name='osc_bridge',
            output='screen',
        ),
    ])
