'use strict';

const mysql = require('mysql2/promise');
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
	_queryFormat(query, values) {
		if(!values)
			return query;

		return query.replace(/:(\w+)/g, (txt, key) => {
			if(values.hasOwnProperty(key))
				return mysql.escape(values[key]);

			return txt;
		});
	}

	/**
	 * Async
	 * @returns {Promise} MySQL connection
	 */
	getConnection() {
		return new Promise(async(resolve, reject) => {

			try {

				const { connection } = await this.pool.getConnection();
				connection.config.queryFormat = this._queryFormat.bind(this);
				this.constructor.connectionPool = connection;
				resolve(await this.pool.getConnection());

			} catch(error) {
				reject(error);
			}
		});
	}

	/**
     * Execute de Query in the database
     * @param {String} query Query to be executed
     * @param {*} placeholders
     */
	_call(query, placeholders = {}) {
		return new Promise(async(resolve, reject) => {
			try {
				const connection = await this.getConnection();
				const rowsAffected = await connection.query(query, placeholders);
				connection.release();
				resolve(rowsAffected);
				/* connection.query(query, placeholders, (err, rows) => {

					if(err) {
						logger.error('query', err.errno, err.code, err.message);
						logger.debug(query, placeholders);
						reject(err);
					}

					connection.release();
					resolve(rows);
				}); */

			} catch(error) {
				if(error.code === 'ER_CON_COUNT_ERROR') // Too Many Connections
					return setTimeout(() => this._call.apply(this, arguments), 500); // Retry

				logger.error('Database', error.message);
				reject(error);

			}
		});
	}


}

module.exports = MySQL;
