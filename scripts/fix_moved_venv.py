r"""Repair the nndl virtualenv after the project folder has been moved.

A venv records its own absolute path in pyvenv.cfg, the activate scripts and
every console-script launcher (pip.exe, uvicorn.exe, ...). Move the folder and
those all point at a directory that no longer exists: activating the venv
silently falls through to the system Python (ModuleNotFoundError: fastapi) and
pip.exe exits without output. python.exe itself keeps working, so this script
is run with it:

    nndl\Scripts\python.exe scripts\fix_moved_venv.py

It is idempotent and needs no network. run.ps1 calls it automatically.
"""
import re
import sys
from importlib.metadata import distributions
from pathlib import Path

venv = Path(sys.prefix)
bat = venv / "Scripts" / "activate.bat"
m = re.search(r"^set VIRTUAL_ENV=(.+)$", bat.read_text(encoding="utf-8"), re.M) if bat.exists() else None
old = m.group(1).strip() if m else None

if not old or Path(old).resolve() == venv.resolve():
    sys.exit(0)

new = str(venv)
to_posix = lambda p: "/" + p[0].lower() + p[2:].replace("\\", "/")

for rel in ("pyvenv.cfg", "Scripts/activate", "Scripts/activate.bat", "Scripts/Activate.ps1"):
    p = venv / rel
    if p.exists():
        t = p.read_text(encoding="utf-8")
        p.write_text(t.replace(old, new).replace(to_posix(old), to_posix(new)), encoding="utf-8")

from pip._vendor.distlib.scripts import ScriptMaker

maker = ScriptMaker(None, str(venv / "Scripts"))
maker.executable = str(venv / "Scripts" / "python.exe")
maker.variants = {""}
maker.clobber = True
for d in distributions():
    for ep in d.entry_points:
        if ep.group in ("console_scripts", "gui_scripts"):
            maker.make(f"{ep.name} = {ep.value}", {"gui": ep.group == "gui_scripts"})

print(f"repaired virtualenv: {old} -> {new}")
