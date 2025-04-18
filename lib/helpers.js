
import ColorString from 'color-string';
import HttpError from 'http-errors';

export function params(signs, str) {
	const obj = {};
	if (str) str.split(signs.separator).forEach((str) => {
		const couple = str.trim().split(signs.assignment);
		let val;
		if (couple.length == 2) {
			val = parseFloat(couple[1]);
			if (Number.isNaN(val) || val.toString().length != couple[1].length) {
				throw new Error(couple[0]);
			}
		} else {
			val = true;
		}

		obj[couple[0]] = val;
	});
	return obj;
}

export function resize(rs, w, h) {
	if (!rs) return;
	const resize = {};
	if (!rs.w && !rs.h && !rs.z) {
		// pass, will error out
	} else if (rs.z) {
		// if one of the dimensions is set, don't set the other one
		const zw = Math.round((rs.w || w) * rs.z / 100);
		const zh = Math.round((rs.h || h) * rs.z / 100);
		if (rs.w == null && rs.h == null) {
			resize.width = zw;
			resize.height = zh;
		} else {
			if (rs.w != null) resize.width = zw;
			if (rs.h != null) resize.height = zh;
		}
	} else {
		if (rs.w != null) resize.width = rs.w;
		if (rs.h != null) resize.height = rs.h;
	}

	if (resize.width <= 0) { // includes null
		throw new HttpError[400]("Bad parameter: rs:w");
	}
	if (resize.height <= 0) { // includes null
		throw new HttpError[400]("Bad parameter: rs:h");
	}
	if (rs.max) resize.fit = "inside";
	if (rs.min) resize.fit = "outside";
	resize.withoutEnlargement = !rs.enlarge;
	return resize;
}

export function extract(extract, w, h) {
	const left = Math.min(Math.max(0, (extract.x - extract.w / 2) * w / 100), w);
	const top = Math.min(Math.max(0, (extract.y - extract.h / 2) * h / 100), h);
	const width = Math.min(extract.w * w / 100, w - left);
	const height = Math.min(extract.h * h / 100, h - top);
	return {
		left, top, width, height
	};
}

export function hostname(hostname, opt) {
	const type = typeof opt;
	if (type == 'function') opt = opt(hostname);
	else if (Array.isArray(opt)) opt = opt.indexOf(hostname) >= 0;
	else if (type == 'object') opt = opt[hostname];
	else if (type != 'boolean') throw new Error("Unhandled `hostnames` option type " + type);
	return Boolean(opt);
}

export function color(str) {
	if (!str) str = "none";
	if (/^[0-9a-f]{3,8}$/i.test(str)) str = '#' + str;
	const color = ColorString.get(str);
	if (color == null) return;
	return ColorString.to.hex(color.value);
}
