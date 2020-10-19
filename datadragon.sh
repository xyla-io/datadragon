#!/bin/bash

cd $(dirname $0)
source python/environment/bin/activate
python datadragon.py "$@"