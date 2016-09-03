var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');
var http = require('http');

var sharpie = require('../');

describe("Proxy", function suite() {

	it("should resize an image", function(done) {
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

		http.get('http://localhost:' + port + '/images/favicon.ico').on('response', function(res) {
			should(res.statusCode).equal(200);
			server.close();
			done();
		});

	});

});

