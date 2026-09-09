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

    # Scalable directory
    scalable_dir = os.path.join(ICONS_DIR, "hicolor", "scalable", "apps")
    os.makedirs(scalable_dir, exist_ok=True)
    shutil.copyfile(SVG_PATH, os.path.join(scalable_dir, "x-desktop.svg"))
    shutil.copyfile(SVG_PATH, os.path.join(scalable_dir, "x.svg"))

    for size in SIZES:
        size_dir = os.path.join(ICONS_DIR, "hicolor", f"{size}x{size}", "apps")
        os.makedirs(size_dir, exist_ok=True)
        out_path = os.path.join(size_dir, "x-desktop.png")
        out_path_x = os.path.join(size_dir, "x.png")
        direct_path = os.path.join(ICONS_DIR, f"{size}x{size}.png")

        cmd = ["rsvg-convert", "-w", str(size), "-h", str(size), SVG_PATH, "-o", out_path]
        subprocess.run(cmd, check=True)
        shutil.copyfile(out_path, out_path_x)
        shutil.copyfile(out_path, direct_path)

    # Main icon
    shutil.copyfile(os.path.join(ICONS_DIR, "512x512.png"), os.path.join(ICONS_DIR, "x-desktop.png"))
    shutil.copyfile(os.path.join(ICONS_DIR, "512x512.png"), os.path.join(BASE_DIR, "data", "x-desktop.png"))
    shutil.copyfile(os.path.join(ICONS_DIR, "512x512.png"), os.path.join(BASE_DIR, "data", "x.png"))

    # Tray icon (high-contrast 24x24)
    tray_svg = os.path.join(BASE_DIR, "data", "x-tray.svg")
    tray_png = os.path.join(BASE_DIR, "data", "x-tray.png")
    subprocess.run(["rsvg-convert", "-w", "24", "-h", "24", tray_svg, "-o", tray_png], check=True)

    # Windows ICO format
    ico_path = os.path.join(BASE_DIR, "data", "x-desktop.ico")
    png_512 = os.path.join(BASE_DIR, "data", "x-desktop.png")
    try:
        subprocess.run(["magick", png_512, "-define", "icon:auto-resize=256,128,64,48,32,16", ico_path], check=True)
    except Exception:
        try:
            subprocess.run(["convert", png_512, "-define", "icon:auto-resize=256,128,64,48,32,16", ico_path], check=True)
        except Exception as e:
            print("ICO generation skipped:", e)

    print("All X Desktop icons generated successfully.")

if __name__ == "__main__":
    main()
