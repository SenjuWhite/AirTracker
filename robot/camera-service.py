import asyncio
import os
import time
import cv2
import websockets
from picamera2 import Picamera2

HARDWARE_TOKEN = os.environ.get("HARDWARE_TOKEN", "")
BACKEND_WS_URL = os.environ.get("BACKEND_WS_URL", "")

VIDEO_URI = f"{BACKEND_WS_URL}/api/robots/video?token={HARDWARE_TOKEN}"

picam2 = Picamera2()
config = picam2.create_preview_configuration(main={"format": "XRGB8888", "size": (640, 480)})
picam2.configure(config)
picam2.start()

print("Камеру запущено.")

async def stream_frames(websocket):
    while True:
        frame = picam2.capture_array()
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
        if not ret:
            await asyncio.sleep(0.01)
            continue

        await websocket.send(buffer.tobytes())
        await asyncio.sleep(0.03)

async def main():
    backoff = 1
    while True:
        try:
            print(f"Підключення відеоканалу до {VIDEO_URI} ...")
            async with websockets.connect(
                VIDEO_URI, ping_interval=5, ping_timeout=10, max_size=None
            ) as ws:
                print("Відеоканал відкрито.")
                backoff = 1
                await stream_frames(ws)
        except Exception as e:
            print(f"Відеоканал втрачено ({e}). Повтор через {backoff} с.")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 15)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nКамеру зупинено вручну.")
    finally:
        picam2.stop()
