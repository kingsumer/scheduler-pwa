@echo off
chcp 65001 >nul
echo ========================================
echo   排课App PWA 启动器
echo ========================================
echo.

REM 查找Python
where python >nul 2>&1
if %errorlevel% == 0 (
    set PYTHON=python
) else (
    where python3 >nul 2>&1
    if %errorlevel% == 0 (
        set PYTHON=python3
    ) else (
        echo [错误] 未找到Python，请先安装Python
        pause
        exit /b 1
    )
)

echo 启动本地服务器...
echo 浏览器将自动打开 http://localhost:8080
echo.
echo ========================================
echo   iOS用户测试指南:
echo   1. 确保iPhone和电脑连接同一WiFi
echo   2. 查看电脑IP地址（下面会显示）
echo   3. iPhone Safari中输入 http://电脑IP:8080
echo   4. 点击「分享」按钮 -> 「添加到主屏幕」
echo ========================================
echo.

%PYTHON% server.py 8080

pause
