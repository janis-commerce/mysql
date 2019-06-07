'use strict';

const mysql = require('mysql2/promise');
const { escape } = require('mysql2');
const knex = require('knex');

const logger = require('@janiscommerce/logger');
const QueryBuilder = require('@janiscommerce/query-builder');

const MySQLError = require('./mysql-error');
const Utils = require('./../utils');

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

	/**
	 * Returns a MySQL pool, if it didn't exist create one.
	 * @returns {object} MySQL pool instance
	 */
	get pool() {

		if(!this._pool)
			this._pool = mysql.createPool(this.config);

		return this._pool;
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

	_queryFormat(query, values) {

		if(!values)
			return query;

		return query.replace(/:(\w+)/g, (txt, key) => {
			if(values.hasOwnProperty(key))
				return escape(values[key]);

			return txt;
		});
	}

	/**
	 * Get the pool connection.
	 * @returns {Promise} Pool Promise Connection or MySQLError
	 */
	async getConnection() {

		try {

			const poolConnection = await this.pool.getConnection();
			poolConnection.connection.config.queryFormat = this._queryFormat.bind(this);
			this.constructor.connectionPool = poolConnection.connection;

			return poolConnection;

		} catch(error) {
			if(error.code === 'ER_CON_COUNT_ERROR')
				throw new MySQLError(error.code, MySQLError.codes.TOO_MANY_CONNECTION);

			throw new MySQLError(error.code || 'Database Error', MySQLError.codes.CONNECTION_ERROR);
		}

	}

	/**
	*	Map a field to it's DB column name
	*	@param {string} field - The field that will be mapped.
	*	@param {object} [map=this.fieldsMap] - The map
	*	@private
	*/
	_mapField(field, map) {
		if(typeof field === 'symbol')
			return field;

		let parsed = null;

		Object.entries(map || this.fieldsMap || {}).forEach(([key, value]) => {

			value = Array.isArray(value) ? value : [value];

			if(value.includes(field))
				parsed = key;
		});

		if(!parsed) {
			// Replace camel case to lower dash format.
			// E.g: camelCase => camel_case;
			// UpperCamelCase => upper_camel_case

			parsed = field.replace(/[A-Z]/g, (match, index) => (index !== 0 ? '_' : '') + match.toLowerCase());
		}

		return parsed;
	}

	/**
	*	Map each property to DB column name
	*	@param {object} item - The object that will be mapped
	*	@param {object} [map=this.fieldsMap] - The map
	*	@private
	*/
	_mapItem(item, map) {
		const fields = {};
		item = typeof item === 'undefined' ? {} : item;

		//	We use Reflect and not Object.entries/Keys
		//	because we want to keep Symbol properties
		Reflect.ownKeys(item).forEach(key => {
			const field = this._mapField(key, map);
			fields[field || key] = item[key];
		});

		return fields;
	}

	/**
	*	Map each propety in the collection to a valid DB collection
	*	@param {object/array} data - An array of objects, or an object.
	*	@param {object} [map=this.fieldsMap] - The map
	*
	*/
	_mapFields(data, map) {
		if(Array.isArray(data))
			return data.map(item => this._mapItem(item, map));

		return this._mapItem(data, map);

	}

	/**
     * Execute de Query in the database
     * @param {string} query Query to be executed, placeholders with :PARAM_NAME
     * @param {object} placeholders Object with key PARAM_NAME, value PARAM_VALUE, Default empty
	 * @returns {Promise} Resolve: RowsAffected, Reject: MySQLError
     */
	async _call(query, placeholders = {}) {

		try {

			const connection = await this.getConnection();
			const rows = await connection.query(query, placeholders);
			connection.release();
			return rows;

		} catch(error) {
			// Connections Limit
			if(error.code === MySQLError.codes.TOO_MANY_CONNECTION) { // Retry
				let retryFunction;
				setTimeout(retryFunction = () => this._call.apply(this, arguments), 500);
				return retryFunction();
			}
			// Other Connections Errors
			if(error.code === MySQLError.codes.CONNECTION_ERROR) {
				logger.error('Database', error.message);
				throw error;
			}
			// Query Errors
			logger.error('Query', error.errno, error.code, error.message);
			logger.debug(query, placeholders);
			throw new MySQLError(error.code, MySQLError.codes.INVALID_QUERY);
		}
	}

	/**
	 * Get the Fields from the model
	 * @param {class} model Model Class
	 */
	async _getFields(model) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		const table = model.getTable();
		const { dbname } = model;

		// _call returns an array with colummns in the first position and Schema information in the second
		const [rows] = await this._call(`SHOW COLUMNS FROM ${dbname}.${table}`);

		const fields = {};

		for(const field of rows)
			fields[field.Field] = field;

		return fields;
	}

	/**
	 * Generates joins string for queries
	 * @param {Array.<{table: String, type: String, alias: String, condition: String}>} joins - Array of shape [{ table, type, alias, condition }]
	 * @param {string} dbname Database Name
	 * @returns {string}
	 */
	_buildJoins(joins, dbname) {
		if(!joins || !Array.isArray(joins))
			return '';

		return joins.reduce((acc, { table, type = 'LEFT', alias, condition }) => {
			if(!/^(LEFT|RIGHT|INNER)$/.test(type))
				return acc;

			return `${acc} ${type} JOIN ${dbname}.${table} ${alias} ON ${condition}`;
		}, '');
	}

	/**
	 * Generate where and placeholders for a single field
	 *
	 * @param {string} field - The field
	 * @param {mixed} value - The field's value
	 * @return {object} { where, placeholders }
	 */
	static _buildFieldQuery(field, value, alias = '', suffix = '') {

		const where = [];
		const placeholders = {};

		const fieldKey = `${alias ? alias + '.' : ''}${field}`;

		if(value instanceof Array) {
			const queryIn = [];

			const hasNull = value.some(item => item === null);

			if(hasNull)
				value = value.filter(item => item !== null);

			for(let i = 0; i < value.length; i++) {

				const key = `${field}_${i}${suffix}`;

				placeholders[key] = value[i];
				queryIn.push(':' + key);

			}

			if(queryIn.length) {

				if(hasNull)
					where.push(`(${fieldKey} IS NULL OR ${fieldKey} IN (${queryIn.join(',')}))`);
				else where.push(`${fieldKey} IN (${queryIn.join(',')})`);
			}


		} else {

			const key = `${field}${suffix}`;

			placeholders[key] = value;

			if(value === null)
				where.push(`${fieldKey} IS NULL`);
			else where.push(`${fieldKey} = :${key}`);
		}

		return { where, placeholders };

	}

	/**
	 * Generate Where and placeholders to query with fields
	 *
	 * @param {class} Model Class
	 * @param {object} fields The fields
	 * @param {string} tableAlias
	 * @param {string} suffix
	 * @return {object} { where and placeholders }
	 */
	async _prepareFields(model, fields = {}, tableAlias = '', suffix = '') {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		let where = [];
		const placeholders = {};
		const { dbname } = model;

		const columns = fields[this.constructor.columns] || ['*'];

		const joins = this._buildJoins(fields[this.constructor.joins], dbname);

		if(!Object.keys(fields).length) {
			return {
				where,
				placeholders,
				columns,
				joins
			};
		}

		const tableFields = await this._getFields(model);

		fields = this._mapFields(fields);

		for(const [field, value] of Object.entries(fields)) {

			if(!tableFields[field] || value === undefined)
				continue;

			const { where: w, placeholders: ph } = this.constructor._buildFieldQuery(field, value, tableAlias, suffix);

			where = [...where, ...w];

			Object.assign(placeholders, ph);
		}

		return {
			where,
			placeholders,
			columns,
			joins
		};
	}

	/**
	*	Insert an item into the database
	*	@param {Class} model - Model Class
	*	@param {object} item - The item to insert
	*	@param {boolean} allowUpsert - If upsert is allowed
	*	@returns {number} Number of the ID inserted
	*/
	async insert(model, item, allowUpsert = false) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		const table = model.getTable();
		const { dbname } = model;

		const noUpdate = ['id', 'date_created'];
		const fields = [];
		const placeholders = {};
		const duplicateUpdate = [];

		const time = (Date.now() / 1000 | 0);

		const tableFields = await this._getFields(model);

		item = this._mapFields(item);

		if(!Object.keys(item).some(field => typeof tableFields[field] !== 'undefined'))
			throw new MySQLError('Insert must have fields', MySQLError.codes.EMPTY_FIELDS);

		if(tableFields.date_created)
			item.date_created = item.date_created || time;

		if(tableFields.date_modified)
			item.date_modified = time;

		if(tableFields.id)
			duplicateUpdate.push('id = LAST_INSERT_ID(id)');

		Object.entries(item).forEach(([key, value]) => {

			if(!tableFields[key])
				return true;

			fields.push(key);

			placeholders[key] = key === 'date_modified' ? time : value;

			if(!noUpdate.includes(key))
				duplicateUpdate.push(`${key} = VALUES(${key})`);

		});

		const duplicateStatement = `ON DUPLICATE KEY UPDATE
		${duplicateUpdate.join(',\n')}`;

		const statement = `INSERT INTO ${dbname}.${table} (${fields.join(', ')})
		VALUES (${fields.map(field => ':' + field).join(', ')})
		${allowUpsert ? duplicateStatement : ''}`;

		const [rows] = await this._call(statement, placeholders);

		return rows.insertId;
	}

	/**
	*	Update a row
	*	@param {object} item - The item to update
	*/
	async update(model, item) {

		if(!model)
			throw new MySQLError('Invalid or Empty Model', MySQLError.codes.INVALID_MODEL);

		const table = model.getTable();
		const { dbname } = model;

		const placeholders = {};

		const tableFields = await this._getFields(model);

		const fields = [];

		let where = [];
		let wherePlaceholders = {};

		item = this._mapFields(item);

		if(item[this.constructor.filters]) {

			const whereField = item[this.constructor.filters];

			({ where, placeholders: wherePlaceholders } = await this._prepareFields(model, whereField));

			Object.assign(placeholders, wherePlaceholders);
		}

		Object.entries(item).forEach(([key, value]) => {

			if(!tableFields[key])
				return true;

			const { Type: type } = tableFields[key];

			if(type === 'datetime' && value === true)
				return fields.push(`${key} = NOW()`);

			const placeholdersKey = `set_${key}`;

			fields.push(`${key} = :${placeholdersKey}`);

			placeholders[placeholdersKey] = value;

		});

		if(!fields.length)
			throw new MySQLError('Update must have fields', MySQLError.codes.EMPTY_FIELDS)		

		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

		const statement = `UPDATE ${dbname}.${table} SET ${fields.join(', ')} ${clause}`;

		const [rows] = await this._call(statement, placeholders);

		return rows.insertId;
	}

	/**
	 * Save a new item in the SQL database
	 * @param {Class} model Model Class
	 * @param {object} item object to saved
	 * @returns {number} Number of the ID of the item
	 */
	async save(model, item) {
		return this.insert(model, item, true);
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

		const queryBuilder = new QueryBuilder(this.knex, model, newParams);

		queryBuilder.build();

		const result = await queryBuilder.execute();

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

		const table = model.getTable();
		const { dbname } = model;

		const noUpdate = ['id', 'date_created'];
		const placeholders = {};
		const duplicateUpdate = [];
		const values = [];

		let fields;

		const tableFields = await this._getFields(model);

		if(tableFields.id)
			duplicateUpdate.push('id = LAST_INSERT_ID(id)');

		const time = Date.now() / 1000 | 0;

		for(let i = 0; i < items.length; i++) {

			const itemValues = [];

			items[i] = this._mapFields(items[i]);

			if(tableFields.date_created)
				items[i].date_created = items[i].date_created || time;

			if(tableFields.date_modified)
				items[i].date_modified = time;

			const keys = Object.keys(items[i]).sort();

			if(i === 0)
				fields = keys;

			for(const key of keys) {

				if(!tableFields[key])
					continue;

				const placeholdersKey = `${key}_${i}`;

				itemValues.push(`:${placeholdersKey}`);

				placeholders[placeholdersKey] = items[i][key];

				if(i === 0 && !noUpdate.includes(key))
					duplicateUpdate.push(`${key} = VALUES(${key})`);
			}

			if(!itemValues.length)
				throw new MySQLError('Values cannot be empty', MySQLError.codes.INVALID_STATEMENT);

			values.push(`(${itemValues.join(',')})`);

		}

		const statement = `INSERT INTO ${dbname}.${table} (${fields.join(',')})
			VALUES ${values.join(',\n')}
			ON DUPLICATE KEY UPDATE
			${duplicateUpdate.join(',\n')}`;

		const [rows] = await this._call(statement, placeholders);

		return !!rows.insertId;
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

		const table = model.getTable();
		const { dbname } = model;

		const {
			placeholders,
			where,
			joins
		} = await this._prepareFields(model, fields);

		const whereClause = `WHERE ${where.join(' AND ')}` // where.length ? `WHERE ${where.join(' AND ')}` : '';

		const joinsClause = joins || '';

		const statement = `DELETE FROM ${dbname}.${table}
			${whereClause}
			${joinsClause}`;

		return this._call(statement, placeholders);
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
