'use strict';

class QueryBuilderError extends Error {

	constructor(err) {
		super(err);
		this.message = err.message || err;
		this.name = 'QueryBuilderError';
	}
}

module.exports = QueryBuilderError;
