@echo off
chcp 65001 >nul
echo ========================================
echo   更新GitHub Pages PWA
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] 添加更改...
git add .

echo [2/3] 提交更改...
git commit -m "修复iOS PWA兼容性"

echo [3/3] 推送到GitHub...
git push origin main

echo.
if %errorlevel% equ 0 (
    echo ✅ 推送成功！
    echo.
    echo 请等待1-2分钟让GitHub Pages生效
    echo 然后在iPhone/iPad上：
    echo 1. 删除旧的主屏幕图标
    echo 2. Safari访问你的GitHub Pages地址
    echo 3. 重新添加到主屏幕
) else (
    echo ❌ 推送失败，请检查网络连接
)

pause