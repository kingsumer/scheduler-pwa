@echo off
chcp 65001 >nul
title 排课App PWA 一键部署

echo ========================================
echo   排课App PWA 一键部署到GitHub Pages
echo ========================================
echo.

REM 检查Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到Git，请先安装Git:
    echo https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

REM 检查GitHub CLI
where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 未找到GitHub CLI，将使用浏览器登录方式
    echo.
)

REM 配置Git用户信息
echo [1/6] 配置Git...
git config --global user.name >nul 2>&1
if %errorlevel% neq 0 (
    set /p GIT_NAME="请输入你的GitHub用户名: "
    set /p GIT_EMAIL="请输入你的GitHub邮箱: "
    git config --global user.name "%GIT_NAME%"
    git config --global user.email "%GIT_EMAIL%"
)

REM 登录GitHub
echo [2/6] 登录GitHub...
gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在打开浏览器登录GitHub...
    echo 如果没有GitHub账号，请先去 https://github.com 注册
    echo.
    gh auth login --web -p https
    if %errorlevel% neq 0 (
        echo [错误] GitHub登录失败
        pause
        exit /b 1
    )
)
echo ✅ GitHub已登录

REM 创建仓库
echo [3/6] 创建GitHub仓库...
set REPO_NAME=scheduler-pwa
gh repo create %REPO_NAME% --public --source=. --push --description "排课管理系统PWA" 2>nul
if %errorlevel% neq 0 (
    echo 仓库可能已存在，尝试推送更新...
    git init 2>nul
    git remote remove origin 2>nul
    git remote add origin https://github.com/%GIT_NAME%/%REPO_NAME%.git
    git add -A
    git commit -m "部署排课App PWA" 2>nul
    git branch -M main
    git push -u origin main --force
)
echo ✅ 代码已推送

REM 启用GitHub Pages
echo [4/6] 启用GitHub Pages...
gh api -X PUT repos/%GIT_NAME%/%REPO_NAME%/pages -f build_type=legacy -f source.branch=main -f source.path=/ 2>nul
if %errorlevel% neq 0 (
    echo [提示] GitHub Pages可能需要手动启用
    echo 请访问: https://github.com/%GIT_NAME%/%REPO_NAME%/settings/pages
)

REM 获取URL
echo [5/6] 获取访问地址...
set PWA_URL=https://%GIT_NAME%.github.io/%REPO_NAME%

echo.
echo ========================================
echo   ✅ 部署完成！
echo ========================================
echo.
echo   📱 iPhone访问地址:
echo   %PWA_URL%
echo.
echo   📋 安装步骤:
echo   1. iPhone Safari打开上面的地址
echo   2. 点击底部「分享」按钮
echo   3. 向下滑找到「添加到主屏幕」
echo   4. 点击「添加」
echo.
echo   ⏰ 等待1-2分钟后即可访问
echo ========================================
echo.

REM 自动打开浏览器
start "" "%PWA_URL%"

pause
