import should from 'should';
import express from 'express';
import compression from 'compression';
import { sharpie, sharp } from 'sharpie';

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

	it("should pass through images with unsupported format", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.ico');
		should(res.status).equal(200);
	});

	it("should pass through unparsable svg", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/wrong.svg');
		should(res.status).equal(200);
		should(await res.text()).containEql('<svg ="100" y="50"');
	});

	it("should support self-closed svg", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/empty.svg');
		should(res.status).equal(200);
		should(await res.text()).containEql('preserveAspectRatio="xMinYMin"/>');
	});

	it("should resize a jpeg image", async () => {
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

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75');
		const buf = await res.arrayBuffer();
		should(res.status).equal(200);
		should(buf.byteLength).lessThan(890);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(50);
		should(meta.height).equal(50);
		should(meta.format).equal('jpeg');
	});

	it("should resize a jpeg image using file stream", async () => {
		app.get('/images/*', sharpie({
			param(req, params) {
				should(params.rs).deepEqual({ w: 50 });
				return './test' + req.path;
			}
		}), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w:50&q=75');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(890);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(50);
		should(meta.height).equal(50);
		should(meta.format).equal('jpeg');
	});

	it("should fail on a jpeg image using file stream", async () => {
		app.get('/images/*', sharpie({
			param(req) {
				return './test' + req.path;
			}
		}), errHandler);
		const res = await fetch('http://localhost:' + port + '/images/imagenot.jpg?rs=w:50&q=75');
		should(res.status).equal(404);
	});

	it("should fail to resize a jpeg image because rs is bad", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w:aa&q=75');
		should(res.status).equal(400);
		should(await res.text()).equal("Bad parameter: rs:w");
	});

	it("should fail to resize a jpeg image because bg is bad", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w:20&bg=33F');
		should(res.status).equal(400);
		should(await res.text()).equal("Bad parameter: bg");
	});

	it("should fail to flatten a png image because bg is bad", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.png?flatten=1&bg=33F');
		should(res.status).equal(400);
		should(await res.text()).equal("Bad parameter: bg");
	});


	it("should fail to resize a jpeg image because q is bad", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?q=SELECT');
		should(res.status).equal(400);
		should(await res.text()).equal("Bad parameter: q");
	});


	it("should convert jpeg to webp", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: 'image/webp,*/*'
			}
		});
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/webp');
		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		should(meta.format).equal('webp');
	});

	it("should convert jpeg to avif", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie({formats: ['jpeg', 'webp', 'avif']})(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
			}
		});
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/avif');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(800);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.format).equal('heif');
	});

	it("should not convert jpeg to webp", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg', {
			headers: {
				Accept: '*/*'
			}
		});
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(1500);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.format).equal('jpeg');
	});

	it("should convert webp to jpeg", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.webp');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(1500);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.format).equal('jpeg');
	});

	it("should convert webp with alpha to png", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image-alpha.webp');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/png');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(3500);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.format).equal('png');
		should(meta.hasAlpha).equal(true);
	});

	it("should resize a jpeg image and return 400 with bad params", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w:-1,h:10&q=75');
		should(res.status).equal(400);
		should(res.headers.get('content-type')).equal('text/plain; charset=utf-8');
	});

	it("should set signs", async () => {
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

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=w~50!z~50&q=75');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(669);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(25);
		should(meta.height).equal(25);
		should(meta.format).equal('jpeg');
	});

	it("should resize a jpeg image using rs:z param", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?rs=z:30&q=75');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(690);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(30);
		should(meta.height).equal(30);
		should(meta.format).equal('jpeg');
	});

	it("should resize a png image and not crash if rs:z param is wrong", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.png?ex=x:50,y:50,w:80,h:1&rs=z:1&q=75');
		should(res.status).equal(400);
		should(await res.text()).equal("Bad parameter: rs:w,h");
	});

	it("should convert a svg image to png preview", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/pb.svg?format=png&rs=z:25');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/png');
		const buf = await res.arrayBuffer();
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(64);
		should(meta.height).equal(64);
		should(meta.format).equal('png');
	});

	it("should convert a svg image to a favicon", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/pb.svg?format=ico');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/x-icon');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(2408);
	});

	it("should fail to convert missing image to a favicon", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/bluk.png?format=ico');
		should(res.status).equal(404);
	});

	it("should extract a jpeg image", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:50,h:100');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(1050);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(50);
		should(meta.height).equal(100);
		should(meta.format).equal('jpeg');
	});

	it("should extract a jpeg image and return 400 with bad parameters", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.jpg?ex=x:50,y:50,w:0,h:100');
		should(res.status).equal(400);
		should(res.headers.get('content-type')).equal('text/plain; charset=utf-8');
	});

	it("should extract a jpeg image and return 200 even if extract if somewhat out of bounds", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/badextract.jpg?ex=x:50,y:68.381,w:100,h:63.239&rs=z:25');
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
	});

	it("should not allow blacklisted domain", async () => {
		app.get('/', sharpie({
			hostnames: function (hostname) {
				if (hostname == 'www.gravatar.com') return true;
				else return false;
			}
		}), errHandler);

		const res = await fetch(`http://localhost:${port}/?${new URLSearchParams({ url: "https://www.gravatar.com/avatar/0.jpg" })}`);
		should(res.status).equal(200);
		should(res.headers.get('content-type')).equal('image/jpeg');
		const res2 = await fetch(`http://localhost:${port}/?${new URLSearchParams({ url: "https://avatars0.githubusercontent.com/u/0" })}`);
		should(res2.status).equal(403);
	}).timeout(5000);

	it("should append style tag to svg root element", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch(`http://localhost:${port}/images/image-unboxed.svg?${new URLSearchParams({ style: "*{fill:red;}" })}`);

		should(res.status).equal(200);
		const text = await res.text();
		should(text).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" preserveAspectRatio="xMinYMin"><style type="text/css"><![CDATA[
*{fill:red;}
]]></style>`);
		should(text).containEql('</svg>');
	});

	it("should add preserveAspectRatio attribute to svg root element with a value of xMaxYMid", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch(`http://localhost:${port}/images/image-boxed.svg?${new URLSearchParams({ ratio: "xMaxYMid" })}`);
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="0 0 30.449219 6.7900095" preserveAspectRatio="xMaxYMid">`);
	});

	it("should add viewBox and preserveAspectRatio attributes to svg root element", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.svg');
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
	});

	it("should change width attribute of svg root element", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.svg?rs=w:50,min');
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="50" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
	});

	it("should support gzipped svg", async () => {
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

		const res = await fetch('http://localhost:' + port + '/images/image.svg?rs=w:50,min');
		should(called).equal(true);
		should(res.headers.get('content-encoding')).equal('gzip');
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="50" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
	});

	it("should change svg viewBox from extract parameters", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.svg?ex=x:50,y:50,w:50,h:100');
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="37.5 10 15 30" preserveAspectRatio="xMinYMin">`);
	});

	it("should change width and height from rs:z of svg root element", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/image.svg?rs=z:50');
		should(res.status).equal(200);
		should(await res.text()).containEql(`<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="15" height="15" viewBox="30 10 30 30" preserveAspectRatio="xMinYMin">`);
	});

	it("should just pipe request when not an image", async () => {
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

		const res = await fetch('http://localhost:' + port + '/file.txt');
		should(res.status).equal(200);
		should(await res.text()).equal('some text');
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

		let res = await fetch('http://localhost:' + port + '/images/image404.jpg?rs=w:50&q=75');
		should(res.status).equal(404);
		res = await fetch('http://localhost:' + port + '/images/image500.jpg?rs=w:50&q=75');
		should(res.status).equal(500);
		res = await fetch('http://localhost:' + port + '/fail.jpg?rs=w:50&q=75');
		should(res.status).equal(500);
	});

	it("should get color of a jpeg image", async () => {
		app.get('/images/*', (req, res, next) => {
			if (req.query.raw === undefined) {
				req.params.url = req.path + '?raw';
				sharpie()(req, res, next);
			} else {
				next();
			}
		}, express.static(testDir), errHandler);

		const res = await fetch('http://localhost:' + port + '/images/color.jpg?mean&format=png');
		should(res.headers.get('content-type')).equal('image/png');
		const buf = await res.arrayBuffer();
		should(buf.byteLength).lessThan(6200);
		const meta = await sharp(Buffer.from(buf)).metadata();
		should(meta.width).equal(1232);
		should(meta.height).equal(816);
		should(meta.format).equal('png');
	});
});

