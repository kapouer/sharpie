
exports.params = function(signs, str) {
	var obj = {};
	if (str) str.split(signs.separator).forEach(function(str) {
		var couple = str.trim().split(signs.assignment);
		var val;
		if (couple.length == 2) {
			val = parseFloat(couple[1]);
			if (isNaN(val) || val.toString().length != couple[1].length) {
				throw new Error(couple[0]);
			}
		} else {
			val = true;
		}

		obj[couple[0]] = val;
	});
	return obj;
};

exports.resize = function(resize, w, h) {
	if (!resize || !resize.w && !resize.h && !resize.z) {
		resize = null;
	} else if (resize.z) {
		// if one of the dimensions is set, don't set the other one
		var zw = Math.round((resize.w || w) * resize.z / 100);
		var zh = Math.round((resize.h || h) * resize.z / 100);
		if (resize.w == null && resize.h == null) {
			resize.w = zw;
			resize.h = zh;
		} else {
			if (resize.w != null) resize.w = zw;
			if (resize.h != null) resize.h = zh;
		}
	}
	if (resize) {
		if (resize.w === 0) resize.w = null;
		if (resize.h === 0) resize.h = null;
		if (resize.max) resize.fit = "inside";
		if (resize.min) resize.fit = "outside";
	}
	return resize;
};

exports.extract = function(extract, w, h) {
	return {
		left: Math.min(Math.max(0, (extract.x - extract.w / 2) * w / 100), w),
		top: Math.min(Math.max(0, (extract.y - extract.h / 2) * h / 100), h),
		width: Math.max(Math.min(extract.w * w / 100, w), 0),
		height: Math.max(Math.min(extract.h * h / 100, h), 0)
	};
};

exports.hostname = function(hostname, opt) {
	var type = typeof opt;
	if (type == 'function') opt = opt(hostname);
	else if (Array.isArray(opt)) opt = ~opt.indexOf(hostname);
	else if (type == 'object') opt = opt[hostname];
	else if (type != 'boolean') throw new Error("Unhandled `hostnames` option type " + type);
	return !!opt;
};

