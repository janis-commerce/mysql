'use strict';

const mysql = require('mysql2');
const knex = require('knex');

const MySQLError = require('./mysql-error');

const { QueryBuilder } = require('./query-builder');

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

	static get connectionPool() {
		return this._connectionPool || {};
	}

	static set connectionPool(connection) {

		if(!this._connectionPool)
			this._connectionPool = {};

		this._connectionPool[connection.threadId] = {
			connection,
			lastActivity: (new Date() / 1000 | 0),
			id: connection.threadId
		};
	}

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
				logger.error('query', error);
			});
		}

		return this._knex;
	}

	async get(model, params) {

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

	async getTotals(model) {

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

	async getFields(model) {

		const table = model.getTable();
		const { dbname } = model;

		const rows = await this.call(`SHOW COLUMNS FROM ${dbname}.${table}`);

		const fields = {};

		for(const field of rows)
			fields[field.Field] = field;

		return fields;
	}

	async save(model, item) {
		return this.insert(model, item, true);
	}

	/**
	*	Insert/update a row
	*	@param {object} item - The item to insert
	*/

	async insert(model, item, allowUpsert = false) {

		const table = model.getTable();
		const { dbname } = model;

		const noUpdate = ['id', 'date_created'];
		const fields = [];
		const placeholders = {};
		const duplicateUpdate = [];

		const time = (Date.now() / 1000 | 0);

		const tableFields = await this.getFields(model);

		item = this.mapFields(item);

		if(!Object.keys(item).some(field => typeof tableFields[field] !== 'undefined')) {
			return Promise.reject(
				new MySQLError('Insert must have fields', MySQLError.codes.EMPTY_FIELDS)
			);
		}

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

		const rows = await this.call(statement, placeholders);

		return rows.insertId;
	}

	/**
	*	Update a row
	*	@param {object} item - The date to update
	*/

	async update(model, item) {

		const table = model.getTable();
		const { dbname } = model;

		const placeholders = {};

		const tableFields = await this.getFields(model);

		const fields = [];

		let where = [];
		let wherePlaceholders = {};

		item = this.mapFields(item);

		if(item[this.constructor.filters]) {

			const whereField = item[this.constructor.filters];

			({ where, placeholders: wherePlaceholders } = await this.prepareFields(model, whereField));

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

		if(!fields.length) {
			return Promise.reject(
				new MySQLError('Insert must have fields', MySQLError.codes.EMPTY_FIELDS)
			);
		}

		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

		const statement = `UPDATE ${dbname}.${table} SET ${fields.join(', ')} ${clause}`;

		return this.call(statement, placeholders);
	}

	/* istanbul ignore next */
	call(query, placeholders = {}) {
		return new Promise((resolve, reject) => {
			this.query(query, placeholders, (err, rows) => {
				if(err)
					reject(err);

				resolve(rows);
			});
		});
	}

	/* istanbul ignore next */
	query(statement, placeholders, callback) {

		this.pool.getConnection((connErr, connection) => {

			if(connErr) {

				if(connErr.code === 'ER_CON_COUNT_ERROR') // TOO MANY CONNECTIONS
					return setTimeout(() => this.query.apply(this, arguments), 500); // Retry

				if(typeof callback === 'function')
					callback(connErr);

				logger.error('Database', connErr);

				return;
			}

			connection.config.queryFormat = this.queryFormat.bind(this);

			this.constructor.connectionPool = connection;

			return connection.query(statement, placeholders, (err, rows) => {

				if(err) {
					logger.error('query', err.errno, err.code, err.message);
					logger.debug(statement, placeholders);
				}

				if(typeof callback === 'function')
					callback(err, rows);

				connection.release();
			});
		});
	}

	/**
	*	Perform a multi insert
	*	@param {array} items - The items to insert
	*	@param {string} [table=this.constructor.table] - The table
	*/

	async multiInsert(model, items) {

		if(!items || !items.length) {
			return Promise.reject(
				new MySQLError('Items are required', MySQLError.codes.EMPTY_FIELDS)
			);
		}

		const table = model.getTable();
		const { dbname } = model;

		const noUpdate = ['id', 'date_created'];
		const placeholders = {};
		const duplicateUpdate = [];
		const values = [];

		let fields;

		const tableFields = await this.getFields(model);

		if(tableFields.id)
			duplicateUpdate.push('id = LAST_INSERT_ID(id)');

		const time = Date.now() / 1000 | 0;

		for(let i = 0, len = items.length; i < len; i++) {

			const itemValues = [];

			items[i] = this.mapFields(items[i]);

			if(tableFields.date_created)
				items[i].date_created = items[i].date_created || time;

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

			if(!itemValues.length) {
				return Promise.reject(
					new MySQLError('Values cannot be empty', MySQLError.codes.INVALID_STATEMENT)
				);
			}

			values.push(`(${itemValues.join(',')})`);

		}

		const statement = `INSERT INTO ${dbname}.${table} (${fields.join(',')})
			VALUES ${values.join(',\n')}
			ON DUPLICATE KEY UPDATE
			${duplicateUpdate.join(',\n')}`;

		const rows = await this.call(statement, placeholders);

		return !!rows.insertId;
	}

	/**
	 * Remove by fields and value
	 *
	 * @param {object} model The model
	 * @param {object} fields The fields to use in where clause
	 * @return {Promise} { response from database }
	 */
	async remove(model, fields) {

		if(!Utils.isObject(fields)
			|| Utils.isEmptyObject(fields)) {
			return Promise.reject(
				new MySQLError('Invalid fields', MySQLError.codes.INVALID_DATA)
			);
		}

		const table = model.getTable();
		const { dbname } = model;

		const {
			placeholders,
			where,
			joins
		} = await this.prepareFields(model, fields);

		const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

		const joinsClause = joins || '';

		const statement = `DELETE FROM ${dbname}.${table}
			${whereClause}
			${joinsClause}`;

		return this.call(statement, placeholders);
	}

	/**
	 * Generate Where and placeholders to query with fields
	 *
	 * @param {object} fields The fields
	 * @param {string} table The table
	 * @return {object} { where and placeholders }
	 */
	async prepareFields(model, fields, tableAlias = '', suffix = '') {

		let where = [];
		const placeholders = {};

		const columns = fields[this.constructor.columns] || ['*'];

		const joins = this.buildJoins(fields[this.constructor.joins]);

		if(!Object.keys(fields).length) {
			return {
				where,
				placeholders,
				columns,
				joins
			};
		}

		const tableFields = await this.getFields(model);

		fields = this.mapFields(fields);

		for(const [field, value] of Object.entries(fields)) {

			if(!tableFields[field] || value === undefined)
				continue;

			const { where: w, placeholders: ph } = this.constructor.buildFieldQuery(field, value, tableAlias, suffix);

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
	 * Generates joins
	 * @param {Array.<{table: String, type: String, alias: String, condition: String}>} joins - Array of shape [{ table, type, alias, condition }]
	 * @returns {string}
	 */
	buildJoins(joins) {
		if(!joins || !Array.isArray(joins))
			return '';

		return joins.reduce((acc, { table, type = 'LEFT', alias, condition }) => {
			if(!/^(LEFT|RIGHT|INNER)$/.test(type))
				return acc;

			return `${acc} ${type} JOIN ${this.dbname}.${table} ${alias} ON ${condition}`;
		}, '');
	}

	/**
	 * Generate where and placeholders for a single field
	 *
	 * @param {string} field - The field
	 * @param {mixed} value - The field's value
	 * @return {object} { where, placeholders }
	 */

	static buildFieldQuery(field, value, alias = '', suffix = '') {

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
	*	Map each propety in the collection to a valid DB collection
	*	@param {object/array} data - An array of objects, or an object.
	*	@param {object} [map=this.fieldsMap] - The map
	*
	*/


	mapFields(data, map) {

		if(Array.isArray(data))
			return data.map(item => this.mapItem(item, map));

		return this.mapItem(data, map);

	}

	/**
	*	Map each property to DB column name
	*	@param {object} item - The object that will be mapped
	*	@param {object} [map=this.fieldsMap] - The map
	*	@private
	*/


	mapItem(item, map) {

		const fields = {};

		//	We use Reflect and not Object.entries/Keys
		//	because we want to keep Symbol properties
		Reflect.ownKeys(item).forEach(key => {
			const field = this.mapField(key, map);
			fields[field || key] = item[key];
		});

		return fields;
	}

	/**
	*	Map a field to it's DB column name
	*	@param {string} field - The field that will be mapped.
	*	@param {object} [map=this.fieldsMap] - The map
	*	@private
	*/

	mapField(field, map) {

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

	/* istanbul ignore next */
	getConnection() {
		return new Promise((resolve, reject) => {

			this.pool.getConnection((err, connection) => {
				if(err)
					reject(err);

				connection.config.queryFormat = this.queryFormat.bind(this);

				this.constructor.connectionPool = connection;

				resolve(connection);
			});

		});
	}

	/* istanbul ignore next */
	end() {
		return new Promise((resolve, reject) => {

			if(this.closeIddleConnectionsInterval)
				clearInterval(this.closeIddleConnectionsInterval);

			if(!this._pool)
				resolve();

			this.pool.end(err => {

				// all connections in the pool have ended
				if(err)
					return reject(err);

				resolve();
			});
		});
	}

	queryFormat(query, values) {
		if(!values)
			return query;

		return query.replace(/:(\w+)/g, (txt, key) => {

			if(values.hasOwnProperty(key))
				return mysql.escape(values[key]);

			return txt;
		});
	}

	shouldDestroyConnectionPool(lastActivity) {
		return !lastActivity || ((Date.now() / 1000 | 0) - lastActivity > this.constructor.maxIddleTimeout);
	}

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
						this.shouldDestroyConnectionPool(connectionPool.lastActivity)) {

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
