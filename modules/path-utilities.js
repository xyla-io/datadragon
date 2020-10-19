const { handleError } = require('./error');
const separator = '_';

function escapedPathComponent(component) {
  return component.replace(/-/g, '-2D').replace(/_/g, '-5F');
}

function unescapedPathComponent(component) {
  return component.replace(/-5F/g, '_').replace(/-2D/g, '-');
}

function pathFromComponents(components) {
  return components.map(component => escapedPathComponent(component)).join(separator);
}

function componentsFromPath(path) {
  return path.split(separator).map(escapedComponent => unescapedPathComponent(escapedComponent));
}

function pathPatternError(path, pattern) {
  if (typeof path !== 'string' || !path.match(pattern)) {
    return new Error(`Invalid path ${path}`);
  } else {
    return undefined;
  }
}

function pathPatternMiddleware(parameter, pattern) {
  return (req, res, next) => {
    const error = pathPatternError(req.params[parameter], pattern);
    if (error !== undefined) {
      return handleError(res, 400, 'Path Error', error);
    }
    return next();
  };
}

module.exports.separator = separator;
module.exports.escapedPathComponent = escapedPathComponent;
module.exports.unescapedPathComponent = unescapedPathComponent;
module.exports.pathFromComponents = pathFromComponents;
module.exports.componentsFromPath = componentsFromPath;
module.exports.pathPatternError = pathPatternError;
module.exports.pathPatternMiddleware = pathPatternMiddleware;