'use strict';

const knex = require('knex');

const logger = require('lllog')();
const QueryBuilder = require('@janiscommerce/query-builder');

const ConfigValidator = require('./config-validator');
const MySQLError = require('./mysql-error');
const Utils = require('./utils');

const CONNECTION_LIMIT = 10;
const DEFAULT_LIMIT = 500;
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 3306;
const DEFAULT_USER = 'root';
const DEFAULT_PASSWORD = '';

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

module.exports = class MySQL {

	static get defaultLimit() {
		return DEFAULT_LIMIT;
	}

	static get affectedRows() {
		return MYSQL_AFFECTED_ROWS_RESPONSE;
	}

	/**
	 * Constructor
	 * @param {object} config Database configuration.
	 */
	constructor(config) {

		ConfigValidator.validate(config);

		this.config = {
			host: config.host || DEFAULT_HOST,
			user: config.user || DEFAULT_USER,
			password: config.password || DEFAULT_PASSWORD,
			database: config.database || null,
			port: config.port || DEFAULT_PORT,
			connectionLimit: config.connectionLimit || CONNECTION_LIMIT,
			multipleStatements: true
		};
	}

	/* istanbul ignore next */
	get knex() {

		if(!this._knex) {
			this._knex = knex({
				client: 'mysql2',
				version: '8.0.0',
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
	*	@returns {Insert} ID
	*/
	async insert(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		try {

			const queryBuilder = new QueryBuilder(this.knex, model);
			// Insert could response with an Array with 0 value if Primary Key is not AutoIncremental
			// or Primary Key value if is ID and Integer and AutoIncremental
			const [result] = await queryBuilder.insert(item);

			return result || item.id;

		} catch(error) {
			throw new MySQLError(error.message, MySQLError.codes.INVALID_INSERT);
		}

	}

	/**
	 * Save a new items or update it in the SQL database.
	 * @param {instance} model Model Class Instance
	 * @param {object} item object to saved
	 * @returns {Integer} ID
	 */
	async save(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const [result] = await queryBuilder.save(item);

			// If ID is not Auto-Incremental 'insertId0 is 0 when insert. Anything else 'insertId' is ID inserted
			return result.insertId || item.id;

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
	*	@param {instance} model Model instance
	*	@param {object} values - The value to change
	*	@param {object} filters - The filters
	*	@returns {Promise<number>} number of rows updated
	*/
	async update(model, values, filters) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!values || !Object.keys(values).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		try {
			const queryBuilder = new QueryBuilder(this.knex, model);
			const result = await queryBuilder.update(values, filters);
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

		const pages = params.limit ? Math.ceil(result.count / params.limit) : 1;
		let page;

		// Control that page are not bigger than total pages
		if(!params.page)
			page = 1;
		else
			page = pages < params.page ? pages : params.page;

		return {
			total: result.count,
			page,
			pageSize: params.limit ? params.limit : this.constructor.defaultLimit,
			pages
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
	 * Multi remove by fields and values
	 * @async
	 * @param {Model} model Model instance
	 * @param {Array} params The fields to use in where clause, invalid fields will be ignored
	 * @returns {Number} number of rows deleted
	 */
	async multiRemove(model, params) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!Array.isArray(params))
			throw new MySQLError('Invalid fields', MySQLError.codes.INVALID_DATA);

		const promises = params.map(param => {
			return this.remove(model, param);
		});

		try {

			const result = await Promise.all(promises);
			return result.reduce((prev, current) => prev + current, 0);

		} catch(error) {
			throw error;
		}
	}
};
