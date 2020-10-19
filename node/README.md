# Node Directory

Stores development and modified node modules used by the project.

## Link Locally

Link these modules as project dependencies by creating symlinks in the `node_modules` directory.

```bash
# From the project root directory
# Remove any previously installed versions
npm uninstall --no-save r-script
ln -s ../node/r-script node_modules/r-script
```

## Link Globally

Alternatively, link the modules globally with root permissions.

- [npm link](https://docs.npmjs.com/cli/link)
- [link packages with peer dependencies](http://codetunnel.io/you-can-finally-npm-link-packages-that-contain-peer-dependencies/)

## Install Locally

Alternatively, the modules can be installed locally by adding them as local dependencies to the project's `package.json` file. However, it will then be necessary to run `npm install` in order to cause the project to use the updated module code.

```json
{
  ...
  "dependencies": {
    "r-script": "file:node/r-script",
  }
  ...
}
```

- [Local dependencies](https://stackoverflow.com/questions/14381898/local-dependency-in-package-json#14387210)

