#!/bin/bash

set -e
set -x

install_development_packages () {
  for DEVPKG in $(ls -d */)
  do
    cd $DEVPKG
    if [ -f requirements.txt ]; then
      pip install -r requirements.txt
    fi
    if [ -f setup.py ]; then
      python setup.py develop
    fi
    if [ -d development_packages ]; then
      cd development_packages
      install_development_packages
      cd ..
    fi
    cd ..
  done
}

git submodule update --init

rm -rf python/environment
python3.7 -m venv python/environment
source python/environment/bin/activate

pip install --upgrade pip

cd python
pip install -r requirements.txt

cd development_packages
install_development_packages
cd ../..

deactivate

npm install
cd angular-datadragon
npm install
cd ..