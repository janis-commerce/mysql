'use strict';

const MySQL = require('mysql2/promise');

const queryError = new Error('Invalid Error');
queryError.errno = 1206;
queryError.code = 'Invalid Query';

const validQueryManager = {
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
		return !!query.length;

	},
	getValidQueryResult(queryToFind) {
		return Object.values(this._queries).filter(element => element.query === queryToFind)[0].results;
	},
	cleanQueries() {
		if(this._queries)
			this._queries = null;
	}
};

MySQL.createPool = () => {
	return ({
		getConnection: async() => ({
			connection: {
				config: {}
			},
			async query(queryToResolve, placeholders) {
				const queryFormated = this.connection.config.queryFormat(queryToResolve, placeholders);
				if(!validQueryManager.isValidQuery(queryFormated))
					throw queryError;

				return validQueryManager.getValidQueryResult(queryFormated);
			},
			release: () => true
		})
	});
};

module.exports = {
	MySQL,
	validQueryManager
};
