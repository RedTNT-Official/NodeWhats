@echo off
cls
rem check modules
if not exist "node_modules" call npm install

rem launch
npm start