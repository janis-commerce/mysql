'use strict';

const knex = require('knex');

const logger = require('@janiscommerce/logger');
const QueryBuilder = require('@janiscommerce/query-builder');

const MySQLError = require('./mysql-error');
const Utils = require('../utils');

const MAX_IDDLE_TIMEOUT = 60 * 5; // In seconds
const CONNECTION_LIMIT = 10;

const DEFAULT_LIMIT = 500;

class MySQL {

	static get defaultLimit() {
		return DEFAULT_LIMIT;
	}

	static get maxIddleTimeout() {
		return MAX_IDDLE_TIMEOUT;
	}

	static get filters() {
		return '_filters';
	}

	static get columns() {
		return '_columns';
	}

	static get joins() {
		return '_joins';
	}

	/**
	 * @returns {object} connection pool
	 */
	static get connectionPool() {
		return this._connectionPool || {};
	}

	/**
	 * Set a connection pool
	 * @param {object} connection Pool connection data
	 */
	static set connectionPool(connection) {

		if(!this._connectionPool)
			this._connectionPool = {};

		this._connectionPool[connection.threadId] = {
			connection,
			lastActivity: (new Date() / 1000 | 0),
			id: connection.threadId
		};
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
				logger.error('Query', error);
			});
		}

		return this._knex;
	}

	// ********************************************************************************************************************


	/**
	*	Insert an item into the database
	*	@param {Class} model - Model Class
	*	@param {object} item - The item to insert
	*	@param {boolean} allowUpsert - If upsert is allowed
	*	@returns {number} Number of the ID inserted
	*/
	async insert(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		const queryBuilder = new QueryBuilder(this.knex, model);
		const result = await queryBuilder.insert(item);
		return result;
	}

	/**
	*	Update a row
	*	@param {object} params - The item to update
	*/
	async update(model, params) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!params || !Object.keys(params).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		const filters = params[this.constructor.filters];

		delete params[this.constructor.filters];

		const queryBuilder = new QueryBuilder(this.knex, model);
		const result = await queryBuilder.update(params, filters);
		return result;
	}

	/**
	 * Save a new item in the SQL database
	 * @param {Class} model Model Class
	 * @param {object} item object to saved
	 * @returns {number} Number of the ID of the item
	 */
	async save(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!item || !Object.keys(item).length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS);

		const queryBuilder = new QueryBuilder(this.knex, model);
		const result = await queryBuilder.save(item);
		return result;
	}

	/**
	 * Search in the database.
	 *
	 * @param {Class} model Model Class
	 * @param {object} params object with the parametres to search.
	 * @returns {Promise} Array with the objects founds.
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

		const queryBuilder = new QueryBuilder(this.knex, model);

		const result = await queryBuilder.get(newParams);

		model.lastQueryEmpty = !result.length;

		return result;
	}

	/**
	 * Get the stadistics
	 * @param {class} model Model Class
	 * @returns {object} return Total of values, actual Page, Page Size and Total Pages
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
	*	Perform a multi insert
	*	@param {class} model Model Class
	*	@param {array} items - The items to insert
	*	@returns {boolean} True if success
	*/
	/* istanbul ignore next */
	async multiInsert(model, items) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!items || !items.length)
			throw new MySQLError('Items are required', MySQLError.codes.EMPTY_FIELDS);

		const queryBuilder = new QueryBuilder(this.knex, model);
		const result = await queryBuilder.save(items);
		return result;
	}

	/**
	 * Remove by fields and value
	 *
	 * @param {object} model The model
	 * @param {object} fields The fields to use in where clause, invalid fields will be ignore
	 * @return {Promise} { response from database }
	 */
	async remove(model, fields) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		if(!Utils.isObject(fields) || Utils.isEmptyObject(fields))
			throw new MySQLError('Invalid fields', MySQLError.codes.INVALID_DATA);

		const filters = fields[this.constructor.filters];
		const joins = fields[this.constructor.joins];

		const queryBuilder = new QueryBuilder(this.knex, model);
		const result = await queryBuilder.remove(filters, joins);
		return result;
	}

	/**
	 * Ends connections
	 * @returns {Promise} If error, else nothing
	 */
	/* istanbul ignore next */
	end() {

		if(this.closeIddleConnectionsInterval)
			clearInterval(this.closeIddleConnectionsInterval);

		if(!this._pool)
			return;

		this.pool.end(err => {
			// all connections in the pool have ended
			if(err)
				throw new MySQLError('All Pool Have Ended', MySQLError.codes.ALL_POOL_ENDED);
		});
	}

	/**
	 * Returns if the Connection is innactive
	 * @param {number} lastActivity Date of the last Activity
	 * @returns {boolean}
	 */
	_shouldDestroyConnectionPool(lastActivity) {
		return !lastActivity || ((Date.now() / 1000 | 0) - lastActivity > this.constructor.maxIddleTimeout);
	}

	/**
	 * Check for Iddle Connections and ends it.
	 */
	/* istanbul ignore next */
	closeIddleConnections() {

		if(this.closeIddleConnectionsInterval)
			return false;

		this.closeIddleConnectionsInterval = setInterval(() => {

			if(Utils.isEmptyObject(this.constructor.connectionPool))
				return;

			Object.values(this.constructor.connectionPool)
				.forEach(connectionPool => {

					if(connectionPool.connection &&
						this._shouldDestroyConnectionPool(connectionPool.lastActivity)) {

						logger.info(`Destroying connection: ${connectionPool.id}`);

						try {

							connectionPool.connection.destroy();

						} catch(e) {
							// Just in case.
						}

						delete this.constructor.connectionPool[connectionPool.id];
					}
				});

		}, 5000);

		return true;
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
