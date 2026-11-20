"""Hardware-aware resource detection (stdlib only)."""
from __future__ import annotations
import os, platform, shutil, subprocess
from dataclasses import dataclass, field

@dataclass
class HardwareProfile:
    cpu_model: str = ""
    cpu_cores: int = 1
    cpu_threads: int = 1
    ram_total_mb: int = 0
    ram_available_mb: int = 0
    gpu_name: str = ""
    gpu_vram_mb: int = 0
    os_name: str = ""
    os_version: str = ""
    disk_total_gb: float = 0.0
    disk_free_gb: float = 0.0
    python_version: str = ""
    runtimes: dict = field(default_factory=dict)
    mode: str = "low"  # low | normal | high

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

def _meminfo():
    total = avail = 0
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemTotal:"): total = int(line.split()[1]) // 1024
            if line.startswith("MemAvailable:"): avail = int(line.split()[1]) // 1024
    except Exception:
        pass
    if total == 0:
        try:
            import ctypes
            class S(ctypes.Structure):
                _fields_ = [("ull", ctypes.c_ulonglong)] * 7
            s = S(); ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s))
            total = s.ull // (1024*1024); avail = total
        except Exception:
            pass
    return total, avail

def _cpu():
    model, cores = "unknown", os.cpu_count() or 1
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith("model name") and model == "unknown":
                model = line.split(":",1)[1].strip()
    except Exception:
        model = platform.processor() or platform.machine() or "unknown"
    return model, cores

def _gpu():
    # nvidia-smi if present, else none. Never assume GPU.
    try:
        out = subprocess.run(["nvidia-smi","--query-gpu=name,memory.total","--format=csv,noheader"],
                             capture_output=True, text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip():
            name, mem = out.stdout.strip().splitlines()[0].split(",")
            mb = int(mem.strip().replace("MiB","").strip())
            return name.strip(), mb
    except Exception:
        pass
    return "", 0

def _which(name):
    import shutil as _s
    return _s.which(name) is not None

def detect_hardware(data_dir: str = ".") -> HardwareProfile:
    total, avail = _meminfo()
    model, cores = _cpu()
    gpu, vram = _gpu()
    du = shutil.disk_usage(data_dir)
    runtimes = {n: _which(n) for n in ("ollama","llama-server","llama-cli","python3","node")}
    # Mode from actual measurements
    if gpu and vram >= 8192 and total >= 16384:
        mode = "high"
    elif total >= 8192 and cores >= 4:
        mode = "normal"
    else:
        mode = "low"
    return HardwareProfile(cpu_model=model, cpu_cores=cores, cpu_threads=cores,
        ram_total_mb=total, ram_available_mb=avail, gpu_name=gpu, gpu_vram_mb=vram,
        os_name=platform.system(), os_version=platform.release(),
        disk_total_gb=round(du.total/1e9,1), disk_free_gb=round(du.free/1e9,1),
        python_version=platform.python_version(), runtimes=runtimes, mode=mode)

def recommended_context(mode: str) -> int:
    return {"low": 4096, "normal": 8192, "high": 16384}.get(mode, 4096)
