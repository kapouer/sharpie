const icoEndec = require("ico-endec");

module.exports = function(params, image, res) {
	return Promise.all(params.sizes.map(size => {
		return image.clone().resize({
			fit: "contain",
			background: params.bg,
			width: size,
			height: size
		}).toFormat("png")
			.toBuffer({ resolveWithObject: true })
			.then(buf => buf.data);
	})).then(images => {
		res.setHeader('Content-Type', 'image/x-icon');
		const buf = icoEndec.encode(images);
		res.send(buf);
	});
};
