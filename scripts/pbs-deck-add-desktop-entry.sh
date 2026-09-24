#!/usr/bin/bash

if [ "$EUID" -eq 0 ]
  then echo "Please do not run as root"
  exit
fi

mkdir -p $HOME/.local/share/applications

APPNAME=$1
LAUNCHER_PATH=$HOME/.local/bin/pbs-deck
DESKTOP_ENTRY_PATH=$HOME/.local/share/applications/pbsdeck-$APPNAME.desktop

cat << EOF > $DESKTOP_ENTRY_PATH
[Desktop Entry]
Name=$APPNAME (PBS Deck)
Exec=$LAUNCHER_PATH $APPNAME
TryExec=$LAUNCHER_PATH
Terminal=false
Type=Application

StartupWMClass=PBSDeck
Comment=$APPNAME (PBS Deck)
Categories=AudioVideo;
EOF

cat $DESKTOP_ENTRY_PATH

echo "Desktop entry added to $DESKTOP_ENTRY_PATH"