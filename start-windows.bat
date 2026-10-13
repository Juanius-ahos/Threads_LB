@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing for the first time...
  call npm install
)
start "" http://localhost:3000/admin
node server.js
