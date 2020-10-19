# DataDragon

DataDragon is the public codename an agile ASO tool.

## Prerequisites

### Git

Install `git` for version control. On OS X it may be installed with Xcode.

- [Install Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

### Mongo

Install the MongoDB database and enable and start the daemon.

- [Install MongoDB](https://docs.mongodb.com/manual/installation/)
- [Install MongDB OS X](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/)

### Python

Install Python 3.

- [Python downloads](https://www.python.org/downloads/)

### npm

Install Node Package Manager from [Get npm](https://www.npmjs.com/get-npm).

### Angular CLI

Install the Angular command line interface globally.

```bash
npm install -g @angular/cli
```

- [Angular Quickstart](https://angular.io/guide/quickstart)

## Install

### git submodules

Install the `git` submodules from other repositories.

```bash
# in project root
git submodule update --init
```

### npm dependencies

Run `npm install` in the project root and the `angular-datadragon` directory to install project dependencies.

```bash
# in project root
npm install
cd angular-datadragon
npm install
```

### Python environment

Set up the project's self contained python environment and install its required modules.

```bash
# in project root
cd python
python3 -m venv environment
source environment/bin/activate
# the command prompt should indicate an active environment
pip install -r requirements.txt
deactivate
```

## Run

Run the back end app from the project root directory, and the angular app from the `angular-dragon` directory from two separate terminal windows.

```bash
# in project root
npm start
# will output logging from the back end app
```

```bash
# in angular-datadragon
npm start
# will output logging from the angular front end app
```

Open http://localhost:4200 in a web browser to load the single page application.

- [iTerm Terminal Application](http://iterm2.com/)