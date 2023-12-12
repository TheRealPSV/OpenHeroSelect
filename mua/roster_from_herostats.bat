@echo off

for %%a in (%1) do EXIT
if not exist config.ini EXIT

REM -----------------------------------------------------------------------------

REM Settings:
REM Ask before backing up existing files? (yes =true; no =false; always replace, not safe! =replace)
set askbackup=false
REM Define a herostat folder (roster will include all subfolders, is overruled by setting in config.ini):
set herostatFolder=xml

REM -----------------------------------------------------------------------------

REM these are automatic settings, don't edit them:
for %%g in ("%~dp0." ) do set game=%%~ng
if %game%==xml2 set OHSgame= -x
if not defined temp set "temp=%~dp0"
set "cfg=%~dp0config.ini" && call :numberedBKP cfg
call :readOHS herostatFolder
set "herostatFolder=%herostatFolder:\\=\%"
if %herostatFolder:~-1% EQU \ set "herostatFolder=%herostatFolder:~,-1%"
if %herostatFolder:~1,1% NEQ : set "herostatFolder=%~dp0%herostatFolder%"

call :configDeleteValues > "%temp%\OHSconfig.ini"
call :configWriteNew > config.ini

call :cfgWrite

cd..
cmd /c "set __COMPAT_LAYER=RUNASINVOKER && start "OpenHeroSelect.exe -a%OHSgame%

EXIT

:configDeleteValues
for /f "delims=" %%a in (config.ini) do (
  echo %%a|findstr /v "\"menulocationsValue\": \"rosterValue\""
)
EXIT /b
  
:configWriteNew
echo {
echo   "rosterValue": "temp.Roster",
if %game%==mua echo   "menulocationsValue": "temp.Menulocations",
more +1 "%temp%\OHSconfig.ini"
EXIT /b

:cfgWrite
del rosters\temp.Roster.cfg 2>nul
if %game%==mua del menulocations\temp.Menulocations.cfg 2>nul
for /f "delims=" %%h in ('dir /a-d /b /s "%herostatFolder%\*"') do (
  echo %%~nh | findstr "^[0-9].*" >nul 2>nul && set "hs=%%~dpnh" && set "hn=%%~nh" && call :cfgW2
)
EXIT /b

:cfgW2
call set "hp=%%hs:%herostatFolder%\=%%"
for /f "delims=_- " %%m in ("%hn%") do (
  echo %hn:&=^&%>>rosters\temp.Roster.cfg
  if %game%==mua echo %%m>>menulocations\temp.Menulocations.cfg
)
EXIT /b

:readOHS
for /f "tokens=1* delims=:, " %%a in ('type config.ini ^| find """%1"": "') do for %%m in (%%b) do set %1=%%~m
EXIT /b

:numberedBKP var
if %askbackup%==replace EXIT /b 0
call set "NB=%%%1%%"
if not exist "%NB%" EXIT /b 0
set /a n+=1
if exist "%NB%.%n%.bak" goto numberedBKP
if %askbackup%==true (
 choice /m "'%NB%' exists already. Do you want to make a backup"
 if errorlevel 2 EXIT /b 0
)
copy "%NB%" "%NB%.%n%.bak"
set n=0
EXIT /b 0