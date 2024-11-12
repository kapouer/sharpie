if (!process.env.VIPS_WARNING) process.env.VIPS_WARNING = "0";
import sharp from 'sharp';

import http from 'http';
import https from 'https';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';


import ContentType from 'content-type';
import MediaTyper from 'media-typer';
import HttpError from 'http-errors';

import Debug from 'debug';
const debug = Debug('sharpie');

import * as helpers from './helpers.js';
import * as svg from './svg.js';
import favicon from './favicon.js';

export { default as sharp } from 'sharp';

export class Sharpie {
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
	static fileTypes = {
		jpeg: "image/jpeg",
		jpg: "image/jpeg",
		apng: "image/apng",
		png: "image/png",
		svg: "image/svg+xml",
		avif: "image/avif",
		webp: "image/webp",
		gif: "image/gif",
		ico: "image/x-icon"
	};

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
		sizes: '48',
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
		try {
			params.rs = helpers.params(opts.signs, params.rs);
		} catch (ex) {
			next(new HttpError[400](`Bad parameter: rs:${ex.message}`));
			return;
		}
		try {
			params.ex = helpers.params(opts.signs, params.ex);
		} catch (ex) {
			next(new HttpError[400](`Bad parameter: ex:${ex.message}`));
			return;
		}
		if (params.ex && (params.ex.x == null || params.ex.y == null || params.ex.w == null || params.ex.h == null)) {
			params.ex = null;
		}
		const dstFormat = params.format;
		if (dstFormat && !(dstFormat in Sharpie.formats.dst)) {
			next(new HttpError[400](`Unsupported image format ${dstFormat}`));
			return;
		}

		if (params.fg) {
			const color = helpers.color(params.fg);
			if (color == null) {
				next(new HttpError[400](`Bad parameter: fg`));
				return;
			} else {
				params.fg = color;
			}
		}
		const curHost = req.get('Host');
		if (typeof opts.param == "string") {
			const url = req.params[opts.param] ?? req.query[opts.param];
			if (!url) {
				next(new HttpError[400]("Missing url parameter"));
				return;
			}
			const urlObj = new URL(url, req.protocol + '://' + curHost + req.path);
			if (curHost != urlObj.host && !helpers.hostname(urlObj.hostname, opts.hostnames)) {
				next(new HttpError[403]("Hostname not allowed: " + urlObj.hostname));
				return;
			}
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				next(new HttpError[400]("Unsupported protocol: " + urlObj.protocol));
				return;
			}
			debug("loading", url);
			const agent = urlObj.protocol == "https:" ? https : http;
			const subReq = agent.request(urlObj, opts.https ?? {}, async subRes => {
				if (subRes.statusCode != 200) {
					subReq.destroy();
					next(new HttpError[subRes.statusCode](subRes.statusText));
				} else {
					try {
						await this.doPipe(subRes, req, res, params);
					} catch (err) {
						subReq.destroy();
						if (!['ERR_HTTP_HEADERS_SENT', 'ERR_STREAM_PREMATURE_CLOSE'].includes(err.code)) {
							next(err);
						}
					}
				}
			});
			subReq.on('error', next);
			subReq.end();
		} else if (typeof opts.param == "function") {
			let subRes;
			try {
				const subPath = await opts.param(req, params);
				subRes = createReadStream(subPath);
				subRes.headers = {
					'content-type': Sharpie.fileTypes[extname(subPath).slice(1)]
				};
				await this.doPipe(subRes, req, res, params);
			} catch (err) {
				if (subRes) subRes.destroy();
				if (err.code == 'ENOENT') {
					next(new HttpError[404]("File not found"));
				} else if (!['ERR_HTTP_HEADERS_SENT', 'ERR_STREAM_PREMATURE_CLOSE'].includes(err.code)) {
					next(err);
				}
			}
		}
	}

	async doPipe(response, req, res, params) {
		const { opts } = this;
		const { formats } = Sharpie;
		const contentType = response.headers['content-type'];
		debug("got content type", contentType);
		const typeObj = getType(contentType);
		if (typeObj.type != "image") {
			// eslint-disable-next-line no-console
			console.warn("Sharpie is supposed to process images, not", contentType);
			return pipeline(response, res);
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
			return pipeline(response, svg.transform(params), res);
		}
		if (dstFormat == "ico") {
			const sharpPipe = sharp();
			const sizes = (params.sizes ?? opts.sizes).split(',')
				.map(x => Number.parseInt(x));
			const bg = helpers.color(params.bg);
			const p = favicon({ sizes, bg }, sharpPipe, res);
			await pipeline(response, sharpPipe);
			return p;
		}
		if (!(srcFormat in formats.src && dstFormat in formats.dst)) {
			return pipeline(response, res);
		}

		if (params.q) {
			formatOptions.quality = parseInt(params.q);
			if (Number.isNaN(formatOptions.quality)) {
				throw new HttpError[400](`Bad parameter: q`);
			}
		}
		let sharpPipe = sharp();
		await pipeline(response, sharpPipe);

		const meta = await sharpPipe.metadata();
		sharpPipe.rotate(); // auto-rotate
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

		let w = meta.width;
		let h = meta.height;
		if (params.ex) {
			const exOpts = helpers.extract(params.ex, w, h);
			for (const k in exOpts) exOpts[k] = Math.round(exOpts[k]);
			w = exOpts.width;
			h = exOpts.height;
			if (!w || !h) {
				throw new HttpError[400]("Bad parameter: ex:w,h");
			}
			debug("ex", exOpts);
			sharpPipe.extract(exOpts);
		}
		if (params.bg) {
			debug("bg", params.bg);
		}
		if (params.flatten) {
			debug("flatten", params.flatten);
			try {
				const flattenOpts = {};
				if (params.bg) flattenOpts.background = params.bg;
				sharpPipe.flatten(flattenOpts);
			} catch (ex) {
				throw new HttpError[400](
					ex.message.startsWith('Unable to parse color from string:') ?
						"Bad parameter: bg" : ex.message
				);
			}
		}
		const resize = helpers.resize(params.rs, w, h);
		if (resize && (resize.w == 0 || resize.h == 0 || resize.z == 0)) {
			throw new HttpError[400]("Bad parameter: rs:w,h");
		}
		if (params.mean !== undefined) {
			if (dstFormat == "png") {
				Object.assign(formatOptions, {
					palette: true,
					colors: 2,
					quality: 0
				});
			}
			const stats = await sharpPipe.stats();
			sharpPipe = sharp({
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

		if (params.rs) {
			debug("resize", params.rs);
			const resize = {
				width: params.rs.w,
				height: params.rs.h,
				fit: params.rs.fit,
				withoutEnlargement: !params.rs.enlarge
			};
			if (params.bg) resize.background = params.bg;
			try {
				sharpPipe.resize(resize);
			} catch (ex) {
				throw new HttpError[400](
					ex.message.startsWith('Unable to parse color from string:') ?
						"Bad parameter: bg" : ex.message
				);
			}

			if (params.crop) {
				debug("crop", params.crop);
				sharpPipe.crop(params.crop);
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
				smartSubsample: true, // useful for lossy webp
				reductionEffort: 2
			});
		}

		sharpPipe.toFormat(dstFormat, formatOptions);
		if (res.headersSent || res.closed || res.destroyed) {
			return;
		}
		res.setHeader('Content-Type', MediaTyper.format({
			type: 'image',
			subtype: dstFormat
		}));
		await pipeline(sharpPipe, res);
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

export function sharpie(opts) {
	const sharpie = new Sharpie(opts);
	return (req, res, next) => sharpie.mw(req, res, next);
}
