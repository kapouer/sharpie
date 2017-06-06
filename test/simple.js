var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');
var got = require('got');

var sharpie = require('../');

describe("Sharpie middleware", function suite() {
	var app, server, port;
	before(function() {
		app = express();
		server = app.listen();
		port = server.address().port;
	});
	after(function() {
		if (server) server.close();
	});

	it("should pass through images with unsupported format", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.ico').then(function(res) {
			should(res.statusCode).equal(200);
		}).then(function() {
			return got('http://localhost:' + port + '/images/image.svg');
		}).then(function(res) {
			should(res.statusCode).equal(200);
		});
	});

	it("should resize a jpeg image", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length == 636);
			should(res.headers['content-type']).equal('image/jpeg');
		});
	});

	it("should not allow blacklisted domain", function() {
		app.get('/', sharpie({
			hostnames: function(hostname) {
				if (hostname == 'www.gravatar.com') return true;
				else return false;
			}
		}));

		return got('http://localhost:' + port, {query: {
			url: 'http://www.gravatar.com/avatar/0.jpg'
		}}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/jpeg');
			return got('http://localhost:' + port, {query:{
				url: 'https://avatars0.githubusercontent.com/u/0'
			}}).catch(function(err) {
				return err;
			}).then(function(res) {
				should(res.statusCode).equal(403);
			});
		});
	});

	it("should append style tag to svg root element", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.svg', {query:{
			style: '*{fill:red;}'
		}}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(
`<svg width="600" height="600" version="1.0"><style type="text/css"><![CDATA[
*{fill:red;}
]]</style>`
			);
		});
	});

	it("should abort request and return 400 when not an image", function() {
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

		return got('http://localhost:' + port + '/file.txt').catch(function(err) {
			return err;
		}).then(function(res) {
			should(res.statusCode).equal(400);
		});
	});

	it("should pass errors gracefully", function() {
		app.get('/fail.jpg', function(req, res, next) {
			res.status(500);
			res.send('Fake server error');
		});
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image404.jpg?rs=w:50&q=75').catch(function(err) {
			return err;
		}).then(function(res) {
			should(res.statusCode).equal(404);
			return got('http://localhost:' + port + '/images/image500.jpg?rs=w:50&q=75');
		}).catch(function(err) {
			return err;
		}).then(function(res) {
			should(res.statusCode).equal(500);
			return got('http://localhost:' + port + '/fail.jpg?rs=w:50&q=75');
		}).catch(function(err) {
			return err;
		}).then(function(res) {
			should(res.statusCode).equal(500);
		});
	});
});

