'use strict';

const MySQL = require('mysql2/promise');

const queryError = new Error('Invalid Error');
queryError.errno = 1206;
queryError.code = 'Invalid Query';

MySQL.addValidQuery = function(query, resultExpected) {
	if(!this._queries)
		this._queries = {};
	this._queries[query] = resultExpected;
};

MySQL.isValidQuery = function(query) {
	return !!this._queries[query];
};

MySQL.getValidQueryResult = function(query) {
	return this._queries[query];
};

MySQL.createPool = () => {
	return ({
		getConnection: async() => ({
			connection: {
				addValidQuery(query, resultExpected) {
					if(!this._queries)
						this._queries = {};
					const count = Object.keys(this._queries).length + 1;
					this._queries[count] = {
						query,
						results: resultExpected
					};
				},
				isValidQuery(queryToFind) {
					if(!this._queries)
						return false;
					const query = Object.values(this._queries).filter(element => element.query === queryToFind);
					return !!query;

				},
				getValidQueryResult(queryToFind) {
					return Object.values(this._queries).filter(element => element.query === queryToFind)[0].results;
				},
				config: {},
				async query(queryToResolve, placeholders) {
					const queryFormated = this.config.queryFormat(queryToResolve, placeholders);
					if(!this.isValidQuery(queryFormated))
						throw queryError;

					return this.getValidQueryResult(queryFormated);
				},
				release: () => true
			}
		})
	});
};

module.exports = MySQL;
