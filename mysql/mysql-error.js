'use strict';

class MySQLError extends Error {

	static get codes() {

		return {
			EMPTY_FIELDS: 1,
			INVALID_STATEMENT: 2,
			INVALID_DATA: 3
		};

	}

	constructor(err) {
		super(err);
		this.message = err.message || err;
		this.name = 'MySQLError';
	}
}

module.exports = MySQLError;
