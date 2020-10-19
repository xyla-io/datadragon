const mongoose = require('mongoose');
const { componentsFromPath } = require('./path-utilities');

module.exports.middleware = function(collection, relationship, entityID, suffixComponents, entityConditionFactory) {
  return (req, res, next) => {
    if (!req.user || !req.user._id) {
      return res.status(403).json({
        message: 'User is not authenticated',
      });
    }

    let pathComponents = req.path.split('/');
    if (suffixComponents) {
      pathComponents.splice(-suffixComponents, suffixComponents);
    }
    let localEntityID = (entityID === undefined) ? pathComponents.pop() : entityID;
    let localCollection = (collection === undefined) ? pathComponents.pop() : collection;
    let localRelationship = (relationship === undefined) ? 'user' : relationship;
    let localEntityCondition = (entityConditionFactory === undefined) ? undefined : entityConditionFactory(localEntityID);

    userOwnsEntity(req.user._id.toString(), localCollection, localRelationship, localEntityID, localEntityCondition).then(success => {
      if (success) {
        return next();
      } else {
        return res.status(403).json({
          message: 'User does not own this resource',
        });
      }
    });
  }
};

module.exports.pathMiddleware = function(suffixComponents, pathUserIndex) {
  const localPathUserIndex = (pathUserIndex === undefined) ? 1 : pathUserIndex;
  return this.middleware('users', '_id', undefined, suffixComponents, path => { 
    const userID = componentsFromPath(path)[localPathUserIndex];
    if (mongoose.Types.ObjectId.isValid(userID)) {
      return {
        _id: new mongoose.Types.ObjectId(userID),
      }; 
    } else {
      return {
        _id: { $exists: false },
      };
    }
  });
}

module.exports.userOwnsEntity = userOwnsEntity;

function userOwnsEntity(userID, collection, ownerRelationship, entityID, entityCondition) {
  let properties = {};
  properties[ownerRelationship] = true;
  if (entityCondition === undefined) {
    entityCondition = {_id: new mongoose.mongo.ObjectId(entityID)};
  }
  return mongoose.connection.db.collection(collection).findOne(entityCondition, properties).then(
    entity => {
      if (entity === null) { return false; }
      return entity[ownerRelationship].toString() === userID;
      }, err => {
      console.log(err);
      return false;
    });
}