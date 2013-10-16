/**
 * Module dependencies
 */

var client = require('hyperagent');
var emitter = require('hyper-emitter');
var each = require('each');

/**
 * Watch the path
 */

module.exports = Request;

function Request(str) {
  if (!(this instanceof Request)) return new Request(str);

  try {
    this.parse(str);
  } catch (err) {
    return fn(err);
  }

  this._listeners = {};
}

Request.prototype.root = function(root) {
  this._root = root;
  if (this._fn) this.refreshRoot();
  return this;
};

Request.prototype.on = function(fn) {
  this._fn = fn;
  this.refreshRoot();
  return this;
};

Request.prototype.refreshRoot = function() {
  var self = this;
  var root = self._root;
  var fn = self._fn;

  // Clear any previous listeners
  this.off();

  if (!self.isRoot) return self.traverse(root, 0, fn);

  client()
    .on('error', fn)
    .end(function(res) {
      self.traverse(res.body || root, 1, fn);
    });
};

/**
 * Parse the string with the following syntax
 *
 *     path.to.my.name
 *
 *     .path.to.my.name
 *
 * @param {String} str
 * @api private
 */

Request.prototype.parse = function(str) {
  var path = this.path = str.split('.');
  this.index = path[0];
  this.isRoot = this.index === '';
  this.target = path[path.length - 1];
};

/**
 * Off
 *
 * unsubscribe from any emitters for a request
 */

Request.prototype.off = function() {
  each(this._listeners, function(href, listener) {
    listener();
  });
};

/**
 * Traverse properties in the api
 *
 * @param {Any} parent
 * @param {Integer} i
 * @param {Function} cb
 * @api private
 */

Request.prototype.traverse = function(parent, i, cb) {
  var request = this;

  // We're done searching
  if (i === request.path.length) return cb(null, parent);

  var key = request.path[i];
  var value = parent[key];

  // We couldn't find the property
  if (typeof value === 'undefined') return cb(null);

  // It's local
  if (!value.href) return request.traverse(value, i + 1, cb);

  // We're just getting the link
  if (request.path[i + 1] === 'href') return cb(null, value);

  // It's a link
  var href = value.href;

  // Unsubscribe and resubscribe if it was previously requested
  if (request._listeners[href]) request._listeners[href]();

  request._listeners[href] = emitter.get(href, function(err, body) {
    if (err) return cb(err);
    if (!body) return cb(null);

    // It's the same name as what the link was
    if (body[key]) return request.traverse(body[key], i + 1, cb);

    // We're looking for another property
    request.traverse(body, i + 1, cb);
  });
}