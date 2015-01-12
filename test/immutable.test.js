/**
 * Module dependencies
 */

var should = require('should');
var parse = require('hyper-json-immutable-parse');
var client = require('..');
var express = require('express');
var request = require('supertest');
var cases = require('./cases');

var app = express();
app.use(express.static(__dirname));

describe('immutable parse', function() {
  var agent = {
    root: function (fn) {
      return agent.get('/api/index.json', fn);
    },
    get: function(href, fn) {
      request(app)
        .get(href)
        .end(function(err, res) {
          if (err) return fn(new Error('could not request href: ' + href));
          if (!res.ok) return fn(new Error('HTTP Error ' + res.status + ' ' + href));
          fn(err, JSON.parse(res.text, parse(href)));
        });
    }
  };

  cases(agent);
});
