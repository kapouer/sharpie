var should = require('should');
var fs = require('fs');
var URL = require('url');
var express = require('express');
var got = require('got');
var sharp = require('sharp');

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
		});
	});

	it("should pass through unparsable svg", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/wrong.svg').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql('<svg ="100" y="50"');
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

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75', {encoding: null}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).equal(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(50);
				should(meta.height).equal(50);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should resize a jpeg image using rs:z param", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=z:30&q=75', {encoding: null}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).equal(430);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(30);
				should(meta.height).equal(30);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should convert a svg image to png preview", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/pb.svg?format=png&rs=z:25', {encoding: null}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/png');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(64);
				should(meta.height).equal(64);
				should(meta.format).equal('png');
			});
		});
	});

	it("should extract a jpeg image", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:50,h:100', {encoding: null}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).equal(809);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(50);
				should(meta.height).equal(100);
				should(meta.format).equal('jpeg');
			});
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

		return got('http://localhost:' + port + '/images/image-unboxed.svg', {query:{
			style: '*{fill:red;}'
		}}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg version="1.0"><style type="text/css"><![CDATA[
*{fill:red;}
]]></style>`);
		});
	});

	it("should add preserveAspectRatio attribute to svg root element with a value of xMaxYMid", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image-boxed.svg', {query:{
			ratio: 'xMaxYMid'
		}}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg
   xmlns="http://www.w3.org/2000/svg"
   version="1.0"
   height="6.7900095"
   width="30.449219"
   viewBox="0 0 30.449219 6.7900095" preserveAspectRatio="xMaxYMid">`);
		});
	});

	it("should add viewBox and preserveAspectRatio attributes to svg root element", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.svg').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg x="100" y="50" width="200" height="400" version="1.0" viewBox="100 50 200 400" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should add viewBox and preserveAspectRatio attributes and style to svg root element", function() {
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
			should(res.body).containEql(`<svg x="100" y="50" width="200" height="400" version="1.0" viewBox="100 50 200 400" preserveAspectRatio="xMinYMin"><style type="text/css"><![CDATA[
*{fill:red;}
]]></style>`);
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
			return got('http://localhost:' + port + '/images/image.jpg?rs=w:123123123123&q=75');
		}).catch(function(res) {
			should(res.statusCode).equal(500);
		});
	});
});

