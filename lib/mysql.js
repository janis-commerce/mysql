'use strict';

const knex = require('knex');

const logger = require('@janiscommerce/logger');
const QueryBuilder = require('@janiscommerce/query-builder');

const MySQLError = require('./mysql-error');
const Utils = require('../utils');

const CONNECTION_LIMIT = 10;
const DEFAULT_LIMIT = 500;

// QueryBuilder uses Knex 0.16.* returns [0] if Insert is OK
const MYSQL_KNEX_INSERT_RESPONSE_OK = 0;

/* QueryBuilder uses Knex Raw in Save and Removed methods
 * Knex Raw Response with MySql2 module look like this:
 *  [
 *		{
 *			fieldCount: [number],
 *	 		insertId: [number], // if rows was updated show the id, if rows was inserted show 0
 *		  	affectedRows: [number], // (number of rows inserted/removed) + (number of rows updated) * 2
 * 			info: [string], // example: 'Records: 1, Duplicates: 1, Warning: 0'
 *			serverStatus: [number], // normally is 2
 *          warningStatus: [number]
 * 		},
 *		undefined
 *	]
 */

const MYSQL_AFFECTED_ROWS_RESPONSE = 'affectedRows';

class MySQL {

	static get defaultLimit() {
		return DEFAULT_LIMIT;
	}

	static get insertResponse() {
		return MYSQL_KNEX_INSERT_RESPONSE_OK;
	}

	static get affectedRows() {
		return MYSQL_AFFECTED_ROWS_RESPONSE;
	}

	/**
	 * Constructor
	 * @param {object} config Database configuration.
	 */
	constructor(config) {
		this.config = {
			host: config.host,
			user: config.user,
			password: config.password,
			database: config.database || null,
			port: config.port,
			connectionLimit: config.connectionLimit || CONNECTION_LIMIT,
			multipleStatements: true,
			prefix: config.prefix || ''
		};
	}

	/* istanbul ignore next */
	get knex() {

		if(!this._knex) {
			this._knex = knex({
				client: 'mysql2',
				version: '1.5.2',
				connection: this.config,
				pool: { min: 0, max: this.config.connectionLimit },
				wrapIdentifier: (value, origImpl) => origImpl(Utils.convertToSnakeCase(value)),
				postProcessResponse: result => (Array.isArray(result) ? result.map(Utils.convertKeysToCamelCase) : Utils.convertKeysToCamelCase(result))
			}).on('query-error', error => {
				logger.error('Knex - MySQL ', error.message);
			});
		}

		return this._knex;
	}

	/**
	*	Insert an item into the database
	*	@param {instance} model - Model instance
	*	@param {object} item - The item to insert
	*	@returns {Promise<boolean>} True if success
	*/
	async insert(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		try {

			const queryBuilder = new QueryBuilder(this.knex, model);
			const [result] = await queryBuilder.insert(item);
			return result === this.constructor.insertResponse;

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_INSERT);
		}

	}

	/**
	 * Save a new items or update it in the SQL database.
	 * @param {instance} model Model Class Instance
	 * @param {object} item object to saved
	 * @returns {Promise<boolean>} True if success
	 */
	async save(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const [result] = await queryBuilder.save(item);

			return !!result[this.constructor.affectedRows];

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_SAVE);
		}
	}

	/**
	*	Perform a multi insert
	*	@param {instance} model Model instance
	*	@param {array} items - The items to insert
	*	@returns {Promise<number>} number of affected rows
	*/
	async multiInsert(model, items) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!items || !items.length)
			throw new MySQLError('Items are required', MySQLError.codes.EMPTY_FIELDS);

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const [result] = await queryBuilder.save(items);

			return result[this.constructor.affectedRows];

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_MULTI_INSERT);
		}
	}


	/**
	*	Update a row
	*	@param {object} params - The value to change and the filters
	*	@returns {Promise<number>} number of rows updated
	*/
	async update(model, params) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!params || !Object.keys(params).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		const { fields, filters } = params;

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const result = await queryBuilder.update(fields, filters);
			// QueryBuilder/Knex response are the number of rows updated
			return result;

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_UPDATE);
		}
	}


	/**
	 * Search in the database.
	 *
	 * @param {Class} model Model Class
	 * @param {object} params object with the parametres to search.
	 * @returns {Promise<array>} Array with the objects founds.
	 */
	async get(model, params = {}) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		const newParams = { ...params }; // necesario para no alterar params y no afectar a las keys de cache

		if(!newParams.totals) {

			if(!newParams.limit)
				newParams.limit = this.constructor.defaultLimit;

			model.totalsParams = newParams;

		} else
			delete newParams.totals;

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);

			const result = await queryBuilder.get(newParams);
			model.lastQueryEmpty = !result.length;

			return result;

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_GET);
		}
	}

	/**
	 * Get the stadistics
	 * @param {class} model Model Class
	 * @returns {Promise<object>} return Total of values, actual Page, Page Size and Total Pages
	 */
	async getTotals(model) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(model.lastQueryEmpty)
			return { total: 0, pages: 0 };

		const params = model.totalsParams || {};

		const [result] = await this.get(model, {
			...params,
			totals: true,
			fields: false,
			count: true,
			page: 1,
			limit: 1
		});

		return {
			total: result.count,
			page: params.page ? params.page : 1,
			pageSize: params.limit ? params.limit : this.constructor.defaultLimit,
			pages: params.limit ? Math.ceil(result.count / params.limit) : 1
		};
	}

	/**
	 * Remove by fields and value
	 *
	 * @param {object} model The model
	 * @param {object} params The fields to use in where clause, invalid fields will be ignore
	 * @return {Promise<number>} number of rows deleted
	 */
	async remove(model, params) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!Utils.isObject(params) || Utils.isEmptyObject(params))
			throw new MySQLError('Invalid fields', MySQLError.codes.INVALID_DATA);

		const { filters, joins } = params;

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const [result] = await queryBuilder.remove(filters, joins);

			return result[this.constructor.affectedRows];

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_REMOVE);
		}

	}

	/**
	 * No need to create indexes in this Database
	 */
	/* istanbul ignore next */
	async createIndexes() {
		return true;
	}
}

module.exports = MySQL;
