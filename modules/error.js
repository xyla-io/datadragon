module.exports.handleError = function(res, code, message, err) {
  if (message === undefined) {
    message = 'An error occurred.';
  }
  if (err) {
    console.log(err);
    message += ` Error: ${err}`;
  }
  res.status(code).json({
    success: false,
    message: message,
  });
};