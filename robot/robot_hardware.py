import asyncio
import websockets
import json
import os
import time
import math
import subprocess
import board
import busio
import adafruit_ads1x15.ads1115 as ADS
from adafruit_ads1x15.analog_in import AnalogIn
import adafruit_mpu6050
from gpiozero import OutputDevice, CPUTemperature

HARDWARE_TOKEN = os.environ.get("HARDWARE_TOKEN", "")
BACKEND_WS_URL = os.environ.get("BACKEND_WS_URL", "")
CONTROL_URI = f"{BACKEND_WS_URL}/api/robots/control?token={HARDWARE_TOKEN}"

current_state = "stop"
wifi_signal_dbm = 0
stable_battery_voltage = 0.0
stop_duration = 0.0

V_C = 5.0
RL_MQ = 10.0

R0_MQ4   = 4.4
R0_MQ135 = 95.6

MQ4_COEFFS = {"CH4": {"a": 1012.7, "b": -2.786}}
MQ135_COEFFS = {
    "CO2":     {"a": 110.47,  "b": -2.862},
    "CO":      {"a": 605.18,  "b": -3.937},
    "Alcohol": {"a": 77.255,  "b": -3.18},
    "NH3":     {"a": 102.2,   "b": -2.473}
}

MAX_BATTERY_VOLTAGE = 6.0
MIN_BATTERY_VOLTAGE = 4.0

i2c = busio.I2C(board.SCL, board.SDA)

try:
    ads = ADS.ADS1115(i2c)
    gas_mq4    = AnalogIn(ads, 0)
    gas_mq135  = AnalogIn(ads, 3)
    battery_adc = AnalogIn(ads, 2)
    has_gas_sensor    = True
    has_battery_sensor = True
    print("Gas sensors and battery ADC initialized.")
except Exception as e:
    print(f"Problem with gas sensors or ADC ({e}).")
    has_gas_sensor    = False
    has_battery_sensor = False

try:
    mpu = adafruit_mpu6050.MPU6050(i2c)
    has_mpu = True
    print("MPU6050 initialized.")
except Exception as e:
    print(f"MPU6050 not found ({e}).")
    has_mpu = False

cpu = CPUTemperature()

in1 = OutputDevice(17)
in2 = OutputDevice(27)
in3 = OutputDevice(22)
in4 = OutputDevice(23)

def stop_all():
    global current_state
    current_state = "stop"
    in1.off(); in2.off(); in3.off(); in4.off()

def move_forward():
    global current_state
    current_state = "forward"
    in1.off(); in2.on(); in3.on(); in4.off()

def move_backward():
    global current_state
    current_state = "backward"
    in1.on(); in2.off(); in3.off(); in4.on()

def turn_left():
    global current_state
    current_state = "left"
    in1.off(); in2.on(); in3.off(); in4.on()

def turn_right():
    global current_state
    current_state = "right"
    in1.on(); in2.off(); in3.on(); in4.off()

def forward_left():  in1.off(); in2.off(); in3.off(); in4.on()
def forward_right(): in1.on();  in2.off(); in3.off(); in4.off()
def backward_left(): in1.off(); in2.off(); in3.on();  in4.off()
def backward_right():in1.off(); in2.on();  in3.off(); in4.off()

stop_all()

async def wifi_loop():
    global wifi_signal_dbm
    while True:
        try:
            cmd = "iwconfig wlan0 | grep -i --color=never 'Signal level'"
            output = subprocess.check_output(cmd, shell=True).decode('utf-8')
            level_str = output.split('Signal level=')[1].split(' ')[0]
            wifi_signal_dbm = int(level_str)
        except Exception:
            wifi_signal_dbm = 0
        await asyncio.sleep(3)

ACCEL_DEADBAND = 0.3
GYRO_DEADBAND  = 0.05

offset_accel_x = offset_accel_y = offset_accel_z = 0.0
offset_gyro_x  = offset_gyro_y  = offset_gyro_z  = 0.0

def calibrate_mpu():
    global offset_accel_x, offset_accel_y, offset_accel_z
    global offset_gyro_x,  offset_gyro_y,  offset_gyro_z
    if not has_mpu: return
    print("Calibration MPU6050, keep the robot still.")
    samples = 100
    sum_ax = sum_ay = sum_az = 0.0
    sum_gx = sum_gy = sum_gz = 0.0
    for _ in range(samples):
        ax, ay, az = mpu.acceleration
        gx, gy, gz = mpu.gyro
        sum_ax += ax; sum_ay += ay; sum_az += az
        sum_gx += gx; sum_gy += gy; sum_gz += gz
        time.sleep(0.01)
    offset_accel_x = sum_ax / samples
    offset_accel_y = sum_ay / samples
    offset_accel_z = sum_az / samples
    offset_gyro_x  = sum_gx / samples
    offset_gyro_y  = sum_gy / samples
    offset_gyro_z  = sum_gz / samples
    print("Calibration complete.\n")

if has_mpu:
    calibrate_mpu()


GAS_MAX_PPM = {
    "co2":    50000.0,
    "co":      1000.0,
    "alcohol": 1000.0,
    "nh3":      500.0,
    "ch4":    20000.0,
}

def calculate_ppm(voltage, R0, coeffs_dict):
    results = {}
    Vout = voltage * 1.5

    if Vout <= 0.05 or Vout >= V_C:
        for gas_name in coeffs_dict:
            results[gas_name.lower()] = 0.0
        return results

    Rs    = RL_MQ * (V_C - Vout) / Vout
    ratio = max(Rs / R0, 0.05)

    co2_c = coeffs_dict.get("CO2")
    ratio_clean = (400 / co2_c["a"]) ** (1.0 / co2_c["b"]) if co2_c else None

    for gas_name, coeffs in coeffs_dict.items():
        gas_key = gas_name.lower()
        ppm = coeffs["a"] * (ratio ** coeffs["b"])

        if gas_key == "co2":
            if ratio_clean is not None:
                ppm_clean = coeffs["a"] * (ratio_clean ** coeffs["b"])
                ppm = max(0.0, ppm)
            else:
                ppm = max(0.0, ppm)
        else:
            if ratio_clean is not None:
                ppm_clean = coeffs["a"] * (ratio_clean ** coeffs["b"])
                ppm = max(0.0, ppm - ppm_clean * 0.95)
            else:
                ppm = max(0.0, ppm)

        ppm = min(ppm, GAS_MAX_PPM.get(gas_key, 99999.0))
        results[gas_key] = round(ppm, 1)

    return results


async def send_sensor_data(websocket):
    global stable_battery_voltage, stop_duration
    last_time = time.perf_counter()

    try:
        while True:
            current_time = time.perf_counter()
            dt = current_time - last_time
            last_time = current_time

            mq4_data   = {"voltage": 0.0, "ch4": 0.0}
            mq135_data = {"voltage": 0.0, "co2": 0.0, "co": 0.0, "alcohol": 0.0, "nh3": 0.0}

            if has_gas_sensor:
                volt_mq4 = gas_mq4.voltage

                mq4_data["voltage"] = round(volt_mq4, 3)
                mq4_data.update(calculate_ppm(volt_mq4, R0_MQ4, MQ4_COEFFS))

                volt_mq135 = gas_mq135.voltage

                mq135_data["voltage"] = round(volt_mq135, 3)
                mq135_data.update(calculate_ppm(volt_mq135, R0_MQ135, MQ135_COEFFS))

            pitch = 0.0; roll = 0.0; mpu_temp = 0.0

            if has_mpu:
                raw_ax, raw_ay, raw_az = mpu.acceleration
                raw_gx, raw_gy, raw_gz = mpu.gyro
                mpu_temp = mpu.temperature

                try:
                    pitch = math.degrees(math.atan2(raw_ay, math.sqrt(raw_az**2 + raw_ax**2)))
                    roll  = math.degrees(math.atan2(-raw_az, raw_ax))
                except Exception:
                    pass

                calib_ax = raw_ax - offset_accel_x
                calib_ay = raw_ay - offset_accel_y
                calib_az = raw_az - offset_accel_z
                calib_gx = raw_gx - offset_gyro_x
                calib_gy = raw_gy - offset_gyro_y
                calib_gz = raw_gz - offset_gyro_z

                robot_accel_x = calib_az
                robot_accel_y = calib_ay
                robot_gyro_z  = -calib_gx

                if abs(robot_accel_x) < ACCEL_DEADBAND: robot_accel_x = 0.0
                if abs(robot_accel_y) < ACCEL_DEADBAND: robot_accel_y = 0.0
                if abs(robot_gyro_z)  < GYRO_DEADBAND:  robot_gyro_z  = 0.0
            else:
                robot_accel_x, robot_accel_y, robot_gyro_z = 0.0, 0.0, 0.0

            pi_temp = cpu.temperature

            battery_voltage = 0.0
            battery_percent = 0

            if has_battery_sensor:
                adc_voltage          = battery_adc.voltage
                real_battery_voltage = adc_voltage * 2.0

                if current_state == "stop":
                    stop_duration += dt
                else:
                    stop_duration = 0.0

                if stable_battery_voltage == 0.0:
                    stable_battery_voltage = real_battery_voltage

                if stop_duration > 1.5:
                    stable_battery_voltage = (0.95 * stable_battery_voltage) + (0.05 * real_battery_voltage)

                battery_voltage = round(stable_battery_voltage, 2)
                if stable_battery_voltage >= MAX_BATTERY_VOLTAGE:
                    battery_percent = 100
                elif stable_battery_voltage <= MIN_BATTERY_VOLTAGE:
                    battery_percent = 0
                else:
                    battery_percent = int(
                        (stable_battery_voltage - MIN_BATTERY_VOLTAGE) /
                        (MAX_BATTERY_VOLTAGE - MIN_BATTERY_VOLTAGE) * 100
                    )

            payload = json.dumps({
                "type": "telemetry",
                "gases": {
                    "mq4":   mq4_data,
                    "mq135": mq135_data
                },
                "imu": {
                    "accelX": round(robot_accel_x, 3),
                    "accelY": round(robot_accel_y, 3),
                    "gyroZ":  round(robot_gyro_z, 3)
                },
                "osd": {
                    "pitch":          round(pitch, 1),
                    "roll":           round(roll, 1),
                    "cpuTemp":        round(pi_temp, 1),
                    "chassisTemp":    round(mpu_temp, 1),
                    "wifiRssi":       wifi_signal_dbm,
                    "batteryVoltage": battery_voltage,
                    "batteryPercent": battery_percent
                },
                "dt": round(dt, 4)
            })

            await websocket.send(payload)
            await asyncio.sleep(0.1)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Error reading sensors: {e}")


def handle_command(command):
    command = command.strip().lower()
    if command == "forward":         move_forward()
    elif command == "backward":      move_backward()
    elif command == "left":          turn_left()
    elif command == "right":         turn_right()
    elif command == "forward_left":  forward_left()
    elif command == "forward_right": forward_right()
    elif command == "backward_left": backward_left()
    elif command == "backward_right":backward_right()
    elif command == "stop":          stop_all()

async def run_session(websocket):
    sensor_task = asyncio.create_task(send_sensor_data(websocket))
    try:
        async for message in websocket:
            handle_command(message)
    finally:
        sensor_task.cancel()
        print("Emergency stop of motors.")
        stop_all()

async def main():
    asyncio.create_task(wifi_loop())
    backoff = 1
    while True:
        try:
            print(f"Connecting to {CONTROL_URI} ...")
            async with websockets.connect(CONTROL_URI, ping_interval=5, ping_timeout=10) as ws:
                print("Control channel open.")
                backoff = 1
                await run_session(ws)
        except Exception as e:
            print(f"Reconnect in {backoff}s: {e}")
        finally:
            stop_all()
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 15)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped manually.")
        stop_all()
