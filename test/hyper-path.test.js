var should = require('should');
var client = require('..');
var express = require('express');
var request = require('supertest');

var app = express();
app.use(express.static(__dirname));

describe('hyper-path', function() {
  var agent = {
    root: function (fn) {
      return agent.get('/api/index.json', fn);
    },
    get: function(href, fn) {
      request(app)
        .get(href)
        .end(function(err, res) {
          if (!res.ok) return fn(new Error(res.body || 'HTTP Error ' + res.status));
          fn(err, res.body);
        });
    }
  };

  it('should return the root resource', function(done) {
    client('.apps', agent)
      .on(function(err, apps) {
        if (err) return done(err);
        should.exist(apps);
        apps.length.should.eql(2);
        apps.should.be.an.Array;
        done();
      });
  });

  it('should traverse objects and arrays', function(done) {
    client('.apps.0.name', agent)
      .on(function(err, name) {
        if (err) return done(err);
        should.exist(name);
        name.should.eql('app');
        done();
      });
  });

  it('should get the length of an array', function(done) {
    client('.apps.length', agent)
      .on(function(err, length) {
        if (err) return done(err);
        should.exist(length);
        length.should.eql(2);
        done();
      });
  });

  it('shouldn\'t choke on null properties', function(done) {
    client('.apps.null-prop.thingy', agent)
      .on(function(err, thingy) {
        if (err) return done(err);
        should.not.exist(thingy);
        done();
      });
  });

  it('should start from a passed scope', function(done) {
    client('apps.0.name', agent)
      .scope({apps: {href: '/api/apps.json'}})
      .on(function(err, name) {
        if (err) return done(err);
        should.exist(name);
        name.should.eql('app');
        done();
      });
  });

  it('should refresh on scope change', function(done) {
    var hasResponded = false;
    var req = client('apps.0.name', agent)
      .scope({apps: {href: '/api/apps.json'}})
      .on(function(err, name) {
        if (err) return done(err);
        should.exist(name);

        // if this is the first time around refresh the scope
        if (!hasResponded) {
          hasResponded = true;
          name.should.eql('app');
          return req.scope({apps: {href: '/api/other-apps.json'}});
        }

        name.should.eql('other app');
        done();
      });
  });

  it('should reference resource properties from a standalone collection', function(done) {
    var root = [
      {href: '/api/app.json'},
      {href: '/api/other-app.json'}
    ];
    root.href = '/api/apps.json';

    client('apps.count', agent)
      .scope({apps: root})
      .on(function(err, count) {
        if (err) return done(err);
        should.exist(count);
        count.should.eql(2);
        done();
      });
  });

  it('should return undefined for undefined values on a standalone collection', function(done) {
    var root = [
      {href: '/api/app.json'}
    ];
    root.href = '/api/apps.json';

    client('apps.thingy', agent)
      .scope({apps: root})
      .on(function(err, thingy) {
        if (err) return done(err);
        should.not.exist(thingy);
        done();
      });
  });

  it('should return a "href"', function(done) {
    client('.apps.href', agent)
      .on(function(err, href) {
        if (err) return done(err);
        should.exist(href);
        href.should.match(/apps.json/);
        done();
      });
  });

  it('should not reference native array functions', function(done) {
    client('.apps.slice', agent)
      .on(function(err, slice) {
        if (err) return done(err);
        should.not.exist(slice);
        done();
      });
  });

  it('should return an identity', function(done) {
    client('thing', agent)
      .scope({thing: 'value'})
      .on(function(err, thing) {
        if (err) return done(err);
        should.exist(thing);
        thing.should.eql('value');
        done();
      });
  });

  it('should return an identity down a prototype chain', function(done) {
    var obj = Object.create({thing: 'value'});
    client('thing', agent)
      .scope(obj)
      .on(function(err, thing) {
        if (err) return done(err);
        should.exist(thing);
        thing.should.eql('value');
        done();
      });
  });

  it('should return an identity from a link', function(done) {
    client('name', agent)
      .scope({href: '/api/app.json'})
      .on(function(err, name) {
        if (err) return done(err);
        should.exist(name);
        name.should.eql('app');
        done();
      });
  });

  it('should follow a JSON pointer', function(done) {
    client('.pointer', agent)
      .on(function(err, pointer) {
        if (err) return done(err);
        should.exist(pointer);
        pointer.should.eql('app');
        done();
      });
  });

  it('should follow a local JSON pointer', function(done) {
    client('.local-pointer', agent)
      .on(function(err, pointer) {
        if (err) return done(err);
        should.exist(pointer);
        pointer.should.eql('app');
        done();
      });
  });

  it('should follow a deeply-nested JSON pointer', function(done) {
    client('.deep-pointer', agent)
      .on(function(err, pointer) {
        if (err) return done(err);
        should.exist(pointer);
        pointer.should.eql('app');
        done();
      });
  });

  it('should follow a deeply-nested JSON pointer', function(done) {
    client('.deep-pointer', agent)
      .on(function(err, pointer) {
        if (err) return done(err);
        should.exist(pointer);
        pointer.should.eql('app');
        done();
      });
  });

  it('should handle JSON pointer collections', function(done) {
    client('.deeply-nested-collection', agent)
      .on(function(err, collection) {
        if (err) return done(err);
        should.exist(collection);
        collection.length.should.eql(2);

        client('col.count', agent)
          .scope({col: collection})
          .on(function(err, count) {
            if (err) return done(err);
            should.exist(count);
            count.should.eql(2);
            done();
          });
      });
  });
});
