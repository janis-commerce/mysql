'use strict';

class MySQLError extends Error {

	static get codes() {

		return {
			EMPTY_FIELDS: 1,
			INVALID_STATEMENT: 2,
			INVALID_DATA: 3,
			TOO_MANY_CONNECTION: 4,
			CONNECTION_ERROR: 5,
			INVALID_QUERY
		};

	}

	constructor(err, code) {
		super(err);
		this.message = err.message || err;
		this.code = code;
		this.name = 'MySQLError';
	}
}

module.exports = MySQLError;
