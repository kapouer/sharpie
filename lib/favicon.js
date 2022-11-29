import Ico from "ico-endec";

export default async function(params, image, res) {
	const images = await Promise.all(params.sizes.map(size => {
		return image.clone().resize({
			fit: "contain",
			background: params.bg,
			width: size,
			height: size
		}).toFormat("png")
			.toBuffer({ resolveWithObject: true })
			.then(buf => buf.data);
	}));
	res.setHeader('Content-Type', 'image/x-icon');
	const buf = Ico.encode(images);
	res.send(buf);
}
