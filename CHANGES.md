# Changes

## 5.6.0

- sharp@0.34.1
- Bump deps
- refactor resize helper, improve exception error message
- test resize + extract behavior
- drop should
- support pnpm.onlyBuiltDependencies

## 5.5.0

- Bump deps
- try to fix an issue with streams (use pipe instead of pipeline)

## 5.4.0

- favicon contains only 48px image
- fix handling of errors when using param()
- update deps but not sharpie

## 5.3.0

Add params to `opts.param(req, params)` signature.

## 5.0.0

- sharp is no longer a peer dependency. Also use latest version 0.31.2.
- node >= 16
- throw HttpError
- get rid of got for runtime
- use imports
