#!/usr/bin/env python3
import os
import subprocess
import shutil

SIZES = [16, 22, 24, 32, 48, 64, 128, 256, 512]
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_PATH = os.path.join(BASE_DIR, "data", "x-desktop.svg")
ICONS_DIR = os.path.join(BASE_DIR, "data", "icons")

def main():
    os.makedirs(ICONS_DIR, exist_ok=True)

    for size in SIZES:
        size_dir = os.path.join(ICONS_DIR, "hicolor", f"{size}x{size}", "apps")
        os.makedirs(size_dir, exist_ok=True)
        out_path = os.path.join(size_dir, "x-desktop.png")
        direct_path = os.path.join(ICONS_DIR, f"{size}x{size}.png")

        cmd = ["rsvg-convert", "-w", str(size), "-h", str(size), SVG_PATH, "-o", out_path]
        subprocess.run(cmd, check=True)

        shutil.copyfile(out_path, direct_path)
        print(f"Generated {size}x{size} icon -> {out_path}")

    # Main icon
    shutil.copyfile(os.path.join(ICONS_DIR, "512x512.png"), os.path.join(ICONS_DIR, "x-desktop.png"))
    shutil.copyfile(os.path.join(ICONS_DIR, "512x512.png"), os.path.join(BASE_DIR, "data", "x-desktop.png"))

    # Tray icon
    tray_svg = os.path.join(BASE_DIR, "data", "x-tray.svg")
    tray_png = os.path.join(BASE_DIR, "data", "x-tray.png")
    subprocess.run(["rsvg-convert", "-w", "24", "-h", "24", tray_svg, "-o", tray_png], check=True)
    print("Generated tray icon -> data/x-tray.png")

    print("All X Desktop icons generated successfully.")

if __name__ == "__main__":
    main()
