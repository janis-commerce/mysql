'use strict';

module.exports = {
	'./**/*.js': filesPaths => ([
		`eslint --fix ${filesPaths.join(' ')}`,
		'npm run test --silent'
	]),
	// Defined as a function to avoid filenames to be passed to the commands
	'./schemas/src/**/*.yml': () => ([
		'npm run build --silent',
		'npm run validate-schema --silent'
	]),
	// Defined as a function to avoid filenames to be passed to the commands
	'./view-schemas/**/*.yml': () => ([
		'npm run view-schemas-validate --silent'
	])
};
