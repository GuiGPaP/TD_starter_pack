#!/usr/bin/env python3
"""
ROS2 node that bridges LaserScan messages to OSC UDP.

Subscribes to /scan (sensor_msgs/LaserScan) and forwards data
as OSC messages to a configurable host:port.
"""

import math

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from pythonosc.udp_client import SimpleUDPClient


# Model database for logging/info
LIDAR_MODELS = {
    'a1':    {'name': 'RPLIDAR A1',    'baudrate': 115200,  'channel': 'serial'},
    'a2m7':  {'name': 'RPLIDAR A2M7',  'baudrate': 256000,  'channel': 'serial'},
    'a2m8':  {'name': 'RPLIDAR A2M8',  'baudrate': 115200,  'channel': 'serial'},
    'a2m12': {'name': 'RPLIDAR A2M12', 'baudrate': 256000,  'channel': 'serial'},
    'a3':    {'name': 'RPLIDAR A3',    'baudrate': 256000,  'channel': 'serial'},
    's1':    {'name': 'RPLIDAR S1',    'baudrate': 256000,  'channel': 'serial'},
    's2':    {'name': 'RPLIDAR S2',    'baudrate': 1000000, 'channel': 'serial'},
    's2e':   {'name': 'RPLIDAR S2E',   'baudrate': 0,       'channel': 'tcp'},
    's3':    {'name': 'RPLIDAR S3',    'baudrate': 1000000, 'channel': 'serial'},
    'c1':    {'name': 'RPLIDAR C1',    'baudrate': 460800,  'channel': 'serial'},
    't1':    {'name': 'RPLIDAR T1',    'baudrate': 0,       'channel': 'udp'},
}


class OscBridgeNode(Node):
    """ROS2 node that forwards LaserScan data over OSC."""

    def __init__(self):
        super().__init__('osc_bridge')

        # Declare parameters with defaults
        self.declare_parameter('osc_host', 'host.docker.internal')
        self.declare_parameter('osc_port', 7000)
        self.declare_parameter('output_format', 'polar')  # polar, cartesian, both

        osc_host = self.get_parameter('osc_host').get_parameter_value().string_value
        osc_port = self.get_parameter('osc_port').get_parameter_value().integer_value
        self.output_format = self.get_parameter('output_format').get_parameter_value().string_value

        if self.output_format not in ('polar', 'cartesian', 'both'):
            self.get_logger().warn(
                f'Invalid output_format "{self.output_format}", defaulting to "polar"'
            )
            self.output_format = 'polar'

        # Create OSC client
        self.osc_client = SimpleUDPClient(osc_host, osc_port)
        self.get_logger().info(
            f'OSC bridge started: {osc_host}:{osc_port} format={self.output_format}'
        )

        # Subscribe to /scan
        self.subscription = self.create_subscription(
            LaserScan, 'scan', self._scan_callback, 10
        )

        self._scan_count = 0

    def _scan_callback(self, msg: LaserScan):
        """Process incoming LaserScan and send as OSC."""
        self._scan_count += 1

        num_points = len(msg.ranges)
        has_intensities = len(msg.intensities) == num_points

        # Send scan metadata on /lidar/info
        self.osc_client.send_message('/lidar/info', [
            msg.angle_min,
            msg.angle_max,
            msg.angle_increment,
            num_points,
            float(msg.header.stamp.sec) + float(msg.header.stamp.nanosec) * 1e-9,
        ])

        # Send polar data
        if self.output_format in ('polar', 'both'):
            polar_data = []
            for i in range(num_points):
                angle = msg.angle_min + i * msg.angle_increment
                r = msg.ranges[i]
                # Skip invalid ranges
                if r < msg.range_min or r > msg.range_max:
                    continue
                intensity = msg.intensities[i] if has_intensities else 0.0
                polar_data.extend([angle, r, intensity])

            if polar_data:
                self.osc_client.send_message('/lidar/polar', polar_data)

        # Send cartesian data
        if self.output_format in ('cartesian', 'both'):
            cartesian_data = []
            for i in range(num_points):
                angle = msg.angle_min + i * msg.angle_increment
                r = msg.ranges[i]
                if r < msg.range_min or r > msg.range_max:
                    continue
                intensity = msg.intensities[i] if has_intensities else 0.0
                x = r * math.cos(angle)
                y = r * math.sin(angle)
                cartesian_data.extend([x, y, intensity])

            if cartesian_data:
                self.osc_client.send_message('/lidar/cartesian', cartesian_data)

        # Log periodically
        if self._scan_count % 100 == 0:
            self.get_logger().info(
                f'Sent {self._scan_count} scans ({num_points} points/scan)'
            )


def main(args=None):
    rclpy.init(args=args)
    node = OscBridgeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
