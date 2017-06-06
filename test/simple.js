var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');
var http = require('http');

var sharpie = require('../');

describe("Sharpie middleware", function suite() {

	it("should pass through images with unsupported format", function(done) {
		var app = express();
		var server = app.listen();
		var port = server.address().port;

		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		http.get('http://localhost:' + port + '/images/image.ico').on('response', function(res) {
			should(res.statusCode).equal(200);
			http.get('http://localhost:' + port + '/images/image.svg').on('response', function(res) {
				should(res.statusCode).equal(200);
				server.close();
				done();
			});
		});
	});

	it("should resize a jpeg image", function(done) {
		var app = express();
		var server = app.listen();
		var port = server.address().port;

		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		http.get('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75').on('response', function(res) {
			should(res.statusCode).equal(200);
			var len = 0;
			res.on('data', function(buf) {
				len += buf.length;
			});
			res.on('end', function() {
				should(len).equal(636);
				server.close();
				done();
			});
			should(res.headers['content-type']).equal('image/jpeg');
		});
	});

	it("should not allow blacklisted domain", function(done) {
		var app = express();
		var server = app.listen();
		var port = server.address().port;

		app.get('/', sharpie({
			hostnames: function(hostname) {
				if (hostname == 'www.gravatar.com') return true;
				else return false;
			}
		}));

		http.get('http://localhost:' + port + '/?url=' + encodeURIComponent('http://www.gravatar.com/avatar/0.jpg')).on('response', function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/jpeg');
			http.get('http://localhost:' + port + '/?url=' + encodeURIComponent('https://avatars0.githubusercontent.com/u/0')).on('response', function(res) {
				should(res.statusCode).equal(403);
				server.close();
				done();
			});
		});
	});

	it("should append style tag to svg root element", function(done) {
		var app = express();
		var server = app.listen();
		var port = server.address().port;

		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		http.get('http://localhost:' + port + '/images/image.svg?style=*%7Bfill%3Ared%3B%7D').on('response', function(res) {
			should(res.statusCode).equal(200);
			var xml = "";
			res.on('data', function(buf) {
				xml += buf.toString();
			});
			res.on('end', function() {
				should(xml).containEql(`<svg width="600" height="600" version="1.0"><style type="text/css"><![CDATA[
*{fill:red;}
]]</style>`);
				server.close();
				done();
			});
		});
	});

	it("should abort request and return 400 when not an image", function(done) {
		var app = express();
		var server = app.listen();
		var port = server.address().port;

		app.get('/file.txt', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, function(req, res, next) {
			res.send('some text');
		});

		http.get('http://localhost:' + port + '/file.txt').on('response', function(res) {
			should(res.statusCode).equal(400);
			server.close();
			done();
		});
	});
});

