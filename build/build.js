
;(function(){

/**
 * Require the module at `name`.
 *
 * @param {String} name
 * @return {Object} exports
 * @api public
 */

function require(name) {
  var module = require.modules[name];
  if (!module) throw new Error('failed to require "' + name + '"');

  if (!('exports' in module) && typeof module.definition === 'function') {
    module.client = module.component = true;
    module.definition.call(this, module.exports = {}, module);
    delete module.definition;
  }

  return module.exports;
}

/**
 * Meta info, accessible in the global scope unless you use AMD option.
 */

require.loader = 'component';

/**
 * Internal helper object, contains a sorting function for semantiv versioning
 */
require.helper = {};
require.helper.semVerSort = function(a, b) {
  var aArray = a.version.split('.');
  var bArray = b.version.split('.');
  for (var i=0; i<aArray.length; ++i) {
    var aInt = parseInt(aArray[i], 10);
    var bInt = parseInt(bArray[i], 10);
    if (aInt === bInt) {
      var aLex = aArray[i].substr((""+aInt).length);
      var bLex = bArray[i].substr((""+bInt).length);
      if (aLex === '' && bLex !== '') return 1;
      if (aLex !== '' && bLex === '') return -1;
      if (aLex !== '' && bLex !== '') return aLex > bLex ? 1 : -1;
      continue;
    } else if (aInt > bInt) {
      return 1;
    } else {
      return -1;
    }
  }
  return 0;
}

/**
 * Find and require a module which name starts with the provided name.
 * If multiple modules exists, the highest semver is used. 
 * This function can only be used for remote dependencies.

 * @param {String} name - module name: `user~repo`
 * @param {Boolean} returnPath - returns the canonical require path if true, 
 *                               otherwise it returns the epxorted module
 */
require.latest = function (name, returnPath) {
  function showError(name) {
    throw new Error('failed to find latest module of "' + name + '"');
  }
  // only remotes with semvers, ignore local files conataining a '/'
  var versionRegexp = /(.*)~(.*)@v?(\d+\.\d+\.\d+[^\/]*)$/;
  var remoteRegexp = /(.*)~(.*)/;
  if (!remoteRegexp.test(name)) showError(name);
  var moduleNames = Object.keys(require.modules);
  var semVerCandidates = [];
  var otherCandidates = []; // for instance: name of the git branch
  for (var i=0; i<moduleNames.length; i++) {
    var moduleName = moduleNames[i];
    if (new RegExp(name + '@').test(moduleName)) {
        var version = moduleName.substr(name.length+1);
        var semVerMatch = versionRegexp.exec(moduleName);
        if (semVerMatch != null) {
          semVerCandidates.push({version: version, name: moduleName});
        } else {
          otherCandidates.push({version: version, name: moduleName});
        } 
    }
  }
  if (semVerCandidates.concat(otherCandidates).length === 0) {
    showError(name);
  }
  if (semVerCandidates.length > 0) {
    var module = semVerCandidates.sort(require.helper.semVerSort).pop().name;
    if (returnPath === true) {
      return module;
    }
    return require(module);
  }
  // if the build contains more than one branch of the same module
  // you should not use this funciton
  var module = otherCandidates.pop().name;
  if (returnPath === true) {
    return module;
  }
  return require(module);
}

/**
 * Registered modules.
 */

require.modules = {};

/**
 * Register module at `name` with callback `definition`.
 *
 * @param {String} name
 * @param {Function} definition
 * @api private
 */

require.register = function (name, definition) {
  require.modules[name] = {
    definition: definition
  };
};

/**
 * Define a module's exports immediately with `exports`.
 *
 * @param {String} name
 * @param {Generic} exports
 * @api private
 */

require.define = function (name, exports) {
  require.modules[name] = {
    exports: exports
  };
};
require.register("hyper-path", function (exports, module) {
function noop() {}

/**
 * Expose the Request object
 */

module.exports = Request;

/**
 * Get a reference to hasOwnProperty
 */

var hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Create a hyper-path request
 *
 * @param {String} path
 * @param {Client} client
 */

function Request(path, client, delim) {
  if (!(this instanceof Request)) return new Request(path, client);

  // init client
  this.client = client;
  if (!this.client) throw new Error('hyper-path requires a client to be passed as the second argument');

  this.delim = delim || '.';
  this.parse(path);

  this._listeners = {};
  this._scope = {};
  this._warnings = {};
}

/**
 * Set the root scope
 *
 * @param {Object} scope
 * @return {Request}
 */

Request.prototype.scope = function(scope) {
  this._scope = this.wrappedScope ? [scope] : scope;
  if (this._fn) this.get();
  return this;
};

/**
 * Call a function anytime the data changes in the request
 *
 * @param {Function} fn
 * @return {Request}
 */

Request.prototype.on = function(fn) {
  this._fn = fn;
  this.get();
  return this;
};

/**
 * Refresh the data down the path
 *
 * @return {Request}
 */

Request.prototype.get =
Request.prototype.refresh = function(fn) {
  var scope = this._scope;
  fn = fn || this._fn;

  // Clear any previous listeners
  this.off();

  return this.isRoot ?
    this.fetchRoot(scope, fn) :
    this.traverse(scope, {}, 0, this.path, {}, true, fn);
};

/**
 * Issue a warning once per request
 *
 * @param {String} str
 */

Request.prototype.warn = function(str) {
  if (this._warnings[str]) return;
  console.warn(str);
  this._warnings[str] = true;
  return this;
};

/**
 * Parse the string with the following syntax
 *
 *   Start at this.scope['path']
 *
 *     path.to.my.name
 *
 *   Start at the client's root
 *
 *     .path.to.my.name
 *
 * @param {String} str
 * @api private
 */

Request.prototype.parse = function(str) {
  var path = this.path = Array.isArray(str) ? str.slice() : str.split(this.delim);
  this.index = path[0];
  if (path.length === 1) {
    this.wrappedScope = true;
    path.unshift(0);
  }
  this.isRoot = this.index === '';
  this.target = path[path.length - 1];
};

/**
 * unsubscribe from any emitters for a request
 *
 * @return {Request}
 */

Request.prototype.off = function() {
  for (var key in this._listeners) {
    this.replaceListener(key, null, this._fn);
  }

  return this;
};

/**
 * Traverse properties in the api
 *
 * @param {Any} parent
 * @param {Object} links
 * @param {Integer} i
 * @param {Array} path
 * @param {Object} parentDocument
 * @param {Boolean} normalize
 * @param {Function} cb
 * @api private
 */

Request.prototype.traverse = function(parent, links, i, path, parentDocument, normalize, cb) {
  var self = this;

  // we're done searching
  if (i >= path.length) return cb(null, normalize ? self._normalizeTarget(parent) : parent, parentDocument);

  var key = path[i];
  var value = self._get(key, parent, links);

  // we couldn't find the property
  if (!isDefined(value)) {
    if (i !== 0 || !self._get('href', parent)) return self.handleUndefined(key, parent, links, i, path, parentDocument, normalize, cb);

    // handle cases where the scope has an href
    path = path.slice();
    path.unshift('value');

    return self.traverse({
      value: parent
    }, links, 0, path, parentDocument, normalize, cb);
  }

  var next = i + 1;
  var nextProp = path[next];
  var href = self._get('href', value);

  // we don't have a link to use or it's set locally on the object
  if (!href || hasOwnProperty.call(value, nextProp) || path.length === 1) return self.traverse(value, links, next, path, parentDocument, normalize, cb);

  // fetch the resource
  return self.fetchResource(href, next, path, normalize, cb);
};

/**
 * Handle an undefined value
 *
 * @param {String} key
 * @param {Object|Array} parent
 * @param {Object} links
 * @param {Integer} i
 * @param {Array} path
 * @param {Object} parentDocument
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.handleUndefined = function(key, parent, links, i, path, parentDocument, normalize, cb) {
  // check to make sure it's not on a "normalized" target
  var coll = this._normalizeTarget(parent);
  if (this._get(key, coll)) return this.traverse(coll, links, i, path, parentDocument, normalize, cb);

  var value = parent && parent[key];
  if (typeof value === 'function') return cb(null, value.bind(parent), parentDocument);

  value = value || coll && coll[key];
  if (typeof value === 'function') return cb(null, value.bind(coll), parentDocument);

  return cb(null, value, parentDocument);
};

/**
 * Fetch the root resource through the client
 *
 * @param {Object} scope
 * @param {Function} cb
 */

Request.prototype.fetchRoot = function(scope, cb) {
  var self = this;

  var res = self.client.root(function handleRoot(err, body, links, href, shouldResolve) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    var bodyHref = self._get('href', body);
    href = href || bodyHref;

    if (!href) self.warn('root missing href: local JSON pointers will not function properly');
    else body = shouldResolve === false ?
      body :
      self._resolve(bodyHref, body);

    return self.traverse(body || scope, links, 1, self.path, body, true, cb);
  });

  return self.replaceListener('.', res, cb);
};

/**
 * Fetch a resource through the client
 *
 * @param {String} href
 * @param {Integer} i
 * @param {Array} path
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.fetchResource = function(href, i, path, normalize, cb) {
  var self = this;
  var orig = href;
  var parts = orig.split('#');
  href = parts[0];

  if (href === '') return cb(new Error('cannot request "' + orig + '" without parent document'));

  var res = self.client.get(href, function handleResource(err, body, links, hrefOverride, shouldResolve) {
    if (err) return cb(err);
    if (!body && !links) return cb(null);
    links = links || {};

    // allow clients to override the href (usually because of a redirect)
    href = hrefOverride || href;

    // Be nice to APIs that don't set 'href'
    var bodyHref = self._get('href', body);
    if (!bodyHref) body = self._set('href', href, body);

    var resolved = shouldResolve === false ?
          body :
          self._resolve(bodyHref || href, body);

    return parts.length === 1 ?
      self.traverse(resolved, links, i, path, resolved, normalize, cb) :
      self.fetchJsonPath(href, resolved, links, parts[1], i, path, normalize, cb);
  });

  return self.replaceListener(orig, res, cb);
};

/**
 * Replace the listener for a key
 *
 * @param {String} key
 * @param {Any} res
 * @param {Function} cb
 * @return {Any}
 */

Request.prototype.replaceListener = function(key, res, cb) {
  if (this._fn !== cb) return res;
  (this._listeners[key] || noop)();
  if (!res) delete this._listeners[key];
  else this._listeners[key] = typeof res === 'function' ? res : noop;
  return res;
};

/**
 * Traverse a JSON path
 *
 * @param {String} parentHref
 * @param {Object} parentDocument
 * @param {Object} links
 * @param {String} href
 * @param {Integer} i
 * @param {Array} path
 * @param {Boolean} normalize
 * @param {Function} cb
 */

Request.prototype.fetchJsonPath = function(parentHref, parentDocument, links, href, i, path, normalize, cb) {
  var self = this;
  var pointer = href.split('/');
  var resolvedHref = (parentDocument.href || parentHref || '') + '#' + href;

  if (pointer[0] === '') pointer.shift();

  return self.traverse(parentDocument, links, 0, pointer, parentDocument, false, function handleJsonPath(err, val) {
    if (err) return cb(err);
    if (!self._get('href', val)) val = self._set('href', resolvedHref, val);
    return self.traverse(val, links, i, path, parentDocument, normalize, cb);
  });
};

/**
 * Resolve any local JSON pointers
 *
 * @param {String} root
 * @param {Any} body
 * @return {Any}
 */

Request.prototype._resolve = function(root, body, type) {
  if (!body || (type || typeof body) !== 'object') return body;
  var obj = Array.isArray(body) ? [] : {};
  var value, childType;
  for (var key in body) {
    if (!hasOwnProperty.call(body, key)) continue;
    value = body[key];

    childType = typeof value;
    if (key === 'href' && childType === 'string' && value.charAt(0) === '#') {
      obj.href = root + value;
    } else {
      obj[key] = this._resolve(root, value, childType);
    }
  }
  return obj;
};

/**
 * Get a value given a key/object
 *
 * @api private
 */

Request.prototype._get = function(key, parent, fallback) {
  if (!parent) return void 0;
  if (hasOwnProperty.call(parent, key)) return parent[key];
  if (typeof parent.get === 'function') return parent.get(key);
  if (fallback && hasOwnProperty.call(fallback, key)) return {href: fallback[key]};
  return void 0;
}

/**
 * Set a value on an object
 *
 * @api private
 */

Request.prototype._set = function(key, value, obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (typeof obj.set === 'function') return obj.set(key, value);
  obj[key] = value;
  return obj;
}

/**
 * If the final object is an collection, pass that back
 *
 * @api private
 */

Request.prototype._normalizeTarget = function(target) {
  if (typeof target !== 'object' || !target) return target;
  var href = this._get('href', target);
  target = firstDefined(this._get('collection', target), this._get('data', target), target);
  return href ? this._set('href', href, target) : target;
}

/**
 * Choose the first defined value
 *
 * @api private
 */

function firstDefined() {
  for (var i = 0, l = arguments.length, v; i < l; i++) {
    v = arguments[i];
    if (typeof v !== 'undefined') return v;
  }
  return v;
}

/**
 * Check if a value is defined
 *
 * @api private
 */

function isDefined(value) {
  return typeof value !== 'undefined' && value !== null;
}

});

if (typeof exports == "object") {
  module.exports = require("hyper-path");
} else if (typeof define == "function" && define.amd) {
  define("hyper-path", [], function(){ return require("hyper-path"); });
} else {
  (this || window)["hyper-path"] = require("hyper-path");
}
})()
