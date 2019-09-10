'use strict';

class MySQLConfigError extends Error {

	static get codes() {

		return {
			INVALID_CONFIG: 1,
			INVALID_SETTING: 2
		};

	}

	constructor(err, code) {
		super(err);
		this.message = err.message || err;
		this.code = code;
		this.name = 'MySQLConfigError';
	}
}

module.exports = MySQLConfigError;
