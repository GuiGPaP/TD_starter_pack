"""OSC echo test — sends pings to TD and logs anything received."""

import threading
import time

from pythonosc import dispatcher, osc_server, udp_client

TD_HOST = "host.docker.internal"
TD_PORT = 9000       # TD osc_in listens here
LISTEN_PORT = 9001   # TD osc_out sends here


def default_handler(address, *args):
    print(f"[RECV] {address} {list(args)}", flush=True)


def main():
    # Receiver — listen for OSC from TD
    d = dispatcher.Dispatcher()
    d.set_default_handler(default_handler)
    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", LISTEN_PORT), d)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[OSC] Listening on 0.0.0.0:{LISTEN_PORT}", flush=True)

    # Sender — ping TD every 2 seconds
    client = udp_client.SimpleUDPClient(TD_HOST, TD_PORT)
    print(f"[OSC] Sending to {TD_HOST}:{TD_PORT}", flush=True)

    i = 0
    while True:
        client.send_message("/test/ping", [i, "hello"])
        print(f"[SEND] /test/ping [{i}, 'hello']", flush=True)
        i += 1
        time.sleep(2)


if __name__ == "__main__":
    main()
