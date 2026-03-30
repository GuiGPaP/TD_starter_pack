#!/bin/bash
# ros_entrypoint.sh

set -e

# Source ROS2
source /opt/ros/humble/setup.bash
source /ros2_ws/install/setup.bash

# If CMD is a ros2 launch command, filter out empty launch arguments
# (e.g., "scan_mode:=" with no value is invalid for ROS2)
if [[ "$1" == "ros2" && "$2" == "launch" ]]; then
    args=("$1" "$2" "$3")  # ros2 launch <file>
    shift 3
    for arg in "$@"; do
        # Only keep arguments that have a value after :=
        if [[ "$arg" =~ :=$ ]]; then
            continue  # skip empty launch args
        fi
        args+=("$arg")
    done
    exec "${args[@]}"
fi

exec "$@"
