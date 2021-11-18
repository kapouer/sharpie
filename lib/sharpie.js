if (!process.env.VIPS_WARNING) process.env.VIPS_WARNING = "0";
const sharp = require('sharp');

const got = require('got').extend({retry: 0});
const URL = require('url');
const ContentType = require('content-type');
const MediaTyper = require('media-typer');
const stream = require('stream');

const debug = require('debug')('sharpie');

const helpers = require('./helpers');
const svg = require('./svg');
let favicon;
const remapFormat = { heif: 'avif' };
const formats = (function(obj) {
	const map = {
		src: {},
		dst: {}
	};
	for (const format in obj) {
		const remapped = remapFormat[format] || format;
		if (obj[format].input.stream) map.src[remapped] = true;
		if (obj[format].output.stream) map.dst[remapped] = true;
	}
	return map;
})(sharp.format);

const ignoreHeaders = [
	"content-length",
	"connection",
	"keep-alive",
	"content-encoding",
	"transfer-encoding",
	"upgrade",
	"server",
	"x-powered-by"
];

debug("Supported formats", formats);

module.exports = function(defaults) {
	let opts = defaults || {};
	opts = Object.assign({
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
		formats: ['svg', 'png', 'jpeg', 'webp']
	}, opts);
	opts.signs = Object.assign({
		assignment: ':',
		separator: ','
	}, opts.signs || {});

	if (opts.im) {
		formats.dst.ico = true;
		favicon = require('./favicon')(opts);
	}
	opts.mimeAccepts = Object.keys(formats.dst).filter(
		(ext) => opts.formats.includes(ext)
	).map((ext) => `image/${ext}`);

	return mw.bind({opts: opts});
};


function mw(req, res, next) {
	const opts = this.opts;
	const params = Object.assign({}, opts, req.query);
	let url = req.params[opts.param] || req.query[opts.param];
	if (!url) return res.status(400).send("Missing url parameter");
	let resize, extract;
	try {
		resize = helpers.params(opts.signs, params.rs);
	} catch(ex) {
		return res.type('text').status(400).send(`Bad parameter: rs:${ex.message}`);
	}
	try {
		extract = helpers.params(opts.signs, params.ex);
	} catch(ex) {
		return res.type('text').status(400).send(`Bad parameter: ex:${ex.message}`);
	}
	if (extract.x == null || extract.y == null || extract.w == null || extract.h == null) {
		extract = null;
	}
	const dstFormat = params.format;
	if (dstFormat && !(dstFormat in formats.dst)) {
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

	const urlObj = URL.parse(url);
	const curHost = req.get('Host');
	if (!urlObj.hostname) {
		url = URL.resolve(req.protocol + '://' + curHost + req.path, url);
	} else if (curHost != urlObj.hostname && !helpers.hostname(urlObj.hostname, opts.hostnames)) {
		return res.status(403).send("Hostname not allowed: " + urlObj.hostname);
	}
	if (urlObj.protocol && urlObj.protocol != "http:" && urlObj.protocol != "https:") {
		return res.status(400).send("Unsupported protocol: " + urlObj.protocol);
	}
	debug("loading", url);
	const pipeline = stream.PassThrough();
	const request = got.stream(url)
		.on('response', (response) => {
			doPipe(opts, pipeline, req, res, next, request, response, resize, extract, params);
		})
		.on('error', (err) => {
			err.status = err.response && err.response.statusCode || 0;
			next(err);
		});
	request.pipe(pipeline);
}

function doPipe(opts, pipeline, req, res, next, request, response, resize, extract, params) {
	const contentType = response.headers['content-type'];
	debug("got content type", contentType);
	const typeObj = getType(contentType);
	if (typeObj.type != "image") {
		// eslint-disable-next-line no-console
		console.warn("Sharpie is supposed to process images, not", contentType);
		pipeline.pipe(res);
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

	Object.keys(response.headers).forEach((header) => {
		if (ignoreHeaders.indexOf(header) >= 0) return;
		const nheader = header.split('-').map((s) => {
			return s[0].toUpperCase() + s.substring(1);
		}).join('-');
		if (!res.get(nheader)) res.setHeader(nheader, response.headers[header]);
	});
	if (srcFormat == "svg" && dstFormat == "svg") {
		pipeline.pipe(svg.transform(params, resize, extract)).pipe(res);
		return;
	}
	if (dstFormat == "ico") {
		res.setHeader('Content-Type', 'image/x-icon');
		favicon.transform(params, pipeline, res);
		return;
	}
	if (!(srcFormat in formats.src && dstFormat in formats.dst)) {
		pipeline.pipe(res);
		return;
	}

	if (params.q) {
		formatOptions.quality = parseInt(params.q);
		if (Number.isNaN(formatOptions.quality)) {
			return res.type('text').status(400).send(`Bad parameter: q`);
		}
	}

	const sharpPipe = sharp();
	pipeline.pipe(sharpPipe);
	pipeline = sharpPipe;

	pipeline.metadata().then((meta) => {
		if (postpone) {
			if (meta.hasAlpha) dstFormat = "png";
			else dstFormat = "jpeg";
		}
		if (dstFormat == "jpeg") {
			const jpegLen = response.headers['content-length'];
			if (jpegLen && jpegLen < 10000) formatOptions.optimizeScans = false;
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
			} catch(ex) {
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
			return pipeline.stats().then((stats) => {
				return sharp({
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
			});
		} else {
			return pipeline;
		}
	}).then((pipeline) => {
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
			} catch(ex) {
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

		pipeline.on('error', (err) => {
			res.type('text').status(500).send(`Response file error ${err.toString()}`);
		});

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

		pipeline.toFormat(dstFormat, formatOptions);
		pipeline.pipe(res);
	}).catch((err) => {
		response.req.abort();
		if (err.status) res.type('text').status(err.status).send(err.message);
		else next(err);
	});
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

module.exports.formats = formats;
module.exports.sharp = sharp;

