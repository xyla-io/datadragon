#!/bin/bash

set -e

cd $(dirname $0)

DEFAULT_CONFIG='{
  "environment": "default",
  "dry_run_only": true,
  "disable_email": false,
  "disable_rule_cron": false,
  "non_dry_run_rule_ids": [
  ],
  "api_status_command": "pm2 show datadragon_api",
  "api_start_command": "pm2 start datadragon_api",
  "api_stop_command": "pm2 stop datadragon_api",
  "aliases": {
    "local": "./",
    "stage": "ssh://STAGEUSER@STAGEHOST/STAGEPATH/",
    "prod": "ssh://PRODUSER@PRODHOST/PRODPATH/",
    "ux_stage": "git@github.com:NETLIFYREPO#STAGEBRANCH",
    "ux_prod": "git@github.com:NETLIFYREPO#PRODBRANCH"
  },
  "encrypt": {
  }
}' 

if [ ! -f configure.json ]; then
  echo "$DEFAULT_CONFIG" > configure.json
fi
if [ "$1" == '-i' ]; then
  echo "# Edit the configuration file. Lines starting with # will be removed. The default configuration is below for reference." >> configure.json
  echo "$DEFAULT_CONFIG" | sed 's/^/#/' >> configure.json
  vi configure.json
  CLEANED_CONFIG=$(cat configure.json | sed '/^#/ d')
  echo "$CLEANED_CONFIG" > configure.json
fi
cat configure.json
