'use strict';

module.exports = class MySQLError extends Error {

	static get codes() {

		return {
			INVALID_MODEL: 1,
			INVALID_INSERT: 2,
			INVALID_SAVE: 3,
			INVALID_UPDATE: 4,
			INVALID_MULTI_INSERT: 5,
			INVALID_REMOVE: 6,
			EMPTY_FIELDS: 7
		};

	}

	constructor(err, code) {
		super(err);
		this.message = err.message || err;
		this.code = code;
		this.name = 'MySQLError';
	}
};
