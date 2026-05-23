#!/usr/bin/env python
"""数据库初始化脚本"""
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "src"))

from aiquant.db.database import init_db, get_db_url

if __name__ == "__main__":
    print(f"数据库连接: {get_db_url()}")
    print("正在初始化数据库...")
    init_db()
    print("数据库初始化完成")
