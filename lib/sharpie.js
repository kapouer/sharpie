if (!process.env.VIPS_WARNING) process.env.VIPS_WARNING = "0";
const sharp = require('sharp');

const http = require('http');
const https = require('https');
const ContentType = require('content-type');
const MediaTyper = require('media-typer');

const debug = require('debug')('sharpie');

const helpers = require('./helpers');
const svg = require('./svg');
const favicon = require('./favicon');

class Sharpie {
	static ignoreHeaders = [
		"content-length",
		"connection",
		"keep-alive",
		"content-encoding",
		"transfer-encoding",
		"upgrade",
		"server",
		"x-powered-by"
	];

	static defaults = {
		rs: "w:2048,h:2048,max",
		q: 90,
		bg: false,
		fg: false,
		flatten: false,
		param: 'url',
		format: false,
		hostnames: false,
		style: false,
		ratio: 'xMinYMin',
		sizes: '16,32,48',
		mean: undefined,
		formats: ['svg', 'png', 'jpeg', 'webp'],
		https: {
			rejectUnauthorized: false
		}
	};
	static formats = (obj => {
		const remapFormat = { heif: 'avif' };
		const map = {
			src: {},
			dst: {}
		};
		for (const format in obj) {
			const remapped = remapFormat[format] ?? format;
			if (obj[format].input.stream) map.src[remapped] = true;
			if (obj[format].output.stream) map.dst[remapped] = true;
		}
		map.dst.ico = true;
		debug("Supported formats", map);
		return map;
	})(sharp.format);

	constructor(opts) {
		this.opts = Object.assign({}, Sharpie.defaults, opts);
		this.opts.signs = Object.assign({
			assignment: ':',
			separator: ','
		}, this.opts.signs ?? {});

		this.opts.mimeAccepts = Object.keys(Sharpie.formats.dst).filter(
			ext => this.opts.formats.includes(ext)
		).map(ext => `image/${ext}`);
	}
	async mw(req, res, next) {
		const { opts } = this;
		const params = Object.assign({}, opts, req.query);
		const url = req.params[opts.param] ?? req.query[opts.param];
		if (!url) return res.status(400).send("Missing url parameter");
		let resize, extract;
		try {
			resize = helpers.params(opts.signs, params.rs);
		} catch (ex) {
			return res.type('text').status(400).send(`Bad parameter: rs:${ex.message}`);
		}
		try {
			extract = helpers.params(opts.signs, params.ex);
		} catch (ex) {
			return res.type('text').status(400).send(`Bad parameter: ex:${ex.message}`);
		}
		if (extract.x == null || extract.y == null || extract.w == null || extract.h == null) {
			extract = null;
		}
		const dstFormat = params.format;
		if (dstFormat && !(dstFormat in Sharpie.formats.dst)) {
			return res.type('text').status(400).send(`Unsupported image format ${dstFormat}`);
		}

		if (params.fg) {
			const color = helpers.color(params.fg);
			if (color == null) {
				return res.type('text').status(400).send(`Bad parameter: fg`);
			} else {
				params.fg = color;
			}
		}
		const curHost = req.get('Host');
		const urlObj = new URL(url, req.protocol + '://' + curHost + req.path);
		if (curHost != urlObj.host && !helpers.hostname(urlObj.hostname, opts.hostnames)) {
			return res.status(403).send("Hostname not allowed: " + urlObj.hostname);
		}
		if (!['http:', 'https:'].includes(urlObj.protocol)) {
			return res.status(400).send("Unsupported protocol: " + urlObj.protocol);
		}
		debug("loading", url);
		const agent = urlObj.protocol == "https:" ? https : http;
		const subReq = agent.request(urlObj, opts.https ?? {}, async subRes => {
			if (subRes.statusCode != 200) {
				subReq.destroy();
				const err = new Error(subRes.statusText);
				err.status = err.statusCode = subRes.statusCode;
				return next(err);
			} else {
				try {
					await this.doPipe(subRes, req, res, next, resize, extract, params);
				} catch (err) {
					subReq.destroy();
					if (err.status) res.type('text').status(err.status).send(err.message);
					else next(err);
				}
			}
		});
		subReq.on('error', err => {
			err.status = err.statusCode = 0;
			next(err);
		});
		subReq.end();
	}

	async doPipe(response, req, res, next, resize, extract, params) {
		const { opts } = this;
		const { formats } = Sharpie;
		const contentType = response.headers['content-type'];
		debug("got content type", contentType);
		const typeObj = getType(contentType);
		if (typeObj.type != "image") {
			// eslint-disable-next-line no-console
			console.warn("Sharpie is supposed to process images, not", contentType);
			response.pipe(res);
			return;
		}
		const formatOptions = {};
		const srcFormat = typeObj.subtype;
		let dstFormat = params.format;
		let postpone = false;
		if (!dstFormat) {
			res.setHeader('Vary', 'Accept');
			const accepts = req.accepts(opts.mimeAccepts);
			if (srcFormat == "svg") {
				// no change
			} else if (accepts == "image/avif") {
				dstFormat = 'avif';
				if (srcFormat == "png") {
					formatOptions.lossless = true;
				}
			} else if (accepts == "image/webp") {
				dstFormat = 'webp';
				if (srcFormat == "png") {
					formatOptions.nearLossless = true;
				}
			} else if (srcFormat == "webp" || srcFormat == "avif") {
				// choose png/jpeg depending on transparency
				postpone = true;
				dstFormat = srcFormat;
			}

			if (!dstFormat) {
				dstFormat = srcFormat;
			}
		}

		Object.keys(response.headers).forEach(header => {
			if (Sharpie.ignoreHeaders.includes(header)) return;
			const nheader = header.split('-').map(s => {
				return s[0].toUpperCase() + s.substring(1);
			}).join('-');
			if (!res.get(nheader)) {
				res.setHeader(nheader, response.headers[header]);
			}
		});

		if (srcFormat == "svg" && dstFormat == "svg") {
			response.pipe(
				svg.transform(params, resize, extract)
			).pipe(res);
			return;
		}
		if (dstFormat == "ico") {
			const sharpPipe = sharp();
			response.pipe(sharpPipe);
			const sizes = (params.sizes ?? opts.sizes).split(',')
				.map(x => Number.parseInt(x));
			const bg = helpers.color(params.bg);
			favicon({ sizes, bg }, sharpPipe, res);
			return;
		}
		if (!(srcFormat in formats.src && dstFormat in formats.dst)) {
			response.pipe(res);
			return;
		}

		if (params.q) {
			formatOptions.quality = parseInt(params.q);
			if (Number.isNaN(formatOptions.quality)) {
				return res.type('text').status(400).send(`Bad parameter: q`);
			}
		}

		let pipeline = sharp();
		response.pipe(pipeline);

		const meta = await pipeline.metadata();
		if (postpone) {
			if (meta.hasAlpha) dstFormat = "png";
			else dstFormat = "jpeg";
		}
		if (dstFormat == "jpeg") {
			const jpegLen = response.headers['content-length'];
			if (jpegLen && jpegLen < 10000) {
				formatOptions.optimizeScans = false;
			}
		}
		res.setHeader('Content-Type', MediaTyper.format({
			type: 'image',
			subtype: dstFormat
		}));
		let w = meta.width;
		let h = meta.height;
		let err;
		if (extract) {
			const exOpts = helpers.extract(extract, w, h);
			for (const k in exOpts) exOpts[k] = Math.round(exOpts[k]);
			w = exOpts.width;
			h = exOpts.height;
			if (!w || !h) {
				err = new Error("Bad parameter: ex:w,h");
				err.status = 400;
				throw err;
			}
			debug("ex", exOpts);
			pipeline.extract(exOpts);
		}
		if (params.bg) {
			debug("bg", params.bg);
		}
		if (params.flatten) {
			debug("flatten", params.flatten);
			try {
				const flattenOpts = {};
				if (params.bg) flattenOpts.background = params.bg;
				pipeline.flatten(flattenOpts);
			} catch (ex) {
				err = ex;
				if (err.message.startsWith('Unable to parse color from string:')) {
					err = new Error("Bad parameter: bg");
				}
				err.status = 400;
				throw err;
			}
		}
		resize = helpers.resize(resize, w, h);
		if (resize && (resize.w == 0 || resize.h == 0 || resize.z == 0)) {
			err = new Error("Bad parameter: rs:w,h");
			err.status = 400;
			throw err;
		}
		if (params.mean !== undefined) {
			if (dstFormat == "png") {
				Object.assign(formatOptions, {
					palette: true,
					colors: 2,
					quality: 0
				});
			}
			const stats = await pipeline.stats();
			pipeline = sharp({
				create: {
					width: w,
					height: h,
					channels: 3,
					background: {
						r: stats.channels[0].mean,
						g: stats.channels[1].mean,
						b: stats.channels[2].mean
					}
				}
			});
		}

		if (resize) {
			debug("resize", resize);
			const resizeOpts = {
				width: resize.w,
				height: resize.h,
				fit: resize.fit,
				withoutEnlargement: !resize.enlarge
			};
			if (params.bg) resizeOpts.background = params.bg;
			try {
				pipeline.resize(resizeOpts);
			} catch (ex) {
				let err = ex;
				if (err.message.startsWith('Unable to parse color from string:')) {
					err = new Error("Bad parameter: bg");
				}
				err.status = 400;
				throw err;
			}

			if (params.crop) {
				debug("crop", params.crop);
				pipeline.crop(params.crop);
			}
		}

		if (!formatOptions.quality) formatOptions.quality = 85;

		// https://www.industrialempathy.com/posts/avif-webp-quality-settings/
		// https://github.com/vercel/next.js/commit/44b4dbcd419b592bea354161a
		// https://matthews.sites.wfu.edu/misc/jpg_vs_gif/JpgCompTest/JpgChromaSub.html

		if (dstFormat == "jpeg") {
			Object.assign(formatOptions, {
				quality: Math.max(formatOptions.quality - 5, 0),
				optimizeScans: true,
				overshootDeringing: true,
				trellisQuantisation: true,
				chromaSubsampling: '4:4:4'
			});
		} else if (dstFormat == "png") {
			Object.assign(formatOptions, {
				quality: Math.min(formatOptions.quality + 15, 100),
				compressionLevel: 3,
				palette: true
			});
		} else if (dstFormat == "avif") {
			Object.assign(formatOptions, {
				speed: 8,
				quality: Math.max(formatOptions.quality - 15, 0),
				chromaSubsampling: '4:4:4' // only needed with sharp < 0.29
			});
		} else if (dstFormat == "webp") {
			Object.assign({
				smartSubsample: false,
				reductionEffort: 2
			});
		}
		pipeline.on('error', err => {
			res.type('text').status(500).send(`Response file error ${err.toString()}`);
		});
		pipeline.toFormat(dstFormat, formatOptions);
		pipeline.pipe(res);
	}
}



function getType(header) {
	let obj = {};
	try {
		obj = ContentType.parse(header);
	} catch(ex) {
		// pass
	}
	if (!obj.type) return obj;
	return MediaTyper.parse(obj.type);
}

module.exports = function (opts) {
	const sharpie = new Sharpie(opts);
	return (req, res, next) => sharpie.mw(req, res, next);
};
Object.assign(module.exports, Sharpie);

