#!/usr/bin/bash

if [ "$EUID" -eq 0 ]
  then echo "Please do not run as root"
  exit
fi

APPNAME=$1

mkdir -p $HOME/Applications/pbs_deck_scripts

cat << EOF > $HOME/Applications/pbs_deck_scripts/$APPNAME.sh
#!/bin/bash
$HOME/.local/bin/pbs-deck $APPNAME
EOF

chmod +x $HOME/Applications/pbs_deck_scripts/$APPNAME.sh

# Add to Steam game mode
steamos-add-to-steam $HOME/Applications/pbs_deck_scripts/$APPNAME.sh