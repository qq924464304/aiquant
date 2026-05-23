"""日志配置"""
import logging
import sys
from pathlib import Path
from .config import ROOT_DIR


def setup_logger(
    name: str = "aiquant",
    level: str = "INFO",
    log_to_file: bool = True,
) -> logging.Logger:
    """
    配置并获取 logger

    Args:
        name: logger 名称
        level: 日志级别 DEBUG/INFO/WARNING/ERROR
        log_to_file: 是否同时输出到文件
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # 避免重复添加 handler
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 文件输出
    if log_to_file:
        log_dir = ROOT_DIR / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        file_handler = logging.FileHandler(
            log_dir / "aiquant.log",
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger
