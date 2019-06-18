'use strict';

class MySQLError extends Error {

	static get codes() {

		return {
			EMPTY_FIELDS: 1,
			INVALID_STATEMENT: 2,
			INVALID_MODEL: 3,
			INVALID_DATA: 4,
			INVALID_QUERY: 5,
			TOO_MANY_CONNECTION: 6,
			CONNECTION_ERROR: 7,
			ALL_POOL_ENDED: 8,
			EMPTY_ITEMS: 9
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
