#!/bin/bash

# Open the URL to the tunneled site after a delay for creating the tunnel
( sleep 3; open http://localhost:4200 ) &

# Bind the local port to the remote port on which the site is served
ssh -L 3200:localhost:3200 -L 4200:localhost:4200 inci@67.205.140.182
