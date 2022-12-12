import should from 'should';
import express from 'express';
import { default as Got } from 'got';
import compression from 'compression';
import { sharpie, sharp } from 'sharpie';

const got = Got.extend({ retry: 0 });
const testDir = new URL(".", import.meta.url).pathname;

function errHandler(err, req, res, next) {
	console.error(err);
	res.type('text').status(err.statusCode ?? 500).end(err.message);
}

describe("Sharpie middleware", () => {
	let app, server, port;
	beforeEach(() => {
		app = express();
		server = app.listen();
		port = server.address().port;
	});
	afterEach(() => {
		if (server) server.close();
	});

	it("should pass through images with unsupported format", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.ico').then((res) => {
			should(res.statusCode).equal(200);
		});
	});

	it("should pass through unparsable svg", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/wrong.svg').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql('<svg ="100" y="50"');
		});
	});

	it("should support self-closed svg", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/empty.svg').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql('preserveAspectRatio="xMinYMin"/>');
		});
	});

	it("should resize a jpeg image", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, (err => {
					console.error(err);
					next(err);
				}));
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(890);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(50);
				should(meta.height).equal(50);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should resize a jpeg image using file stream", () => {
		app.get('/images/*', sharpie({
			param(req) {
				return './test' + req.path;
			}
		}), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/jpeg');
			should(res.body.length).lessThan(890);
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(50);
				should(meta.height).equal(50);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should fail on a jpeg image using file stream", async () => {
		app.get('/images/*', sharpie({
			param(req) {
				return './test' + req.path;
			}
		}), errHandler);

		try {
			await got('http://localhost:' + port + '/images/imagenot.jpg?rs=w:50&q=75', {
				responseType: 'buffer'
			});
		} catch (err) {
			should(err.response.statusCode).equal(404);
		}
	});

	it("should fail to resize a jpeg image because rs is bad", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:aa&q=75', {
			responseType: 'buffer'
		}).then((res) => {
			should("not").not.equal("be here");
		}).catch((err) => {
			should(err.response.statusCode).equal(400);
			should(err.response.body.toString()).equal("Bad parameter: rs:w");
		});
	});

	it("should fail to resize a jpeg image because bg is bad", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:20&bg=33F', {
			responseType: 'buffer'
		}).then((res) => {
			should("not").be.equal("be here");
		}).catch((err) => {
			should(err.response.statusCode).equal(400);
			should(err.response.body.toString()).equal("Bad parameter: bg");
		});
	});

	it("should fail to flatten a png image because bg is bad", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.png?flatten=1&bg=33F', {
			responseType: 'buffer'
		}).then((res) => {
			should("not").be.equal("be here");
		}).catch((err) => {
			should(err.response.statusCode).equal(400);
			should(err.response.body.toString()).equal("Bad parameter: bg");
		});
	});


	it("should fail to resize a jpeg image because q is bad", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?q=SELECT', {
			responseType: 'buffer'
		}).then((res) => {
			should("not").be.equal("be here");
		}).catch((err) => {
			should(err.response.statusCode).equal(400);
			should(err.response.body.toString()).equal("Bad parameter: q");
		});
	});


	it("should convert jpeg to webp", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: 'image/webp,*/*'
			},
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/webp');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.format).equal('webp');
			});
		});
	});

	it("should convert jpeg to avif", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie({formats: ['jpeg', 'webp', 'avif']})(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
			},
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/avif');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.format).equal('heif');
			});
		});
	});

	it("should not convert jpeg to webp", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: '*/*'
			},
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should convert webp to jpeg", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.webp', {
			headers: {},
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should convert webp with alpha to png", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image-alpha.webp', {
			headers: {},
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			// should(res.body.length).lessThan(635);
			should(res.headers['content-type']).equal('image/png');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.format).equal('png');
				should(meta.hasAlpha).equal(true);
			});
		});
	});

	it("should resize a jpeg image and return 400 with bad params", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w:0,h:10&q=75', {
			responseType: 'buffer'
		}).catch((res) => {
			should(res.statusCode).equal(400);
			should(res.headers['content-type']).equal('text/plain; charset=utf-8');
		});
	});

	it("should set signs", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie({
					signs: {
						assignment: '~',
						separator: '!'
					}
				})(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=w~50!z~50&q=75', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(669);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(25);
				should(meta.height).equal(25);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should resize a jpeg image using rs:z param", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?rs=z:30&q=75', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(690);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(30);
				should(meta.height).equal(30);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should resize a png image and not crash if rs:z param is wrong", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.png?ex=x:50,y:50,w:80,h:1&rs=z:1&q=75', {
			responseType: 'buffer'
		}).then((res) => {
		}).catch((res) => {
			should(res.statusCode).equal(500);
		});
	});

	it("should convert a svg image to png preview", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/pb.svg?format=png&rs=z:25', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/png');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(64);
				should(meta.height).equal(64);
				should(meta.format).equal('png');
			});
		});
	});

	it("should convert a svg image to a favicon", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/pb.svg?format=ico', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/x-icon');
			should(res.body.length).equal(2407);
		});
	});

	it("should extract a jpeg image", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:50,h:100', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body.length).lessThan(1050);
			should(res.headers['content-type']).equal('image/jpeg');
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(50);
				should(meta.height).equal(100);
				should(meta.format).equal('jpeg');
			});
		});
	});

	it("should extract a jpeg image and return 400 with bad parameters", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:0,h:100', {
			responseType: 'buffer'
		}).catch ((res) => {
			should(res.response.statusCode).equal(400);
			should(res.response.headers['content-type']).equal('text/plain; charset=utf-8');
		});
	});

	it("should not allow blacklisted domain", () => {
		app.get('/', sharpie({
			hostnames: function(hostname) {
				if (hostname == 'www.gravatar.com') return true;
				else return false;
			}
		}), errHandler);

		return got('http://localhost:' + port, {
			searchParams: { url: "http://www.gravatar.com/avatar/0.jpg" }
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.headers['content-type']).equal('image/jpeg');
			return got('http://localhost:' + port, {
				searchParams: { url: "https://avatars0.githubusercontent.com/u/0" }
			}).catch((err) => {
				return err;
			}).then((res) => {
				should(res.response.statusCode).equal(403);
			});
		});
	});

	it("should append style tag to svg root element", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image-unboxed.svg', {searchParams:{
			style: '*{fill:red;}'
		}}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" preserveAspectRatio="xMinYMin"><style type="text/css"><![CDATA[
*{fill:red;}
]]></style>`);
			should(res.body).containEql('</svg>');
		});
	});

	it("should add preserveAspectRatio attribute to svg root element with a value of xMaxYMid", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image-boxed.svg', {searchParams:{
			ratio: 'xMaxYMid'
		}}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="0 0 30.449219 6.7900095" preserveAspectRatio="xMaxYMid">`);
		});
	});

	it("should add viewBox and preserveAspectRatio attributes to svg root element", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.svg').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change width attribute of svg root element", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.svg?rs=w:50,min').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="50" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should support gzipped svg", () => {
		let called = false;
		app.use(compression({
			threshold: '0kb',
			filter: function (req, res) {
				called = true;
				return true;
			}
		}));
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.svg?rs=w:50,min').then((res) => {
			should(called).equal(true);
			should(res.headers['content-encoding']).equal('gzip');
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="50" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change svg viewBox from extract parameters", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.svg?ex=x:50,y:50,w:50,h:100').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="37.5 10 15 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should change width and height from rs:z of svg root element", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image.svg?rs=z:50').then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="15" height="15" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
		});
	});

	it("should just pipe request when not an image", () => {
		app.get('/file.txt', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, (req, res, next) => {
			res.send('some text');
		});

		return got('http://localhost:' + port + '/file.txt').catch((err) => {
			return err;
		}).then((res) => {
			should(res.statusCode).equal(200);
			should(res.body).equal('some text');
		});
	});

	it("should pass errors gracefully", async () => {
		app.get('/fail.jpg', (req, res, next) => {
			res.status(500);
			res.send('Fake server error');
		});
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/image404.jpg?rs=w:50&q=75').catch(err => {
			return err;
		}).then(res => {
			should(res.response.statusCode).equal(404);
			return got('http://localhost:' + port + '/images/image500.jpg?rs=w:50&q=75');
		}).catch((err) => {
			return err;
		}).then((res) => {
			should(res.response.statusCode).equal(500);
			return got('http://localhost:' + port + '/fail.jpg?rs=w:50&q=75');
		}).catch((err) => {
			return err;
		}).then((res) => {
			should(res.response.statusCode).equal(500);
			return got('http://localhost:' + port + '/images/image.jpg?rs=w:123123123123&q=75');
		}).catch((res) => {
			should(res.response.statusCode).equal(500);
		});
	});

	it("should get color of a jpeg image", () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		return got('http://localhost:' + port + '/images/color.jpg?mean&format=png', {
			responseType: 'buffer'
		}).then((res) => {
			should(res.headers['content-type']).equal('image/png');
			should(res.body.length).lessThan(6200);
			return sharp(res.body).metadata().then((meta) => {
				should(meta.width).equal(1232);
				should(meta.height).equal(816);
				should(meta.format).equal('png');
			});
		});
	});
});

