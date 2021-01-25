var should = require('should');
var express = require('express');
var got = require('got').extend({retry: 0});
var sharp = require('sharp');

var sharpie = require('../');

describe("Sharpie middleware", function suite() {
	var app, server, port;
	beforeEach(function() {
		app = express();
		server = app.listen();
		port = server.address().port;
	});
	afterEach(function() {
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

	it("should support self-closed svg", function () {
		app.get('/images/*', function (req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/empty.svg').then(function (res) {
			should(res.statusCode).equal(200); console.log(res.body);
			should(res.body).containEql('preserveAspectRatio="xMinYMin"/>');
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

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(50);
				should(meta.height).equal(50);
				should(meta.format).equal('jpeg');
			});
		});
	});


	it("should fail to resize a jpeg image because rs is bad", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:aa&q=75', {
			encoding: null
		}).then(function(res) {
			should("not").not.equal("be here");
		}).catch(function(err) {
			should(err.statusCode).equal(400);
			should(err.body.toString()).equal("Bad parameter: rs:w");
		});
	});

	it("should fail to resize a jpeg image because bg is bad", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:20&bg=33F', {
			encoding: null
		}).then(function(res) {
			should("not").be.equal("be here");
		}).catch(function(err) {
			should(err.statusCode).equal(400);
			should(err.body.toString()).equal("Bad parameter: bg");
		});
	});

	it("should fail to flatten a png image because bg is bad", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.png?flatten=1&bg=33F', {
			encoding: null
		}).then(function(res) {
			should("not").be.equal("be here");
		}).catch(function(err) {
			should(err.statusCode).equal(400);
			should(err.body.toString()).equal("Bad parameter: bg");
		});
	});


	it("should fail to resize a jpeg image because q is bad", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?q=SELECT', {
			encoding: null
		}).then(function(res) {
			should("not").be.equal("be here");
		}).catch(function(err) {
			should(err.statusCode).equal(400);
			should(err.body.toString()).equal("Bad parameter: q");
		});
	});


	it("should convert jpeg to webp", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: 'image/webp,*/*'
			},
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/webp');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.format).equal('webp');
			});
		});
	});

	it("should not convert jpeg to webp", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: '*/*'
			},
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should convert webp to jpeg", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.webp', {
			headers: {},
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should convert webp with alpha to png", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image-alpha.webp', {
			headers: {},
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/png');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.format).equal('png');
				should(meta.hasAlpha).equal(true);
			});
		});
	});

	it("should resize a jpeg image and return 400 with bad params", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:0,h:10&q=75', {
			encoding: null
		}).catch(function(res) {
			should(res.statusCode).equal(400);
			should(res.headers['content-type']).equal('text/plain; charset=utf-8');
		});
	});

	it("should set signs", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie({
					signs: {
						assignment: '~',
						separator: '!'
					}
				})(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?rs=w~50!z~50&q=75', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(417);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(25);
				should(meta.height).equal(25);
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

		return got('http://localhost:' + port + '/images/image.jpg?rs=z:30&q=75', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(430);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(30);
				should(meta.height).equal(30);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should resize a png image and not crash if rs:z param is wrong", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.png?ex=x:50,y:50,w:80,h:1&rs=z:1&q=75', {
			encoding: null
		}).then(function(res) {
		}).catch(function(res) {
			should(res.statusCode).equal(500);
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

		return got('http://localhost:' + port + '/images/pb.svg?format=png&rs=z:25', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/png');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(64);
				should(meta.height).equal(64);
				should(meta.format).equal('png');
			});
		});
	});

	it("should convert a svg image to a favicon", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie({
					im: '/usr/bin/convert'
				})(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/pb.svg?format=ico', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/x-icon');
			should(res.body.length).equal(22382);
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

		return got('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:50,h:100', {
			encoding: null
		}).then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(840);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(50);
				should(meta.height).equal(100);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should extract a jpeg image and return 400 with bad parameters", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:0,h:100', {
			encoding: null
		}).catch(function(res) {
			should(res.statusCode).equal(400);
			should(res.headers['content-type']).equal('text/plain; charset=utf-8');
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
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" preserveAspectRatio="xMinYMin"><style type="text/css"><![CDATA[
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
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="0 0 30.449219 6.7900095" preserveAspectRatio="xMaxYMid">`);
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
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change width attribute of svg root element", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.svg?rs=w:50,min').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="50" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change svg viewBox from extract parameters", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.svg?ex=x:50,y:50,w:50,h:100').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="37.5 10 15 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change width and height from rs:z of svg root element", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/image.svg?rs=z:50').then(function(res) {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="15" height="15" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should just pipe request when not an image", function() {
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
			should(res.statusCode).equal(200);
			should(res.body).equal('some text');
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

	it("should get color of a jpeg image", function() {
		app.get('/images/*', function(req, res, next) {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				req.url = req.path.substring('/images'.length);
				next();
			}
		}, express.static(__dirname + '/images'));

		return got('http://localhost:' + port + '/images/color.jpg?mean&format=png', {
			encoding: null
		}).then(function(res) {
			should(res.headers['content-type']).equal('image/png');
			should(res.body.length).lessThan(6200);
			return sharp(res.body).metadata().then(function(meta) {
				should(meta.width).equal(1232);
				should(meta.height).equal(816);
				should(meta.format).equal('png');
			});
		});
	});
});

