var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');
var http = require('http');

var sharpie = require('../');

describe("Sharpie middleware", function suite() {

	it("should pass through an image with unsupported format", function(done) {
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
			server.close();
			done();
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

		http.get('http://localhost:' + port + '/images/image.jpg?rs=w:50').on('response', function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/jpeg');
			server.close();
			done();
		});

	});

});

