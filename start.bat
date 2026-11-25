@echo off
cd /d "%~dp0"
if exist "dist\nfa-dfa-simulator.html" (
  start "" "dist\nfa-dfa-simulator.html"
) else (
  start "" "index.html"
)
