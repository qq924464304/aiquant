#!/usr/bin/env python
"""启动监控调度器"""
from aiquant.collector.scheduler import start_scheduler
import sys
from pathlib import Path

# 将项目根目录加入 sys.path
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR / "src"))


if __name__ == "__main__":
    start_scheduler(interval_minutes=5)
