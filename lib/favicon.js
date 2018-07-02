var spawn = require('child_process').spawn;

module.exports = function favicon(opts) {
	return {
		transform: function(params, stdin, stdout) {
			var cp = spawn(opts.im, [
				"-background", params.bg === false ? "none" : params.bg,
				"-",
				"-define", `icon:auto-resize=${opts.sizes}`,
				"ico:-"
			], {
				env: {},
				stdio: ['pipe', 'pipe', 'inherit']
			});
			stdin.pipe(cp.stdin);
			cp.stdout.pipe(stdout);
		}
	};
};
