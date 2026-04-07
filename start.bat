@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
echo Starting CookSmart...
echo.
start "CookSmart Backend" cmd /k "cd /d "!ROOT!backend" && python app.py"
timeout /t 2
start "CookSmart Frontend" cmd /k "cd /d "!ROOT!frontend" && npm run dev"
echo.
echo Both servers starting... (Backend: http://localhost:5000, Frontend: http://localhost:3000)
```

Then just double-click `start.bat` whenever you want to run CookSmart — it opens two terminal windows automatically and starts both servers.

Your folder should look like:
```
CookSmart/
├── start.bat        ← double-click this
├── backend/
└── frontend/